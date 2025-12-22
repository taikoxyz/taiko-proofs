"use client";

import { format, subDays } from "date-fns";
import clsx from "clsx";

export type RangePreset = "7" | "30" | "90" | "custom";

interface RangePickerProps {
  preset: RangePreset;
  customStart: string;
  customEnd: string;
  onPresetChange: (preset: RangePreset) => void;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
}

const presets: { label: string; value: RangePreset }[] = [
  { label: "7d", value: "7" },
  { label: "30d", value: "30" },
  { label: "90d", value: "90" },
  { label: "Custom", value: "custom" }
];

export function resolveRange(preset: RangePreset, customStart: string, customEnd: string) {
  const end = format(new Date(), "yyyy-MM-dd");
  if (preset === "custom") {
    return { start: customStart, end: customEnd };
  }

  const days = Number(preset);
  return {
    start: format(subDays(new Date(), days), "yyyy-MM-dd"),
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
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2 rounded-full border border-line/70 bg-slate px-1 py-1">
        {presets.map((item) => (
          <button
            key={item.value}
            className={clsx(
              "rounded-full px-4 py-1 text-xs uppercase tracking-[0.2em] transition",
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
        <div className="flex items-center gap-2 text-xs text-white/70">
          <input
            type="date"
            value={customStart}
            onChange={(event) => onCustomStartChange(event.target.value)}
            className="rounded-md border border-line/70 bg-slate px-3 py-1"
          />
          <span>to</span>
          <input
            type="date"
            value={customEnd}
            onChange={(event) => onCustomEndChange(event.target.value)}
            className="rounded-md border border-line/70 bg-slate px-3 py-1"
          />
        </div>
      )}
    </div>
  );
}
