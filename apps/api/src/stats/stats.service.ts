import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  LatencyResponse,
  ProofSystemResponse,
  ZkShareResponse
} from "@taikoproofs/shared";
import { addDays, startOfUtcDay } from "../common/date";

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async refreshDailyStats(lookbackDays: number) {
    const end = startOfUtcDay(new Date());
    const start = addDays(end, -lookbackDays);

    const provenRows = await this.prisma.$queryRaw<
      {
        date: Date;
        proven_total: number;
        zk_proven_total: number;
        tee_total: number;
        sp1_total: number;
        risc0_total: number;
        proving_avg_seconds: number | null;
      }[]
    >`
      SELECT
        date_trunc('day', proven_at) as date,
        COUNT(*)::int as proven_total,
        SUM(CASE WHEN proof_systems && ARRAY['SP1','RISC0']::"ProofSystem"[] THEN 1 ELSE 0 END)::int as zk_proven_total,
        SUM(CASE WHEN 'TEE' = ANY(proof_systems) THEN 1 ELSE 0 END)::int as tee_total,
        SUM(CASE WHEN 'SP1' = ANY(proof_systems) THEN 1 ELSE 0 END)::int as sp1_total,
        SUM(CASE WHEN 'RISC0' = ANY(proof_systems) THEN 1 ELSE 0 END)::int as risc0_total,
        AVG(EXTRACT(EPOCH FROM proven_at - proposed_at)) as proving_avg_seconds
      FROM batches
      WHERE proven_at BETWEEN ${start} AND ${addDays(end, 1)}
        AND is_contested = false
        AND proposed_at IS NOT NULL
      GROUP BY 1
    `;

    const verificationRows = await this.prisma.$queryRaw<
      { date: Date; verification_avg_seconds: number | null }[]
    >`
      SELECT
        date_trunc('day', verified_at) as date,
        AVG(EXTRACT(EPOCH FROM verified_at - proposed_at)) as verification_avg_seconds
      FROM batches
      WHERE verified_at BETWEEN ${start} AND ${addDays(end, 1)}
        AND is_contested = false
        AND proposed_at IS NOT NULL
      GROUP BY 1
    `;

    const verificationMap = new Map(
      verificationRows.map((row) => [dateKey(row.date), row])
    );

    const provenMap = new Map(provenRows.map((row) => [dateKey(row.date), row]));

    for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
      const key = dateKey(cursor);
      const proven = provenMap.get(key);
      const verification = verificationMap.get(key);

      await this.prisma.dailyStat.upsert({
        where: { date: cursor },
        create: {
          date: cursor,
          provenTotal: proven?.proven_total ?? 0,
          zkProvenTotal: proven?.zk_proven_total ?? 0,
          teeTotal: proven?.tee_total ?? 0,
          sp1Total: proven?.sp1_total ?? 0,
          risc0Total: proven?.risc0_total ?? 0,
          provingAvgSeconds: proven?.proving_avg_seconds ?? null,
          verificationAvgSeconds: verification?.verification_avg_seconds ?? null
        },
        update: {
          provenTotal: proven?.proven_total ?? 0,
          zkProvenTotal: proven?.zk_proven_total ?? 0,
          teeTotal: proven?.tee_total ?? 0,
          sp1Total: proven?.sp1_total ?? 0,
          risc0Total: proven?.risc0_total ?? 0,
          provingAvgSeconds: proven?.proving_avg_seconds ?? null,
          verificationAvgSeconds: verification?.verification_avg_seconds ?? null
        }
      });
    }
  }

  async getZkShare(start: Date, end: Date): Promise<ZkShareResponse> {
    const dailyStats = await this.prisma.dailyStat.findMany({
      where: {
        date: {
          gte: start,
          lte: end
        }
      },
      orderBy: { date: "asc" }
    });

    const statsMap = new Map(dailyStats.map((row) => [dateKey(row.date), row]));
    const points = [];

    for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
      const key = dateKey(cursor);
      const row = statsMap.get(key);
      const provenTotal = row?.provenTotal ?? 0;
      const zkProvenTotal = row?.zkProvenTotal ?? 0;
      const zkPercent = provenTotal ? (zkProvenTotal / provenTotal) * 100 : 0;

      points.push({
        date: key,
        provenTotal,
        zkProvenTotal,
        zkPercent
      });
    }

    return {
      range: { start: dateKey(start), end: dateKey(end) },
      points
    };
  }

  async getProofSystemUsage(start: Date, end: Date): Promise<ProofSystemResponse> {
    const dailyStats = await this.prisma.dailyStat.findMany({
      where: {
        date: {
          gte: start,
          lte: end
        }
      },
      orderBy: { date: "asc" }
    });

    const statsMap = new Map(dailyStats.map((row) => [dateKey(row.date), row]));
    const points = [];

    for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
      const key = dateKey(cursor);
      const row = statsMap.get(key);

      points.push({
        date: key,
        tee: row?.teeTotal ?? 0,
        sp1: row?.sp1Total ?? 0,
        risc0: row?.risc0Total ?? 0
      });
    }

    return {
      range: { start: dateKey(start), end: dateKey(end) },
      points
    };
  }

  async getLatency(
    type: "proving" | "verification",
    start: Date,
    end: Date,
    verifiedOnly: boolean
  ): Promise<LatencyResponse> {
    if (type === "verification") {
      return this.getVerificationLatency(start, end);
    }

    return this.getProvingLatency(start, end, verifiedOnly);
  }

  private async getProvingLatency(
    start: Date,
    end: Date,
    verifiedOnly: boolean
  ): Promise<LatencyResponse> {
    const statsQuery = verifiedOnly
      ? this.prisma.$queryRaw<
          {
            avg_seconds: number | null;
            median_seconds: number | null;
            p99_seconds: number | null;
          }[]
        >`
          SELECT
            AVG(EXTRACT(EPOCH FROM proven_at - proposed_at)) as avg_seconds,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM proven_at - proposed_at)) as median_seconds,
            PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM proven_at - proposed_at)) as p99_seconds
          FROM batches
          WHERE proven_at BETWEEN ${start} AND ${addDays(end, 1)}
            AND is_contested = false
            AND proposed_at IS NOT NULL
            AND status = 'verified'
        `
      : this.prisma.$queryRaw<
          {
            avg_seconds: number | null;
            median_seconds: number | null;
            p99_seconds: number | null;
          }[]
        >`
          SELECT
            AVG(EXTRACT(EPOCH FROM proven_at - proposed_at)) as avg_seconds,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM proven_at - proposed_at)) as median_seconds,
            PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM proven_at - proposed_at)) as p99_seconds
          FROM batches
          WHERE proven_at BETWEEN ${start} AND ${addDays(end, 1)}
            AND is_contested = false
            AND proposed_at IS NOT NULL
        `;

    const [stats] = await statsQuery;

    const seriesQuery = verifiedOnly
      ? this.prisma.$queryRaw<{ date: Date; avg_seconds: number | null }[]>`
          SELECT
            date_trunc('day', proven_at) as date,
            AVG(EXTRACT(EPOCH FROM proven_at - proposed_at)) as avg_seconds
          FROM batches
          WHERE proven_at BETWEEN ${start} AND ${addDays(end, 1)}
            AND is_contested = false
            AND proposed_at IS NOT NULL
            AND status = 'verified'
          GROUP BY 1
          ORDER BY 1
        `
      : this.prisma.$queryRaw<{ date: Date; avg_seconds: number | null }[]>`
          SELECT
            date_trunc('day', proven_at) as date,
            AVG(EXTRACT(EPOCH FROM proven_at - proposed_at)) as avg_seconds
          FROM batches
          WHERE proven_at BETWEEN ${start} AND ${addDays(end, 1)}
            AND is_contested = false
            AND proposed_at IS NOT NULL
          GROUP BY 1
          ORDER BY 1
        `;

    const seriesRows = await seriesQuery;

    const seriesMap = new Map(seriesRows.map((row) => [dateKey(row.date), row.avg_seconds]));
    const series = [];
    for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
      const key = dateKey(cursor);
      series.push({
        date: key,
        avgSeconds: seriesMap.get(key) ?? 0
      });
    }

    return {
      range: { start: dateKey(start), end: dateKey(end) },
      stats: {
        avgSeconds: stats?.avg_seconds ?? 0,
        medianSeconds: stats?.median_seconds ?? 0,
        p99Seconds: stats?.p99_seconds ?? 0
      },
      series
    };
  }

  private async getVerificationLatency(
    start: Date,
    end: Date
  ): Promise<LatencyResponse> {
    const [stats] = await this.prisma.$queryRaw<
      { avg_seconds: number | null; median_seconds: number | null; p99_seconds: number | null }[]
    >`
      SELECT
        AVG(EXTRACT(EPOCH FROM verified_at - proposed_at)) as avg_seconds,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM verified_at - proposed_at)) as median_seconds,
        PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM verified_at - proposed_at)) as p99_seconds
      FROM batches
      WHERE verified_at BETWEEN ${start} AND ${addDays(end, 1)}
        AND is_contested = false
        AND proposed_at IS NOT NULL
        AND status = 'verified'
    `;

    const seriesRows = await this.prisma.$queryRaw<
      { date: Date; avg_seconds: number | null }[]
    >`
      SELECT
        date_trunc('day', verified_at) as date,
        AVG(EXTRACT(EPOCH FROM verified_at - proposed_at)) as avg_seconds
      FROM batches
      WHERE verified_at BETWEEN ${start} AND ${addDays(end, 1)}
        AND is_contested = false
        AND proposed_at IS NOT NULL
        AND status = 'verified'
      GROUP BY 1
      ORDER BY 1
    `;

    const seriesMap = new Map(seriesRows.map((row) => [dateKey(row.date), row.avg_seconds]));
    const series = [];
    for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
      const key = dateKey(cursor);
      series.push({
        date: key,
        avgSeconds: seriesMap.get(key) ?? 0
      });
    }

    return {
      range: { start: dateKey(start), end: dateKey(end) },
      stats: {
        avgSeconds: stats?.avg_seconds ?? 0,
        medianSeconds: stats?.median_seconds ?? 0,
        p99Seconds: stats?.p99_seconds ?? 0
      },
      series
    };
  }
}
