import { format } from "date-fns";

export function formatDateTime(value?: string | null) {
  if (!value) {
    return "—";
  }
  return format(new Date(value), "MMM d, HH:mm");
}

export function formatDate(value?: string | null) {
  if (!value) {
    return "—";
  }
  return format(new Date(value), "MMM d");
}

export function formatDurationSeconds(seconds?: number | null) {
  if (!seconds && seconds !== 0) {
    return "—";
  }

  if (seconds < 60) {
    return `${seconds.toFixed(0)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  if (minutes < 60) {
    return `${minutes}m ${remaining}s`;
  }

  const hours = Math.floor(minutes / 60);
  const leftover = minutes % 60;
  return `${hours}h ${leftover}m`;
}

export function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}
