import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { decodeEventLog, parseAbiItem, Log, PublicClient } from "viem";
import { PrismaService } from "../prisma/prisma.service";
import { ChainService } from "../chain/chain.service";
import { AppConfigService } from "../config/app-config.service";
import { taikoInboxAbi } from "../chain/taikoInboxAbi";
import { ProofClassifierService } from "./proof-classifier.service";
import { StatsService } from "../stats/stats.service";
import { ProofSystem, TeeVerifier } from "@taikoproofs/shared";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const batchProposedEvent = parseAbiItem(
  "event BatchProposed((bytes32,(uint16,uint8,bytes32[])[],bytes32[],bytes32,address,uint64,uint64,uint32,uint32,uint32,uint64,uint64,uint64,bytes32,(uint8,uint8,uint32,uint64,uint32)) info,(bytes32,address,uint64,uint64) meta,bytes txList)"
);
const batchesProvedEvent = parseAbiItem(
  "event BatchesProved(address verifier,uint64[] batchIds,(bytes32 parentHash,bytes32 blockHash,bytes32 stateRoot)[] transitions)"
);
const batchesVerifiedEvent = parseAbiItem(
  "event BatchesVerified(uint64 batchId,bytes32 blockHash)"
);
const conflictingProofEvent = parseAbiItem(
  "event ConflictingProof(uint64 batchId,(bytes32 parentHash,bytes32 blockHash,bytes32 stateRoot,address prover,bool inProvingWindow,uint48 createdAt) oldTran,(bytes32 parentHash,bytes32 blockHash,bytes32 stateRoot) newTran)"
);

type GetLogsEvent = NonNullable<
  NonNullable<Parameters<PublicClient["getLogs"]>[0]> extends { event?: infer E }
    ? E
    : never
>;

