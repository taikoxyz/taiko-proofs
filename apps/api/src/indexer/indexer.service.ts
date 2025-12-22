import { Injectable, Logger } from "@nestjs/common";
import { decodeEventLog, parseAbiItem, Log, PublicClient } from "viem";
import { PrismaService } from "../prisma/prisma.service";
import { ChainService } from "../chain/chain.service";
import { AppConfigService } from "../config/app-config.service";
import { taikoInboxAbi } from "../chain/taikoInboxAbi";
import { ProofClassifierService } from "./proof-classifier.service";
import { StatsService } from "../stats/stats.service";
import { ProofSystem } from "@taikoproofs/shared";

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

    const state = await this.prisma.indexingState.findUnique({
      where: { chainId: this.config.chainId }
    });

    const startBlock = this.config.startBlock ?? Number(safeBlock);
    const lastProcessed = state ? state.lastProcessedBlock : BigInt(startBlock);
    const fromBlock =
      lastProcessed > BigInt(this.config.reorgBuffer)
        ? lastProcessed - BigInt(this.config.reorgBuffer)
        : BigInt(startBlock);

    if (safeBlock <= fromBlock) {
      this.logger.log("No new blocks to index");
      return { fromBlock, toBlock: safeBlock, processed: 0 };
    }

    const chunkSize = BigInt(this.config.indexerChunkSize);
    let processed = 0;

    for (let cursor = fromBlock; cursor <= safeBlock; cursor += chunkSize) {
      const toBlock = cursor + chunkSize - 1n > safeBlock ? safeBlock : cursor + chunkSize - 1n;
      processed += await this.processRange(cursor, toBlock);

      await this.prisma.indexingState.upsert({
        where: { chainId: this.config.chainId },
        create: {
          chainId: this.config.chainId,
          lastProcessedBlock: toBlock
        },
        update: {
          lastProcessedBlock: toBlock
        }
      });
    }

    await this.stats.refreshDailyStats(this.config.statsLookbackDays);

    return { fromBlock, toBlock: safeBlock, processed };
  }

  private async processRange(fromBlock: bigint, toBlock: bigint): Promise<number> {
    await this.rollbackRange(fromBlock, toBlock);

    const client = this.chain.getClient();
    const address = this.config.taikoInboxAddress as `0x${string}`;

    const proposedLogs = await this.getLogsSafe(batchProposedEvent, fromBlock, toBlock);
    const provedLogs = await this.getLogsSafe(batchesProvedEvent, fromBlock, toBlock);
    const verifiedLogs = await this.getLogsSafe(batchesVerifiedEvent, fromBlock, toBlock);
    const conflictingLogs = await this.getLogsSafe(conflictingProofEvent, fromBlock, toBlock);

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

    for (const log of proposedLogs) {
      await this.handleBatchProposed(log, getBlockTimestamp);
    }

    for (const log of provedLogs) {
      await this.handleBatchesProved(log, getBlockTimestamp);
    }

    for (const log of verifiedLogs) {
      await this.handleBatchesVerified(log, getBlockTimestamp);
    }

    for (const log of conflictingLogs) {
      await this.handleConflictingProof(log);
    }

    return (
      proposedLogs.length +
      provedLogs.length +
      verifiedLogs.length +
      conflictingLogs.length
    );
  }

  private async rollbackRange(fromBlock: bigint, toBlock: bigint) {
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
        verifiedBlock: null
      }
    });

    for (const batchId of affectedBatchIds) {
      await this.reconcileBatch(batchId);
    }
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

    await this.prisma.batch.upsert({
      where: { batchId },
      create: {
        batchId,
        proposedAt,
        proposedBlock,
        proposer,
        status: "proposed"
      },
      update: {
        proposedAt,
        proposedBlock,
        proposer
      }
    });

    if (!log.blockNumber) {
      return;
    }

    const blockTimestamp = await getBlockTimestamp(log.blockNumber);
    if (proposedAt > blockTimestamp) {
      this.logger.warn(
        `Batch ${batchId} proposedAt is ahead of block timestamp, using on-chain timestamp`
      );
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
    const proofSystems = await this.classifier.classifyProofSystems(
      normalizedVerifier,
      proofData
    );
    const provenAt = await getBlockTimestamp(log.blockNumber);
    const provenBlock = log.blockNumber;

    for (let i = 0; i < batchIds.length; i += 1) {
      const batchId = BigInt(batchIds[i]);
      const transition = transitions[i];

      await this.applyProofToBatch(
        batchId,
        log.transactionHash,
        proofSystems,
        normalizedVerifier,
        {
          provenAt,
          provenBlock: BigInt(provenBlock),
          transitionParentHash: transition.parentHash,
          transitionBlockHash: transition.blockHash,
          transitionStateRoot: transition.stateRoot
        }
      );

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
          proofTxHash: log.transactionHash,
          provenAt,
          provenBlock: BigInt(provenBlock),
          transitionParentHash: transition.parentHash,
          transitionBlockHash: transition.blockHash,
          transitionStateRoot: transition.stateRoot
        },
        update: {
          proofSystems: { set: proofSystems },
          provenAt,
          provenBlock: BigInt(provenBlock),
          transitionParentHash: transition.parentHash,
          transitionBlockHash: transition.blockHash,
          transitionStateRoot: transition.stateRoot
        }
      });
    }
  }

  private async applyProofToBatch(
    batchId: bigint,
    proofTxHash: string,
    proofSystems: ProofSystem[],
    verifierAddress: string,
    payload: {
      provenAt: Date;
      provenBlock: bigint;
      transitionParentHash: string;
      transitionBlockHash: string;
      transitionStateRoot: string;
    }
  ) {
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
          proofTxHash,
          provenAt: payload.provenAt,
          provenBlock: payload.provenBlock,
          transitionParentHash: payload.transitionParentHash,
          transitionBlockHash: payload.transitionBlockHash,
          transitionStateRoot: payload.transitionStateRoot
        }
      });
      return;
    }

    if (existing.status === "verified") {
      return;
    }

    const shouldUpdateProof =
      !existing.provenAt || payload.provenAt < existing.provenAt;

    if (!shouldUpdateProof) {
      return;
    }

    await this.prisma.batch.update({
      where: { batchId },
      data: {
        status: "proven",
        verifierAddress,
        proofSystems: { set: proofSystems },
        proofTxHash,
        provenAt: payload.provenAt,
        provenBlock: payload.provenBlock,
        transitionParentHash: payload.transitionParentHash,
        transitionBlockHash: payload.transitionBlockHash,
        transitionStateRoot: payload.transitionStateRoot
      }
    });
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
    const verifiedAt = await getBlockTimestamp(log.blockNumber);

    const proof = await this.prisma.batchProof.findFirst({
      where: {
        batchId,
        transitionBlockHash: blockHash
      }
    });

    await this.prisma.batch.upsert({
      where: { batchId },
      create: {
        batchId,
        proposedAt: verifiedAt,
        proposedBlock: BigInt(log.blockNumber),
        proposer: ZERO_ADDRESS,
        status: "verified",
        verifiedAt,
        verifiedBlock: BigInt(log.blockNumber)
      },
      update: {
        status: "verified",
        verifiedAt,
        verifiedBlock: BigInt(log.blockNumber)
      }
    });

    if (proof) {
      await this.prisma.batchProof.update({
        where: { id: proof.id },
        data: { isVerified: true }
      });

      await this.prisma.batch.update({
        where: { batchId },
        data: {
          proofSystems: { set: proof.proofSystems },
          proofTxHash: proof.proofTxHash,
          verifierAddress: proof.verifierAddress,
          provenAt: proof.provenAt,
          provenBlock: proof.provenBlock,
          transitionParentHash: proof.transitionParentHash,
          transitionBlockHash: proof.transitionBlockHash,
          transitionStateRoot: proof.transitionStateRoot
        }
      });
    }
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
}
