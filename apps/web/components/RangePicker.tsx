"use client";

import { subDays } from "date-fns";
import clsx from "clsx";
import { formatUtcDate } from "../lib/date";

export type RangePreset = "1" | "7" | "30" | "90" | "custom";

interface RangePickerProps {
  preset: RangePreset;
  customStart: string;
  customEnd: string;
  onPresetChange: (preset: RangePreset) => void;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
}

const presets: { label: string; value: RangePreset }[] = [
  { label: "1d", value: "1" },
  { label: "7d", value: "7" },
  { label: "30d", value: "30" },
  { label: "90d", value: "90" },
  { label: "Custom", value: "custom" }
];

export function resolveRange(preset: RangePreset, customStart: string, customEnd: string) {
  const now = new Date();
  const end = formatUtcDate(now);
  if (preset === "custom") {
    return {
      start: customStart ? `${customStart}Z` : "",
      end: customEnd ? `${customEnd}Z` : ""
    };
  }

  const days = Number(preset);
  return {
    start: formatUtcDate(subDays(now, days)),
    end
  };
}

export default function RangePicker({
  preset,
  customStart,
  customEnd,
  onPresetChange,
  onCustomStartChange,
  onCustomEndChange
}: RangePickerProps) {
  return (
    <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
      <div className="flex w-full flex-wrap items-center gap-2 rounded-full border border-line/70 bg-slate px-1 py-1 sm:w-auto">
        {presets.map((item) => (
          <button
            key={item.value}
            className={clsx(
              "rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.2em] transition sm:px-4 sm:text-xs",
              preset === item.value
                ? "bg-accent text-ink"
                : "text-white/60 hover:text-white"
            )}
            onClick={() => onPresetChange(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {preset === "custom" && (
        <div className="flex w-full flex-col gap-3 text-xs text-white/70 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="datetime-local"
              value={customStart}
              step={60}
              onChange={(event) => onCustomStartChange(event.target.value)}
              className="w-full rounded-md border border-line/70 bg-slate px-3 py-1 sm:w-auto"
            />
            <span>to</span>
            <input
              type="datetime-local"
              value={customEnd}
              step={60}
              onChange={(event) => onCustomEndChange(event.target.value)}
              className="w-full rounded-md border border-line/70 bg-slate px-3 py-1 sm:w-auto"
            />
          </div>
          <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 sm:ml-auto">
            UTC
          </span>
        </div>
      )}
    </div>
  );
}
