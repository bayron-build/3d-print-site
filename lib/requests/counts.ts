// Pure count-per-status used by the dashboard filter cards.
export function countByStatus(
  rows: { status: string }[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }
  return counts;
}
