// "vandaag"/"gisteren" for fresh requests, short Dutch date otherwise —
// the admin scans the list on recency.
export function formatRequestDate(value: string, now: Date = new Date()): string {
  const date = new Date(value);
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round(
    (startOfDay(now) - startOfDay(date)) / 86_400_000
  );
  if (dayDiff === 0) return "vandaag";
  if (dayDiff === 1) return "gisteren";
  return date.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
