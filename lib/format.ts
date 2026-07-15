// Dutch money formatting, shared by emails, the catalog and admin pages.

// € 1.234,56 — Dutch grouping and comma decimals. Accepts the string form
// Postgres numeric columns may arrive in.
export function formatEuro(value: number | string): string {
  const amount = typeof value === "string" ? Number.parseFloat(value) : value;
  const [whole, decimals] = amount.toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `€ ${grouped},${decimals}`;
}

// File sizes shown to users: MB with one decimal above 1MB, otherwise KB.
export function formatFileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// Postgres numeric(10,2) arrives as string or number depending on the
// driver; normalise before any arithmetic. Null (no value) counts as zero.
export function toAmount(value: number | string | null): number {
  if (value === null) return 0;
  return typeof value === "string" ? Number.parseFloat(value) : value;
}
