function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function formatUtcDate(date: Date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate()
  )}`;
}

export function formatUtcDateTime(date: Date) {
  return `${formatUtcDate(date)}T${pad(date.getUTCHours())}:${pad(
    date.getUTCMinutes()
  )}`;
}
