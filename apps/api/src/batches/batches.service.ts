import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { BatchesQueryDto } from "./batches.dto";
import { addDays, parseDateRange } from "../common/date";
import {
  BatchDetailResponse,
  BatchesResponse,
  BatchSummary,
  TeeVerifier
} from "@taikoproofs/shared";
import { AppConfigService } from "../config/app-config.service";
import { Prisma } from "@prisma/client";

@Injectable()
export class BatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService
  ) {}

  async listBatches(query: BatchesQueryDto): Promise<BatchesResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const { startDate, endDate } = parseDateRange(query.start, query.end, 30);

    const where: Prisma.BatchWhereInput = {
      proposedAt: {
        gte: startDate,
        lt: addDays(endDate, 1)
      }
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.system?.length) {
      where.proofSystems = {
        hasSome: query.system
      };
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
        proofTxHash: batch.proofTxHash,
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
