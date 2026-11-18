/** Relative change against the previous period, or null when there is nothing to compare against. */
export function periodChange(current: number | null | undefined, previous: number | null | undefined) {
  if (current == null || !Number.isFinite(current) || !previous || !Number.isFinite(previous)) return null
  return (current - previous) / previous
}
