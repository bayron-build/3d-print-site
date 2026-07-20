// Bambu filament colors for fixed-price (catalog) orders. The color list
// itself lives in the filament_colors table (migration 0008); this module
// holds the pure helpers shared by the picker, the pages and the server
// action.

export type FilamentColor = {
  id: string;
  line: string; // "basic" | "matte" — plain string: rows arrive untyped from Supabase
  name: string;
  hex: string; // includes the leading "#"
  available: boolean;
};

export const DEFAULT_COLOR_ID = "basic-black";

// Shown under the picker when the selected color is not in stock.
export const OUT_OF_STOCK_NOTE =
  "Deze kleur is niet op voorraad, levering duurt enkele dagen langer.";

export function lineLabel(line: string): string {
  return line === "matte" ? "PLA Matte" : "PLA Basic";
}

// Snapshot string written into requests.color at order time. Point-in-time
// by design: later stock or palette changes must never rewrite old orders.
export function formatColorSnapshot(color: {
  line: string;
  name: string;
  available: boolean;
}): string {
  const base = `${lineLabel(color.line)} – ${color.name}`;
  return color.available
    ? base
    : `${base} (niet op voorraad, langere levertijd)`;
}

// ?color= URL param → a known color id, else the default. Same silent-ignore
// posture as ?product= and ?type= on the request page.
export function resolveColorId(
  param: string | string[] | undefined,
  colors: { id: string }[]
): string {
  return typeof param === "string" &&
    colors.some((color) => color.id === param)
    ? param
    : DEFAULT_COLOR_ID;
}

// Near-white swatches disappear against a white page without a border.
// Perceived-brightness formula; 220/255 keeps Light Gray borderless while
// catching the whites and Beige.
export function isNearWhite(hex: string): boolean {
  const value = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return false;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 220;
}
