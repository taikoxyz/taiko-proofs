"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
  LabelList
} from "recharts";
import type { TooltipProps } from "recharts";
import clsx from "clsx";
import { buildApiUrl, fetcher } from "../lib/api";
import {
  LatencyResponse,
  ProofSystemResponse,
  ZkShareResponse
} from "@taikoproofs/shared";
import { formatDurationSeconds, formatPercent } from "../lib/format";

interface StatsViewProps {
  range: {
    start: string;
    end: string;
  };
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="font-display text-2xl text-white">{title}</h2>
      <p className="text-sm text-white/60">{description}</p>
    </div>
  );
}

const proofSystemLegend = [
  { key: "teeSgxGeth", label: "SGX GETH", color: "#57d1c9" },
  { key: "teeSgxReth", label: "SGX RETH", color: "#3bb4c4" },
  { key: "sp1", label: "SP1 RETH", color: "#f2b84b" },
  { key: "risc0", label: "RISC0 RETH", color: "#ec6b56" }
] as const;

const proofSystemLabels = proofSystemLegend.reduce<Record<string, string>>(
  (acc, item) => {
    acc[item.key] = item.label;
    return acc;
  },
  {}
);

function LoadingCard() {
  return (
    <div className="card animate-pulse-soft h-64" />
  );
}

