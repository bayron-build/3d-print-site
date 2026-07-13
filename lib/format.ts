// Dutch money formatting, shared by emails, the catalog and admin pages.

// € 1.234,56 — Dutch grouping and comma decimals. Accepts the string form
// Postgres numeric columns may arrive in.
export function formatEuro(value: number | string): string {
  const amount = typeof value === "string" ? Number.parseFloat(value) : value;
  const [whole, decimals] = amount.toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `€ ${grouped},${decimals}`;
}
