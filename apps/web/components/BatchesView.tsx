"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import clsx from "clsx";
import {
  BatchDetailResponse,
  BatchStatus,
  BatchesResponse,
  ProofSystem,
  TeeVerifier
} from "@taikoproofs/shared";
import { buildApiUrl, fetcher } from "../lib/api";
import { formatDateTime } from "../lib/format";

interface BatchesViewProps {
  range: {
    start: string;
    end: string;
  };
}

const statusFilters: { label: string; value: BatchStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Proposed", value: "proposed" },
  { label: "Proven", value: "proven" },
  { label: "Verified", value: "verified" }
];

const systemFilters: ProofSystem[] = ["TEE", "SP1", "RISC0"];
const teeLabels: Record<TeeVerifier, string> = {
  SGX_GETH: "SGX GETH",
  SGX_RETH: "SGX RETH"
};

function buildProofLabels(
  proofSystems: ProofSystem[],
  teeVerifiers?: TeeVerifier[]
) {
  const labels = new Set<string>();

  for (const system of proofSystems) {
    if (system === "TEE" && teeVerifiers?.length) {
      for (const tee of teeVerifiers) {
        labels.add(`TEE ${teeLabels[tee] ?? tee}`);
      }
      continue;
    }

    labels.add(system);
  }

  return Array.from(labels);
}

function formatProofSystems(
  proofSystems: ProofSystem[],
  teeVerifiers?: TeeVerifier[]
) {
  const labels = buildProofLabels(proofSystems, teeVerifiers);
  return labels.length ? labels.join(", ") : "—";
}

