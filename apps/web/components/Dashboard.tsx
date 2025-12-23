"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { subDays } from "date-fns";
import RangePicker, { RangePreset, resolveRange } from "./RangePicker";
import StatsView from "./StatsView";
import BatchesView from "./BatchesView";
import clsx from "clsx";
import { formatUtcDateTime } from "../lib/date";

const tabs = [
  { id: "stats", label: "Stats" },
  { id: "batches", label: "Batches" }
] as const;

type TabId = (typeof tabs)[number]["id"];

export default function Dashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab: TabId = searchParams.get("tab") === "batches" ? "batches" : "stats";
  const [preset, setPreset] = useState<RangePreset>("30");
  const [customStart, setCustomStart] = useState(
    formatUtcDateTime(subDays(new Date(), 30))
  );
  const [customEnd, setCustomEnd] = useState(formatUtcDateTime(new Date()));

  const range = useMemo(
    () => resolveRange(preset, customStart, customEnd),
    [preset, customStart, customEnd]
  );

  const setActiveTab = (nextTab: TabId) => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextTab === "batches") {
      params.set("tab", "batches");
    } else {
      params.delete("tab");
      params.delete("page");
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <div className="min-h-screen px-6 pb-16 pt-10 lg:px-14">
      <header className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <span className="chip">TaikoProofs</span>
              <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight text-white lg:text-5xl">
                Proof coverage, without the noise.
              </h1>
              <p className="mt-3 max-w-2xl text-base text-white/70">
                Track Taiko batch proving mix, ZK share, and latency across time.
                Built to be fast, minimal, and easy to scan.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <span className="label">Range</span>
              <RangePicker
                preset={preset}
                customStart={customStart}
                customEnd={customEnd}
                onPresetChange={setPreset}
                onCustomStartChange={setCustomStart}
                onCustomEndChange={setCustomEnd}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-full border border-line/70 bg-slate px-2 py-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={clsx(
                  "rounded-full px-6 py-2 text-xs uppercase tracking-[0.25em] transition",
                  activeTab === tab.id
                    ? "bg-accent text-ink"
                    : "text-white/60 hover:text-white"
                )}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto mt-10 max-w-6xl">
        {activeTab === "stats" ? (
          <StatsView range={range} />
        ) : (
          <BatchesView range={range} />
        )}
      </main>
    </div>
  );
}
