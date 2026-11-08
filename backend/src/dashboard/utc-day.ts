// The calendar day (in UTC) that contains `now`, as a half-open range [from, before). UTC keeps
// the answer the same whatever time zone the server runs in.
export function utcDayRange(now: Date): { from: Date; before: Date } {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const before = new Date(from.getTime() + 24 * 60 * 60 * 1000);

  return { from, before };
}
