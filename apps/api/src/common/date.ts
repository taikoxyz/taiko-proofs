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
  defaultDays = 7
): { startDate: Date; endDate: Date; endIsDateOnly: boolean } {
  const endIsDateOnly = end ? !end.includes("T") : true;
  const startIsDateOnly = start ? !start.includes("T") : endIsDateOnly;

  const now = new Date();
  const rawEnd = end ? new Date(end) : now;
  const endDate = endIsDateOnly ? startOfUtcDay(rawEnd) : rawEnd;

  const rawStart = start ? new Date(start) : addDays(endDate, -defaultDays);
  const startDate = startIsDateOnly ? startOfUtcDay(rawStart) : rawStart;

  return { startDate, endDate, endIsDateOnly };
}