function ProofSystemTooltip({
  active,
  payload,
  label
}: TooltipProps<number, string>) {
  if (!active || !payload?.length) {
    return null;
  }

  const total = payload[0]?.payload?.provenTotal;

  return (
    <div className="rounded-xl border border-line/70 bg-ink px-4 py-3 text-xs text-white/80 shadow-lg">
      <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">
        {label}
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-4 text-white">
        <span className="text-[10px] uppercase tracking-[0.2em] text-white/50">
          Total batches
        </span>
        <span className="font-display text-lg">
          {typeof total === "number" ? total : "—"}
        </span>
      </div>
      <div className="mt-2 space-y-1">
        {payload.map((entry) => {
          const key = String(entry.dataKey ?? entry.name ?? "");
          const entryLabel = proofSystemLabels[key] ?? key;
          const value = typeof entry.value === "number" ? entry.value : 0;
          return (
            <div key={key} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 text-white/70">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                {entryLabel}
              </span>
              <span className="text-white">{value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function StatsView({ range }: StatsViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [verifiedOnly, setVerifiedOnly] = useState(true);

  const { data: zkShare } = useSWR<ZkShareResponse>(
    buildApiUrl("/stats/zk", range),
    fetcher,
    { refreshInterval: 60000 }
  );

  const { data: proofSystems } = useSWR<ProofSystemResponse>(
    buildApiUrl("/stats/proof-systems", range),
    fetcher,
    { refreshInterval: 60000 }
  );

  const { data: provingLatency } = useSWR<LatencyResponse>(
    buildApiUrl("/stats/latency", {
      ...range,
      type: "proving",
      verifiedOnly
    }),
    fetcher,
    { refreshInterval: 60000 }
  );

  const { data: verificationLatency } = useSWR<LatencyResponse>(
    buildApiUrl("/stats/latency", {
      ...range,
      type: "verification",
      verifiedOnly: true
    }),
    fetcher,
    { refreshInterval: 60000 }
  );

  const rangeTotals = useMemo(() => {
    if (!zkShare) {
      return null;
    }

    if (zkShare.summary) {
      return {
        provenTotal: zkShare.summary.provenTotal,
        zkProvenTotal: zkShare.summary.zkProvenTotal
      };
    }

    if (!zkShare.points?.length) {
      return null;
    }

    return zkShare.points.reduce(
      (acc, point) => ({
        provenTotal: acc.provenTotal + point.provenTotal,
        zkProvenTotal: acc.zkProvenTotal + point.zkProvenTotal
      }),
      { provenTotal: 0, zkProvenTotal: 0 }
    );
  }, [zkShare]);

  const rangeZkPercent =
    rangeTotals && rangeTotals.provenTotal
      ? (rangeTotals.zkProvenTotal / rangeTotals.provenTotal) * 100
      : rangeTotals
        ? 0
        : null;
  const notZkProven = rangeTotals
    ? rangeTotals.provenTotal - rangeTotals.zkProvenTotal
    : null;
  const canNavigateToNonZk = typeof notZkProven === "number" && notZkProven > 0;

  const proofSystemData = useMemo(() => {
    if (!proofSystems?.points) {
      return null;
    }

    const provenTotalsByDate = zkShare?.points?.reduce((acc, point) => {
      acc.set(point.date, point.provenTotal);
      return acc;
    }, new Map<string, number>());

    return proofSystems.points.map((point) => {
      const fallbackTotal = provenTotalsByDate?.get(point.date);
      const provenTotal = Number.isFinite(point.provenTotal)
        ? point.provenTotal
        : typeof fallbackTotal === "number"
          ? fallbackTotal
          : point.provenTotal;

      return {
        ...point,
        provenTotal,
        stackTotal:
          point.teeSgxGeth +
          point.teeSgxReth +
          point.sp1 +
          point.risc0
      };
    });
  }, [proofSystems, zkShare]);

  const proofSystemMax = useMemo(() => {
    if (!proofSystemData?.length) {
      return 0;
    }
    return Math.max(...proofSystemData.map((point) => point.stackTotal));
  }, [proofSystemData]);

  const handleNonZkClick = () => {
    if (!canNavigateToNonZk) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "batches");
    params.set("proofType", "non-zk");
    params.set("hasProof", "true");
    params.set("dateField", "provenAt");
    params.set("contested", "false");
    params.delete("page");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-10">
      <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="card">
          <SectionHeader
            title="ZK Proven Share"
            description="Daily percent of batches proven with SP1 RETH or RISC0 RETH."
          />
          <div className="mt-6 h-64">
            {zkShare ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={zkShare.points} margin={{ left: 0, right: 16 }}>
                  <CartesianGrid stroke="#1f2a30" strokeDasharray="4 4" />
                  <XAxis dataKey="date" tick={{ fill: "#7a8a94", fontSize: 12 }} />
                  <YAxis
                    tick={{ fill: "#7a8a94", fontSize: 12 }}
                    domain={[0, 100]}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#0e1418",
                      border: "1px solid #1f2a30",
                      borderRadius: 12
                    }}
                    formatter={(value: number, name) => {
                      if (name === "zkPercent") {
                        return [formatPercent(value), "ZK %"];
                      }
                      if (name === "provenTotal") {
                        return [value, "Total Proven"];
                      }
                      if (name === "zkProvenTotal") {
                        return [value, "ZK Proven"];
                      }
                      return [value, name];
                    }}
                    labelStyle={{ color: "#9fb0ba" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="zkPercent"
                    stroke="#f2b84b"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <LoadingCard />
            )}
          </div>
          <div className="mt-2 text-right text-[10px] uppercase tracking-[0.2em] text-white/40">
            UTC
          </div>
        </div>

        <div className="card flex flex-col justify-between">
          <SectionHeader
            title="Range Summary"
            description="Totals across the selected range."
          />
          <div className="mt-6 space-y-4">
            <div>
              <p className="label">ZK Share</p>
              <p className="mt-2 font-display text-3xl text-white">
                {rangeZkPercent !== null ? formatPercent(rangeZkPercent) : "—"}
              </p>
            </div>
            <div className="flex items-center justify-between text-sm text-white/70">
              <span>ZK Proven</span>
              <span>{rangeTotals?.zkProvenTotal ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-white/70">
              <span>Total Proven</span>
              <span>{rangeTotals?.provenTotal ?? "—"}</span>
            </div>
            <button
              type="button"
              onClick={handleNonZkClick}
              disabled={!canNavigateToNonZk}
              className={clsx(
                "group flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm transition",
                canNavigateToNonZk
                  ? "border-line/60 bg-slate/60 text-white/80 hover:border-accent/60 hover:bg-slate"
                  : "cursor-default border-line/40 bg-slate/40 text-white/60"
              )}
            >
              <span>Not Proven By ZK</span>
              <span className="flex items-center gap-3">
                <span className={clsx("font-medium", canNavigateToNonZk ? "text-white" : "text-white/70")}>
                  {notZkProven ?? "—"}
                </span>
                {canNavigateToNonZk && (
                  <span className="text-[10px] uppercase tracking-[0.2em] text-accent group-hover:text-accentSoft">
                    View Batches{" >"}
                  </span>
                )}
              </span>
            </button>
          </div>
        </div>
      </section>

      <section className="card">
        <SectionHeader
          title="Proof System Usage"
          description="Each batch contributes to every proof system used. TEE usage is split by verifier type."
        />
        <div className="mt-6 h-72">
          {proofSystemData ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={proofSystemData}
                margin={{ left: 0, right: 16, top: 18 }}
              >
                <CartesianGrid stroke="#1f2a30" strokeDasharray="4 4" />
                <XAxis dataKey="date" tick={{ fill: "#7a8a94", fontSize: 12 }} />
                <YAxis
                  tick={{ fill: "#7a8a94", fontSize: 12 }}
                  domain={[0, Math.max(1, Math.ceil(proofSystemMax * 1.15))]}
                />
                <Tooltip content={ProofSystemTooltip} />
                <Bar dataKey="teeSgxGeth" stackId="proof" fill="#57d1c9" />
                <Bar dataKey="teeSgxReth" stackId="proof" fill="#3bb4c4" />
                <Bar dataKey="sp1" stackId="proof" fill="#f2b84b" />
                <Bar dataKey="risc0" stackId="proof" fill="#ec6b56">
                  <LabelList
                    dataKey="provenTotal"
                    position="top"
                    fill="#9fb0ba"
                    fontSize={11}
                    offset={6}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <LoadingCard />
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-xs uppercase tracking-[0.2em] text-white/50">
          {proofSystemLegend.map((item) => (
            <div key={item.key} className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 text-right text-[10px] uppercase tracking-[0.2em] text-white/40">
          UTC
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="card">
          <SectionHeader
            title="Latency"
            description="Average, median, p90, p95, and p99 latency from proposal to proof/verification."
          />

          <div className="mt-6 flex items-center gap-3">
            <button
              className={clsx(
                "rounded-full px-4 py-2 text-xs uppercase tracking-[0.2em] transition",
                verifiedOnly ? "bg-accent text-ink" : "bg-slate text-white/60"
              )}
              onClick={() => setVerifiedOnly(true)}
            >
              Verified Only
            </button>
            <button
              className={clsx(
                "rounded-full px-4 py-2 text-xs uppercase tracking-[0.2em] transition",
                !verifiedOnly ? "bg-accent text-ink" : "bg-slate text-white/60"
              )}
              onClick={() => setVerifiedOnly(false)}
            >
              All Proven
            </button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <LatencyCard
              title="Proving Latency"
              stats={provingLatency?.stats}
            />
            <LatencyCard
              title="Verification Latency"
              stats={verificationLatency?.stats}
            />
          </div>
        </div>

        <div className="card">
          <SectionHeader
            title="Latency Trend"
            description="Daily average proving latency."
          />
          <div className="mt-6 h-64">
            {provingLatency ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={provingLatency.series} margin={{ left: 0, right: 16 }}>
                  <CartesianGrid stroke="#1f2a30" strokeDasharray="4 4" />
                  <XAxis dataKey="date" tick={{ fill: "#7a8a94", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#7a8a94", fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      background: "#0e1418",
                      border: "1px solid #1f2a30",
                      borderRadius: 12
                    }}
                    formatter={(value: number) => [formatDurationSeconds(value), "Avg"]}
                    labelStyle={{ color: "#9fb0ba" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="avgSeconds"
                    stroke="#57d1c9"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <LoadingCard />
            )}
          </div>
          <div className="mt-2 text-right text-[10px] uppercase tracking-[0.2em] text-white/40">
            UTC
          </div>
        </div>
      </section>
    </div>
  );
}

function LatencyCard({
  title,
  stats
}: {
  title: string;
  stats?: {
    avgSeconds: number;
    medianSeconds: number;
    p90Seconds: number;
    p95Seconds: number;
    p99Seconds: number;
  };
}) {
  return (
    <div className="rounded-2xl border border-line/60 bg-slate/70 p-4">
      <p className="text-sm text-white/70">{title}</p>
      <div className="mt-3 grid gap-3">
        <div className="flex items-center justify-between text-sm text-white/70">
          <span>Avg</span>
          <span>{formatDurationSeconds(stats?.avgSeconds)}</span>
        </div>
        <div className="flex items-center justify-between text-sm text-white/70">
          <span>Median</span>
          <span>{formatDurationSeconds(stats?.medianSeconds)}</span>
        </div>
        <div className="flex items-center justify-between text-sm text-white/70">
          <span>p90</span>
          <span>{formatDurationSeconds(stats?.p90Seconds)}</span>
        </div>
        <div className="flex items-center justify-between text-sm text-white/70">
          <span>p95</span>
          <span>{formatDurationSeconds(stats?.p95Seconds)}</span>
        </div>
        <div className="flex items-center justify-between text-sm text-white/70">
          <span>p99</span>
          <span>{formatDurationSeconds(stats?.p99Seconds)}</span>
        </div>
      </div>
    </div>
  );
}