export default function BatchesView({ range }: BatchesViewProps) {
  const [status, setStatus] = useState<BatchStatus | "all">("all");
  const [systems, setSystems] = useState<ProofSystem[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [status, systems, search, range.start, range.end]);

  const params = useMemo(
    () => ({
      ...range,
      status: status === "all" ? undefined : status,
      system: systems.length ? systems.join(",") : undefined,
      search: search || undefined,
      page,
      pageSize: 20
    }),
    [range, status, systems, search, page]
  );

  const { data } = useSWR<BatchesResponse>(
    buildApiUrl("/batches", params),
    fetcher,
    { refreshInterval: 60000 }
  );

  const { data: detail } = useSWR<BatchDetailResponse>(
    selectedBatch ? buildApiUrl(`/batches/${selectedBatch}`) : null,
    fetcher
  );

  const toggleSystem = (system: ProofSystem) => {
    setSystems((prev) =>
      prev.includes(system) ? prev.filter((item) => item !== system) : [...prev, system]
    );
  };

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-display text-2xl text-white">Batches</h2>
            <p className="mt-2 text-sm text-white/60">
              Latest batches across the selected range.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {statusFilters.map((filter) => (
              <button
                key={filter.value}
                className={clsx(
                  "rounded-full px-4 py-2 text-xs uppercase tracking-[0.2em] transition",
                  status === filter.value
                    ? "bg-accent text-ink"
                    : "bg-slate text-white/60"
                )}
                onClick={() => setStatus(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            {systemFilters.map((system) => (
              <button
                key={system}
                className={clsx(
                  "rounded-full border px-4 py-2 text-xs uppercase tracking-[0.2em] transition",
                  systems.includes(system)
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-line/70 bg-slate text-white/60"
                )}
                onClick={() => toggleSystem(system)}
              >
                {system}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search batch id"
            className="ml-auto min-w-[180px] rounded-full border border-line/70 bg-slate px-4 py-2 text-sm text-white/80"
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="text-white/60">
            <tr>
              <th className="px-4 py-3">Batch</th>
              <th className="px-4 py-3">Proof Systems</th>
              <th className="px-4 py-3">Proposed</th>
              <th className="px-4 py-3">Proven</th>
              <th className="px-4 py-3">Verified</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {data?.items?.map((batch) => (
              <tr
                key={batch.batchId}
                className="border-t border-line/60 hover:bg-slate/60 cursor-pointer"
                onClick={() => setSelectedBatch(batch.batchId)}
              >
                <td className="px-4 py-3 font-medium text-white">#{batch.batchId}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {batch.proofSystems.length ? (
                      buildProofLabels(batch.proofSystems, batch.teeVerifiers).map(
                        (label, index) => (
                          <span
                            key={`${batch.batchId}-${label}-${index}`}
                            className="rounded-full border border-line/70 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-white/70"
                          >
                            {label}
                          </span>
                        )
                      )
                    ) : (
                      <span className="text-white/40">—</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-white/70">
                  {formatDateTime(batch.proposedAt)}
                </td>
                <td className="px-4 py-3 text-white/70">
                  {formatDateTime(batch.provenAt)}
                </td>
                <td className="px-4 py-3 text-white/70">
                  {formatDateTime(batch.verifiedAt)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={batch.status} contested={batch.isContested} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {data && data.items.length === 0 && (
          <div className="px-4 py-10 text-center text-white/50">No batches found.</div>
        )}

        <div className="flex items-center justify-between border-t border-line/60 px-4 py-4 text-sm text-white/70">
          <span>
            Page {data?.page ?? 1} of {data ? Math.ceil(data.total / data.pageSize) : 1}
          </span>
          <div className="flex items-center gap-2">
            <button
              className="rounded-full border border-line/70 px-3 py-1 disabled:opacity-40"
              disabled={!data || page === 1}
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
            >
              Prev
            </button>
            <button
              className="rounded-full border border-line/70 px-3 py-1 disabled:opacity-40"
              disabled={!data || data.page * data.pageSize >= data.total}
              onClick={() => setPage((prev) => prev + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {selectedBatch && detail?.batch && (
        <BatchDrawer
          batch={detail.batch}
          onClose={() => setSelectedBatch(null)}
        />
      )}
    </div>
  );
}

function StatusBadge({ status, contested }: { status: BatchStatus; contested?: boolean }) {
  if (contested) {
    return (
      <span className="rounded-full border border-red-400/60 bg-red-500/10 px-3 py-1 text-xs text-red-200">
        Contested
      </span>
    );
  }

  const styles: Record<BatchStatus, string> = {
    proposed: "border-line/70 bg-slate text-white/60",
    proven: "border-accentSoft/50 bg-accent/10 text-accent",
    verified: "border-mint/50 bg-mint/10 text-mint"
  };

  return (
    <span className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.2em] ${styles[status]}`}>
      {status}
    </span>
  );
}

function BatchDrawer({
  batch,
  onClose
}: {
  batch: BatchDetailResponse["batch"];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
      <div className="h-full w-full max-w-lg bg-ink p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-2xl text-white">Batch #{batch.batchId}</h3>
          <button
            className="rounded-full border border-line/70 px-3 py-1 text-xs uppercase tracking-[0.2em] text-white/60"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="mt-6 space-y-4 text-sm text-white/70">
          <DetailRow label="Proposer" value={batch.proposer} />
          <DetailRow label="Status" value={batch.status} />
          <DetailRow
            label="Proof Systems"
            value={formatProofSystems(batch.proofSystems, batch.teeVerifiers)}
          />
          <DetailRow label="Proposed" value={formatDateTime(batch.proposedAt)} />
          <DetailRow label="Proven" value={formatDateTime(batch.provenAt)} />
          <DetailRow label="Verified" value={formatDateTime(batch.verifiedAt)} />
          <DetailRow label="Transition Parent" value={batch.transitionParentHash ?? "—"} />
          <DetailRow label="Transition Block" value={batch.transitionBlockHash ?? "—"} />
          <DetailRow label="State Root" value={batch.transitionStateRoot ?? "—"} />
          {batch.proofTxHash && (
            <DetailRow
              label="Proof Tx"
              value={batch.proofTxHash}
              href={batch.proofLinks?.tx}
            />
          )}
          {batch.verifierAddress && (
            <DetailRow
              label="Verifier"
              value={batch.verifierAddress}
              href={batch.proofLinks?.verifier}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  href
}: {
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-[0.3em] text-white/40">{label}</span>
      {href ? (
        <a href={href} target="_blank" className="text-accent hover:text-accentSoft">
          {value}
        </a>
      ) : (
        <span>{value}</span>
      )}
    </div>
  );
}
