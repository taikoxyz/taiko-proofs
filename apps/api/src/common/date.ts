const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * ONE_DAY_MS);
}

export function parseDateRange(
  start?: string,
  end?: string,
  defaultDays = 30
): { startDate: Date; endDate: Date } {
  const endDate = end ? startOfUtcDay(new Date(end)) : startOfUtcDay(new Date());
  const startDate = start ? startOfUtcDay(new Date(start)) : addDays(endDate, -defaultDays);
  return { startDate, endDate };
}