@Injectable()
export class IndexerService {
  private readonly logger = new Logger(IndexerService.name);
  private logRangeLimit?: bigint;
  private lastVerifiedBatchId: bigint = 0n;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chain: ChainService,
    private readonly config: AppConfigService,
    private readonly classifier: ProofClassifierService,
    private readonly stats: StatsService
  ) {
    if (this.config.indexerLogRangeLimit) {
      this.logRangeLimit = BigInt(this.config.indexerLogRangeLimit);
    }
  }

  async runIndexing(): Promise<{ fromBlock: bigint; toBlock: bigint; processed: number }> {
    const client = this.chain.getClient();
    const latestBlock = await client.getBlockNumber();
    const safeBlock =
      latestBlock > BigInt(this.config.confirmations)
        ? latestBlock - BigInt(this.config.confirmations)
        : latestBlock;

    const startBlock = this.config.startBlock ?? Number(safeBlock);
    const lock = await this.acquireIndexingLock(BigInt(startBlock));
    if (!lock) {
      this.logger.warn("Indexing already running; skipping this run.");
      return { fromBlock: BigInt(startBlock), toBlock: safeBlock, processed: 0 };
    }

    const { lockId, lastProcessedBlock } = lock;
    const fromBlock =
      lastProcessedBlock > BigInt(this.config.reorgBuffer)
        ? lastProcessedBlock - BigInt(this.config.reorgBuffer)
        : BigInt(startBlock);

    const chunkSize = BigInt(this.config.indexerChunkSize);

    if (safeBlock <= fromBlock) {
      this.logger.log("No new blocks to index");
      await this.releaseIndexingLock(lockId, "success");
      return { fromBlock, toBlock: safeBlock, processed: 0 };
    }

    let processed = 0;
    const totalRanges = (safeBlock - fromBlock) / chunkSize + 1n;
    let rangeIndex = 1n;
    const runStartedAt = Date.now();

    try {
      this.logger.log(
        `Indexing ${totalRanges.toString()} range(s) from ${fromBlock} to ${safeBlock} (chunk ${chunkSize}).`
      );

      for (let cursor = fromBlock; cursor <= safeBlock; cursor += chunkSize) {
        const toBlock = cursor + chunkSize - 1n > safeBlock ? safeBlock : cursor + chunkSize - 1n;
        const rangeStartedAt = Date.now();
        this.logger.log(
          `Processing range ${rangeIndex.toString()}/${totalRanges.toString()}: ${cursor} -> ${toBlock}.`
        );
        const processedInRange = await this.processRange(cursor, toBlock);
        processed += processedInRange;

        const rangeDurationSeconds = ((Date.now() - rangeStartedAt) / 1000).toFixed(1);
        this.logger.log(
          `Processed range ${cursor} -> ${toBlock}: ${processedInRange} event(s) in ${rangeDurationSeconds}s.`
        );

        await this.checkpointIndexingProgress(lockId, toBlock);

        rangeIndex += 1n;
      }

      const statsStartedAt = Date.now();
      await this.checkpointIndexingProgress(lockId, safeBlock);
      await this.stats.refreshDailyStats(this.config.statsLookbackDays);
      this.logger.log(
        `Stats refresh (${this.config.statsLookbackDays} days) in ${this.formatDuration(
          statsStartedAt
        )}.`
      );

      const runDurationSeconds = ((Date.now() - runStartedAt) / 1000).toFixed(1);
      this.logger.log(
        `Indexing run complete: processed ${processed} event(s) in ${runDurationSeconds}s.`
      );

      await this.releaseIndexingLock(lockId, "success");
      return { fromBlock, toBlock: safeBlock, processed };
    } catch (error) {
      await this.releaseIndexingLock(lockId, "failed", error);
      throw error;
    }
  }

  private async processRange(fromBlock: bigint, toBlock: bigint): Promise<number> {
    const rangeLabel = `${fromBlock} -> ${toBlock}`;
    const rollbackStartedAt = Date.now();
    const rollbackStats = await this.rollbackRange(fromBlock, toBlock);
    this.logger.log(
      `Range ${rangeLabel} rollback: ${rollbackStats.proofs} proofs, ${rollbackStats.verified} verified batches, ${rollbackStats.reconciled} reconciled in ${this.formatDuration(
        rollbackStartedAt
      )}.`
    );

    const resetStartedAt = Date.now();
    await this.resetVerificationCursor(fromBlock);
    this.logger.log(
      `Range ${rangeLabel} reset verification cursor in ${this.formatDuration(resetStartedAt)}.`
    );

    const client = this.chain.getClient();
    const proposedLogs = await this.fetchLogsWithTiming(
      "BatchProposed",
      batchProposedEvent,
      fromBlock,
      toBlock
    );
    const provedLogs = await this.fetchLogsWithTiming(
      "BatchesProved",
      batchesProvedEvent,
      fromBlock,
      toBlock
    );
    const verifiedLogs = await this.fetchLogsWithTiming(
      "BatchesVerified",
      batchesVerifiedEvent,
      fromBlock,
      toBlock
    );
    const conflictingLogs = await this.fetchLogsWithTiming(
      "ConflictingProof",
      conflictingProofEvent,
      fromBlock,
      toBlock
    );

    const blockTimestampCache = new Map<string, Date>();

    const getBlockTimestamp = async (blockNumber: bigint) => {
      const key = blockNumber.toString();
      const cached = blockTimestampCache.get(key);
      if (cached) {
        return cached;
      }

      const block = await client.getBlock({ blockNumber });
      const date = new Date(Number(block.timestamp) * 1000);
      blockTimestampCache.set(key, date);
      return date;
    };

    const proposedStartedAt = Date.now();
    for (const log of proposedLogs) {
      await this.handleBatchProposed(log, getBlockTimestamp);
    }
    this.logger.log(
      `Range ${rangeLabel} handled ${proposedLogs.length} BatchProposed log(s) in ${this.formatDuration(
        proposedStartedAt
      )}.`
    );

    const provedStartedAt = Date.now();
    for (const log of provedLogs) {
      await this.handleBatchesProved(log, getBlockTimestamp);
    }
    this.logger.log(
      `Range ${rangeLabel} handled ${provedLogs.length} BatchesProved log(s) in ${this.formatDuration(
        provedStartedAt
      )}.`
    );

    const verifiedStartedAt = Date.now();
    for (const log of verifiedLogs) {
      await this.handleBatchesVerified(log, getBlockTimestamp);
    }
    this.logger.log(
      `Range ${rangeLabel} handled ${verifiedLogs.length} BatchesVerified log(s) in ${this.formatDuration(
        verifiedStartedAt
      )}.`
    );

    const conflictingStartedAt = Date.now();
    for (const log of conflictingLogs) {
      await this.handleConflictingProof(log);
    }
    this.logger.log(
      `Range ${rangeLabel} handled ${conflictingLogs.length} ConflictingProof log(s) in ${this.formatDuration(
        conflictingStartedAt
      )}.`
    );

    return (
      proposedLogs.length +
      provedLogs.length +
      verifiedLogs.length +
      conflictingLogs.length
    );
  }

  private async rollbackRange(
    fromBlock: bigint,
    toBlock: bigint
  ): Promise<{ proofs: number; verified: number; reconciled: number }> {
    const proofsInRange = await this.prisma.batchProof.findMany({
      where: {
        provenBlock: {
          gte: fromBlock,
          lte: toBlock
        }
      },
      select: { batchId: true }
    });

    const verifiedInRange = await this.prisma.batch.findMany({
      where: {
        verifiedBlock: {
          gte: fromBlock,
          lte: toBlock
        }
      },
      select: { batchId: true }
    });

    const affectedBatchIds = new Set<bigint>([
      ...proofsInRange.map((row) => row.batchId),
      ...verifiedInRange.map((row) => row.batchId)
    ]);

    await this.prisma.batchProof.deleteMany({
      where: {
        provenBlock: {
          gte: fromBlock,
          lte: toBlock
        }
      }
    });

    await this.prisma.batch.updateMany({
      where: {
        provenBlock: {
          gte: fromBlock,
          lte: toBlock
        }
      },
      data: {
        status: "proposed",
        provenAt: null,
        provenBlock: null,
        proofTxHash: null,
        proofSystems: { set: [] },
        teeVerifiers: { set: [] },
        verifierAddress: null,
        transitionParentHash: null,
        transitionBlockHash: null,
        transitionStateRoot: null
      }
    });

    await this.prisma.batch.updateMany({
      where: {
        verifiedBlock: {
          gte: fromBlock,
          lte: toBlock
        }
      },
      data: {
        verifiedAt: null,
        verifiedBlock: null,
        verifiedTxHash: null
      }
    });

    for (const batchId of affectedBatchIds) {
      await this.reconcileBatch(batchId);
    }

    return {
      proofs: proofsInRange.length,
      verified: verifiedInRange.length,
      reconciled: affectedBatchIds.size
    };
  }

  private async reconcileBatch(batchId: bigint) {
    const batch = await this.prisma.batch.findUnique({ where: { batchId } });
    if (!batch) {
      return;
    }

    const proofs = await this.prisma.batchProof.findMany({
      where: { batchId },
      orderBy: { provenAt: "asc" }
    });

    if (!proofs.length) {
      await this.prisma.batch.update({
        where: { batchId },
        data: {
          status: batch.verifiedAt ? "verified" : "proposed",
          proofSystems: { set: [] },
          teeVerifiers: { set: [] },
          proofTxHash: null,
          verifierAddress: null,
          provenAt: null,
          provenBlock: null,
          transitionParentHash: null,
          transitionBlockHash: null,
          transitionStateRoot: null
        }
      });
      return;
    }

    const verifiedProof = proofs.find((proof) => proof.isVerified);
    const selectedProof = verifiedProof ?? proofs[0];

    await this.prisma.batch.update({
      where: { batchId },
      data: {
        status: batch.verifiedAt ? "verified" : "proven",
        proofSystems: { set: selectedProof.proofSystems },
        teeVerifiers: { set: selectedProof.teeVerifiers },
        proofTxHash: selectedProof.proofTxHash,
        verifierAddress: selectedProof.verifierAddress,
        provenAt: selectedProof.provenAt,
        provenBlock: selectedProof.provenBlock,
        transitionParentHash: selectedProof.transitionParentHash,
        transitionBlockHash: selectedProof.transitionBlockHash,
        transitionStateRoot: selectedProof.transitionStateRoot
      }
    });
  }

  private async handleBatchProposed(
    log: Log,
    getBlockTimestamp: (blockNumber: bigint) => Promise<Date>
  ) {
    const decoded = decodeEventLog({
      abi: taikoInboxAbi,
      data: log.data,
      topics: log.topics
    });

    const { info, meta } = decoded.args as {
      info: { proposedIn: bigint };
      meta: { batchId: bigint; proposedAt: bigint; proposer: string };
    };

    const batchId = BigInt(meta.batchId);
    const proposedAt = new Date(Number(meta.proposedAt) * 1000);
    const proposedBlock = BigInt(info.proposedIn);
    const proposer = meta.proposer.toLowerCase();
    const proposedTxHash = log.transactionHash ?? null;

    let normalizedProposedAt = proposedAt;
    if (log.blockNumber) {
      const blockTimestamp = await getBlockTimestamp(log.blockNumber);
      if (proposedAt > blockTimestamp) {
        this.logger.warn(
          `Batch ${batchId} proposedAt is ahead of block timestamp, using on-chain timestamp`
        );
        normalizedProposedAt = blockTimestamp;
      }
    }

    await this.prisma.batch.upsert({
      where: { batchId },
      create: {
        batchId,
        proposedAt: normalizedProposedAt,
        proposedBlock,
        proposedTxHash,
        proposer,
        status: "proposed",
        isLegacy: false
      },
      update: {
        proposedAt: normalizedProposedAt,
        proposedBlock,
        proposer,
        ...(proposedTxHash ? { proposedTxHash } : {}),
        isLegacy: false
      }
    });

    if (!log.blockNumber) {
      return;
    }
  }

  private async handleBatchesProved(
    log: Log,
    getBlockTimestamp: (blockNumber: bigint) => Promise<Date>
  ) {
    if (!log.blockNumber || !log.transactionHash) {
      return;
    }

    const decoded = decodeEventLog({
      abi: taikoInboxAbi,
      data: log.data,
      topics: log.topics
    });

    const { verifier, batchIds, transitions } = decoded.args as {
      verifier: string;
      batchIds: bigint[];
      transitions: { parentHash: string; blockHash: string; stateRoot: string }[];
    };
    const normalizedVerifier = verifier.toLowerCase();

    const tx = await this.chain.getClient().getTransaction({
      hash: log.transactionHash
    });

    const proofData = this.classifier.extractProofData(tx.input as `0x${string}`);
    const { proofSystems, teeVerifiers } = await this.classifier.classifyProof(
      normalizedVerifier,
      proofData
    );
    const provenAt = await getBlockTimestamp(log.blockNumber);
    const provenBlock = log.blockNumber;

    for (let i = 0; i < batchIds.length; i += 1) {
      const batchId = BigInt(batchIds[i]);
      const transition = transitions[i];

      const { matchesVerified } = await this.applyProofToBatch(
        batchId,
        log.transactionHash,
        proofSystems,
        teeVerifiers,
        normalizedVerifier,
        {
          provenAt,
          provenBlock: BigInt(provenBlock),
          transitionParentHash: transition.parentHash,
          transitionBlockHash: transition.blockHash,
          transitionStateRoot: transition.stateRoot
        }
      );

      const proofUpdate = {
        proofSystems: { set: proofSystems },
        teeVerifiers: { set: teeVerifiers },
        provenAt,
        provenBlock: BigInt(provenBlock),
        transitionParentHash: transition.parentHash,
        transitionBlockHash: transition.blockHash,
        transitionStateRoot: transition.stateRoot,
        ...(matchesVerified ? { isVerified: true } : {})
      };

      await this.prisma.batchProof.upsert({
        where: {
          batchId_proofTxHash: {
            batchId,
            proofTxHash: log.transactionHash
          }
        },
        create: {
          batchId,
          verifierAddress: normalizedVerifier,
          proofSystems,
          teeVerifiers,
          proofTxHash: log.transactionHash,
          provenAt,
          provenBlock: BigInt(provenBlock),
          transitionParentHash: transition.parentHash,
          transitionBlockHash: transition.blockHash,
          transitionStateRoot: transition.stateRoot,
          isVerified: matchesVerified
        },
        update: proofUpdate
      });
    }
  }

  private async applyProofToBatch(
    batchId: bigint,
    proofTxHash: string,
    proofSystems: ProofSystem[],
    teeVerifiers: TeeVerifier[],
    verifierAddress: string,
    payload: {
      provenAt: Date;
      provenBlock: bigint;
      transitionParentHash: string;
      transitionBlockHash: string;
      transitionStateRoot: string;
    }
  ): Promise<{ matchesVerified: boolean }> {
    const existing = await this.prisma.batch.findUnique({
      where: { batchId }
    });

    if (!existing) {
      await this.prisma.batch.create({
        data: {
          batchId,
          proposedAt: payload.provenAt,
          proposedBlock: payload.provenBlock,
          proposer: ZERO_ADDRESS,
          status: "proven",
          verifierAddress,
          proofSystems,
          teeVerifiers,
          proofTxHash,
          provenAt: payload.provenAt,
          provenBlock: payload.provenBlock,
          transitionParentHash: payload.transitionParentHash,
          transitionBlockHash: payload.transitionBlockHash,
          transitionStateRoot: payload.transitionStateRoot,
          isLegacy: false
        }
      });
      return { matchesVerified: false };
    }

    const matchesVerified =
      existing.status === "verified" &&
      existing.transitionBlockHash === payload.transitionBlockHash;

    if (existing.status === "verified") {
      if (matchesVerified && !existing.proofTxHash) {
        await this.prisma.batch.update({
          where: { batchId },
          data: {
            proofSystems: { set: proofSystems },
            teeVerifiers: { set: teeVerifiers },
            proofTxHash,
            verifierAddress,
            provenAt: payload.provenAt,
            provenBlock: payload.provenBlock,
            transitionParentHash: payload.transitionParentHash,
            transitionBlockHash: payload.transitionBlockHash,
            transitionStateRoot: payload.transitionStateRoot,
            isLegacy: false
          }
        });
      }
      return { matchesVerified };
    }

    const shouldUpdateProof =
      !existing.provenAt || payload.provenAt < existing.provenAt;

    if (!shouldUpdateProof) {
      return { matchesVerified: false };
    }

    await this.prisma.batch.update({
      where: { batchId },
      data: {
        status: "proven",
        verifierAddress,
        proofSystems: { set: proofSystems },
        teeVerifiers: { set: teeVerifiers },
        proofTxHash,
        provenAt: payload.provenAt,
        provenBlock: payload.provenBlock,
        transitionParentHash: payload.transitionParentHash,
        transitionBlockHash: payload.transitionBlockHash,
        transitionStateRoot: payload.transitionStateRoot,
        isLegacy: false
      }
    });
    return { matchesVerified: false };
  }

  private async handleBatchesVerified(
    log: Log,
    getBlockTimestamp: (blockNumber: bigint) => Promise<Date>
  ) {
    if (!log.blockNumber) {
      return;
    }

    const decoded = decodeEventLog({
      abi: taikoInboxAbi,
      data: log.data,
      topics: log.topics
    });

    const { batchId, blockHash } = decoded.args as {
      batchId: bigint;
      blockHash: string;
    };
    const newLast = BigInt(batchId);
    const prevLast = this.lastVerifiedBatchId ?? 0n;

    if (newLast <= prevLast) {
      return;
    }

    const verifiedAt = await getBlockTimestamp(log.blockNumber);
    const verifiedTxHash = log.transactionHash ?? null;
    const verifiedBlock = BigInt(log.blockNumber);
    const rangeStart = prevLast + 1n;
    const rangeEnd = newLast;

    const existing = await this.prisma.batch.findUnique({
      where: { batchId: newLast },
      select: { batchId: true }
    });

    if (!existing) {
      await this.prisma.batch.create({
        data: {
          batchId: newLast,
          proposedAt: verifiedAt,
          proposedBlock: verifiedBlock,
          proposer: ZERO_ADDRESS,
          status: "verified",
          isLegacy: true,
          verifiedAt,
          verifiedBlock,
          verifiedTxHash,
          transitionBlockHash: blockHash
        }
      });
    }

    await this.prisma.batch.updateMany({
      where: {
        batchId: {
          gte: rangeStart,
          lte: rangeEnd
        }
      },
      data: {
        status: "verified",
        verifiedAt,
        verifiedBlock,
        ...(verifiedTxHash ? { verifiedTxHash } : {})
      }
    });

    if (existing) {
      await this.prisma.batch.update({
        where: { batchId: newLast },
        data: {
          transitionBlockHash: blockHash
        }
      });
    }

    const proof = await this.prisma.batchProof.findFirst({
      where: {
        batchId: newLast,
        transitionBlockHash: blockHash
      }
    });

    if (proof) {
      await this.prisma.batchProof.update({
        where: { id: proof.id },
        data: { isVerified: true }
      });

      await this.prisma.batch.update({
        where: { batchId: newLast },
        data: {
          proofSystems: { set: proof.proofSystems },
          teeVerifiers: { set: proof.teeVerifiers },
          proofTxHash: proof.proofTxHash,
          verifierAddress: proof.verifierAddress,
          provenAt: proof.provenAt,
          provenBlock: proof.provenBlock,
          transitionParentHash: proof.transitionParentHash,
          transitionBlockHash: proof.transitionBlockHash,
          transitionStateRoot: proof.transitionStateRoot,
          isLegacy: false
        }
      });
    }

    this.lastVerifiedBatchId = newLast;
  }

  private async resetVerificationCursor(fromBlock: bigint) {
    const lastVerified = await this.prisma.batch.findFirst({
      where: {
        verifiedBlock: {
          lt: fromBlock
        }
      },
      orderBy: { batchId: "desc" },
      select: { batchId: true }
    });

    this.lastVerifiedBatchId = lastVerified?.batchId ?? 0n;
  }

  private async handleConflictingProof(log: Log) {
    const decoded = decodeEventLog({
      abi: taikoInboxAbi,
      data: log.data,
      topics: log.topics
    });

    const { batchId } = decoded.args as { batchId: bigint };
    await this.prisma.batch.upsert({
      where: { batchId },
      create: {
        batchId,
        proposedAt: new Date(),
        proposedBlock: 0n,
        proposer: ZERO_ADDRESS,
        status: "proposed",
        isContested: true
      },
      update: {
        isContested: true
      }
    });
  }

  private async getLogsSafe(
    event: GetLogsEvent,
    fromBlock: bigint,
    toBlock: bigint
  ): Promise<Log[]> {
    const client = this.chain.getClient();
    const address = this.config.taikoInboxAddress as `0x${string}`;
    const queue: Array<{ from: bigint; to: bigint; attempts: number }> = [
      { from: fromBlock, to: toBlock, attempts: 0 }
    ];
    const results: Log[] = [];

    while (queue.length) {
      const range = queue.shift();
      if (!range) {
        continue;
      }

      if (
        this.logRangeLimit &&
        range.to - range.from + 1n > this.logRangeLimit
      ) {
        this.enqueueRanges(queue, range.from, range.to, this.logRangeLimit);
        continue;
      }

      try {
        const logs = await client.getLogs({
          address,
          event,
          fromBlock: range.from,
          toBlock: range.to
        });
        results.push(...logs);
      } catch (error) {
        if (this.isLogRangeError(error) && range.from < range.to) {
          const limit = this.extractLogRangeLimit(error);
          if (limit && limit > 0n) {
            this.logRangeLimit = limit;
            this.enqueueRanges(queue, range.from, range.to, limit);
          } else {
            const mid = (range.from + range.to) / 2n;
            queue.unshift({ from: mid + 1n, to: range.to, attempts: 0 });
            queue.unshift({ from: range.from, to: mid, attempts: 0 });
          }
          continue;
        }

        if (this.isRateLimitError(error) && range.attempts < 6) {
          const delayMs = Math.min(1000 * 2 ** range.attempts, 15000);
          await this.sleep(delayMs);
          queue.unshift({ ...range, attempts: range.attempts + 1 });
          continue;
        }

        throw error;
      }
    }

    return results;
  }

  private async fetchLogsWithTiming(
    label: string,
    event: GetLogsEvent,
    fromBlock: bigint,
    toBlock: bigint
  ): Promise<Log[]> {
    const startedAt = Date.now();
    const logs = await this.getLogsSafe(event, fromBlock, toBlock);
    this.logger.log(
      `Range ${fromBlock} -> ${toBlock} fetched ${label}: ${logs.length} log(s) in ${this.formatDuration(
        startedAt
      )}.`
    );
    return logs;
  }

  private formatDuration(startedAt: number): string {
    return `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
  }

  private isLogRangeError(error: unknown): boolean {
    const details = (error as { details?: string }).details;
    const message = (error as { message?: string }).message;
    const shortMessage = (error as { shortMessage?: string }).shortMessage;
    const text = [details, message, shortMessage].filter(Boolean).join(" ").toLowerCase();
    return text.includes("eth_getlogs") && text.includes("block range");
  }

  private extractLogRangeLimit(error: unknown): bigint | null {
    const details = (error as { details?: string }).details;
    const message = (error as { message?: string }).message;
    const shortMessage = (error as { shortMessage?: string }).shortMessage;
    const text = [details, message, shortMessage].filter(Boolean).join(" ");

    const limitMatch = text.match(new RegExp("up to a (\\d+) block range", "i"));
    if (limitMatch?.[1]) {
      return BigInt(limitMatch[1]);
    }

    const rangeMatch = text.match(
      new RegExp(
        "range should work:\\s*\\[0x([0-9a-f]+),\\s*0x([0-9a-f]+)\\]",
        "i"
      )
    );
    if (rangeMatch?.[1] && rangeMatch?.[2]) {
      const from = BigInt(`0x${rangeMatch[1]}`);
      const to = BigInt(`0x${rangeMatch[2]}`);
      if (to >= from) {
        return to - from + 1n;
      }
    }

    return null;
  }

  private enqueueRanges(
    queue: Array<{ from: bigint; to: bigint; attempts: number }>,
    from: bigint,
    to: bigint,
    maxRange: bigint
  ) {
    let cursor = from;
    while (cursor <= to) {
      const end = cursor + maxRange - 1n > to ? to : cursor + maxRange - 1n;
      queue.push({ from: cursor, to: end, attempts: 0 });
      cursor = end + 1n;
    }
  }

  private isRateLimitError(error: unknown): boolean {
    const status = (error as { status?: number }).status;
    if (status === 429) {
      return true;
    }

    const details = (error as { details?: string }).details;
    const message = (error as { message?: string }).message;
    const shortMessage = (error as { shortMessage?: string }).shortMessage;
    const text = [details, message, shortMessage].filter(Boolean).join(" ").toLowerCase();
    return (
      text.includes("429") ||
      text.includes("rate limit") ||
      text.includes("compute units") ||
      text.includes("throughput")
    );
  }

  private async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async acquireIndexingLock(
    startBlock: bigint
  ): Promise<{ lockId: string; lastProcessedBlock: bigint } | null> {
    const lockId = randomUUID();
    const ttlSeconds = this.config.indexerLockTtlSeconds;
    const [row] = await this.prisma.$queryRaw<{ last_processed_block: bigint }[]>`
      INSERT INTO indexing_state (
        chain_id,
        last_processed_block,
        lock_id,
        lock_expires_at,
        last_run_started_at,
        last_run_status,
        last_run_error
      )
      VALUES (
        ${this.config.chainId},
        ${startBlock},
        ${lockId}::uuid,
        NOW() + (${ttlSeconds} * INTERVAL '1 second'),
        NOW(),
        'running',
        NULL
      )
      ON CONFLICT (chain_id) DO UPDATE
      SET
        lock_id = EXCLUDED.lock_id,
        lock_expires_at = EXCLUDED.lock_expires_at,
        last_run_started_at = EXCLUDED.last_run_started_at,
        last_run_status = EXCLUDED.last_run_status,
        last_run_error = NULL
      WHERE indexing_state.lock_expires_at IS NULL OR indexing_state.lock_expires_at < NOW()
      RETURNING last_processed_block
    `;

    if (!row) {
      return null;
    }

    return { lockId, lastProcessedBlock: row.last_processed_block };
  }

  private async checkpointIndexingProgress(lockId: string, lastProcessedBlock: bigint) {
    const lockExpiresAt = new Date(
      Date.now() + this.config.indexerLockTtlSeconds * 1000
    );
    const result = await this.prisma.indexingState.updateMany({
      where: { chainId: this.config.chainId, lockId },
      data: {
        lastProcessedBlock,
        lockExpiresAt
      }
    });

    if (!result.count) {
      throw new Error("Indexer lock lost or expired");
    }
  }

  private async releaseIndexingLock(
    lockId: string,
    status: "success" | "failed",
    error?: unknown
  ) {
    const errorMessage = status === "failed" ? this.formatError(error) : null;
    await this.prisma.indexingState.updateMany({
      where: { chainId: this.config.chainId, lockId },
      data: {
        lockId: null,
        lockExpiresAt: null,
        lastRunFinishedAt: new Date(),
        lastRunStatus: status,
        lastRunError: errorMessage
      }
    });
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return (error.message || error.name).slice(0, 2000);
    }
    return String(error ?? "Unknown error").slice(0, 2000);
  }
}
