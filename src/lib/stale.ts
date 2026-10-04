export const STALE_YEARS = 2

export function isStaleSince(lastModified: Date, now: number = Date.now()): boolean {
  const cutoff = new Date(now)
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - STALE_YEARS)
  return lastModified.valueOf() < cutoff.valueOf()
}
