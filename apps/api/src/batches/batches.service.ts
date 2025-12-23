import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { BatchesQueryDto } from "./batches.dto";
import { addDays, parseDateRange } from "../common/date";
import {
  BatchDetailResponse,
  BatchesResponse,
  BatchSummary,
  ProofSystem,
  TeeVerifier
} from "@taikoproofs/shared";
import { AppConfigService } from "../config/app-config.service";
import { Prisma } from "@prisma/client";

const zkProofSystems: ProofSystem[] = ["SP1", "RISC0"];

@Injectable()
export class BatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService
  ) {}

  async listBatches(query: BatchesQueryDto): Promise<BatchesResponse> {
    const maxPageSize = 100;
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(Math.max(1, query.pageSize ?? 25), maxPageSize);
    const { startDate, endDate, endIsDateOnly } = parseDateRange(
      query.start,
      query.end,
      30
    );
    const dateField = query.dateField ?? "proposedAt";
    const endBoundary = endIsDateOnly ? addDays(endDate, 1) : endDate;
    const dateRange = endIsDateOnly
      ? { gte: startDate, lt: endBoundary }
      : { gte: startDate, lte: endBoundary };

    const where: Prisma.BatchWhereInput = {};

    if (dateField === "provenAt") {
      where.provenAt = dateRange;
    } else {
      where.proposedAt = dateRange;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.contested === false) {
      where.isContested = false;
    }

    if (query.hasProof && dateField !== "provenAt") {
      where.provenAt = {
        not: null
      };
    }

    const andFilters: Prisma.BatchWhereInput[] = [];

    if (query.system?.length) {
      andFilters.push({
        proofSystems: {
          hasSome: query.system
        }
      });
    }

    if (query.proofType === "zk") {
      andFilters.push({
        proofSystems: {
          hasSome: zkProofSystems
        }
      });
    }

    if (query.proofType === "non-zk") {
      andFilters.push({
        NOT: {
          proofSystems: {
            hasSome: zkProofSystems
          }
        }
      });
    }

    if (andFilters.length) {
      where.AND = andFilters;
    }

    if (query.search) {
      try {
        where.batchId = BigInt(query.search);
      } catch {
        // ignore invalid input
      }
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.batch.findMany({
        where,
        orderBy: { batchId: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.batch.count({ where })
    ]);

    const mapped: BatchSummary[] = items.map((batch) => ({
      batchId: batch.batchId.toString(),
      proposer: batch.proposer,
      status: batch.status,
      proofSystems: batch.proofSystems,
      teeVerifiers: batch.teeVerifiers as TeeVerifier[],
      proposedAt: batch.proposedAt.toISOString(),
      provenAt: batch.provenAt?.toISOString() ?? null,
      verifiedAt: batch.verifiedAt?.toISOString() ?? null,
      isContested: batch.isContested
    }));

    return {
      range: { start: startDate.toISOString().slice(0, 10), end: endDate.toISOString().slice(0, 10) },
      page,
      pageSize,
      total,
      items: mapped
    };
  }

  async getBatch(batchId: string): Promise<BatchDetailResponse> {
    const batch = await this.prisma.batch.findUnique({
      where: { batchId: BigInt(batchId) }
    });

    if (!batch) {
      throw new NotFoundException("Batch not found");
    }

    const explorerBase = this.config.explorerBaseUrl?.replace(/\/$/, "");
    const proofLinks = explorerBase
      ? {
          tx: batch.proofTxHash ? `${explorerBase}/tx/${batch.proofTxHash}` : undefined,
          proposedTx: batch.proposedTxHash
            ? `${explorerBase}/tx/${batch.proposedTxHash}`
            : undefined,
          verifiedTx: batch.verifiedTxHash
            ? `${explorerBase}/tx/${batch.verifiedTxHash}`
            : undefined,
          verifier: batch.verifierAddress
            ? `${explorerBase}/address/${batch.verifierAddress}`
            : undefined
        }
      : undefined;

    return {
      batch: {
        batchId: batch.batchId.toString(),
        proposer: batch.proposer,
        status: batch.status,
        proofSystems: batch.proofSystems,
        teeVerifiers: batch.teeVerifiers as TeeVerifier[],
        proposedAt: batch.proposedAt.toISOString(),
        provenAt: batch.provenAt?.toISOString() ?? null,
        verifiedAt: batch.verifiedAt?.toISOString() ?? null,
        proposedBlock: batch.proposedBlock.toString(),
        provenBlock: batch.provenBlock?.toString() ?? null,
        verifiedBlock: batch.verifiedBlock?.toString() ?? null,
        proposedTxHash: batch.proposedTxHash,
        proofTxHash: batch.proofTxHash,
        verifiedTxHash: batch.verifiedTxHash,
        verifierAddress: batch.verifierAddress,
        transitionParentHash: batch.transitionParentHash,
        transitionBlockHash: batch.transitionBlockHash,
        transitionStateRoot: batch.transitionStateRoot,
        proofLinks,
        isContested: batch.isContested
      }
    };
  }
}
