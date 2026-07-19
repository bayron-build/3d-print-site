// Pure helpers for product versions ("uitvoeringen"): admin-form validation,
// picker option building, and the decision half of the server action's
// version lookup. No I/O — shared by client, server actions and tests.
// Mirrors lib/products/validation.ts.

import { parseFee } from "@/lib/requests/admin-validation";
import { toAmount } from "@/lib/format";

// Shared cap for version names and the product's base-price label.
export const MAX_VERSION_NAME_LENGTH = 40;

// Customer-facing label of the base-price option when the label is empty.
export const DEFAULT_BASE_VERSION_LABEL = "Standaard";

// Row shape from product_versions; numeric columns may arrive as strings.
export type ProductVersion = {
  id: string;
  product_id: string;
  name: string;
  price: number | string;
  compare_at_price: number | string | null;
  photo_path: string | null;
  sort_order: number;
};

export type VersionInput = {
  name: string;
  price: string;
  compareAtPrice: string;
};

export type ValidVersion = {
  name: string;
  price: number;
  compareAtPrice: number | null;
};

export type VersionValidationResult =
  | { ok: true; data: ValidVersion }
  | { ok: false; errors: Record<string, string> };

export function validateVersion(input: VersionInput): VersionValidationResult {
  const errors: Record<string, string> = {};

  const name = input.name.trim();
  if (name === "") {
    errors.name = "Vul een naam in.";
  } else if (name.length > MAX_VERSION_NAME_LENGTH) {
    errors.name = `Gebruik maximaal ${MAX_VERSION_NAME_LENGTH} tekens.`;
  }

  // Unlike product prices (nullable for inactive drafts), a version IS its
  // price: empty and zero are both invalid, matching the DB's price > 0.
  const price = parseFee(input.price);
  const priceValid = price.ok && price.value !== null && price.value > 0;
  if (!priceValid) {
    errors.price = "Vul een geldig bedrag in (bijv. 12,50).";
  }

  const compareAt = parseFee(input.compareAtPrice);
  if (!compareAt.ok) {
    errors.compareAtPrice = "Vul een geldig bedrag in (bijv. 12,50) of laat leeg.";
  } else if (compareAt.value !== null && priceValid && compareAt.value <= price.value!) {
    // Mirrors the DB check compare_at_price > price: equal is not a discount.
    errors.compareAtPrice = "De oorspronkelijke prijs moet hoger zijn dan de prijs.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      name,
      price: price.ok ? price.value! : 0,
      compareAtPrice: compareAt.ok ? compareAt.value : null,
    },
  };
}

// Empty or whitespace label falls back to the default.
export function baseVersionLabel(label: string | null): string {
  const trimmed = label?.trim() ?? "";
  return trimmed === "" ? DEFAULT_BASE_VERSION_LABEL : trimmed;
}

// One selectable card in the customer-facing picker. id "" is the base-price
// option: it maps to no product_versions row and adds no &version= param.
export type VersionOption = {
  id: string;
  label: string;
  price: number;
  compareAtPrice: number | null;
  photoPath: string | null;
};

// Empty array = render no picker (versionless product, missing price, or a
// degraded versions fetch — the caller passes [] on error).
export function buildVersionOptions(
  product: {
    indicative_price: number | string | null;
    base_version_label: string | null;
  },
  versions: ProductVersion[]
): VersionOption[] {
  if (versions.length === 0 || product.indicative_price === null) {
    return [];
  }
  const sorted = [...versions].sort((a, b) => a.sort_order - b.sort_order);
  return [
    {
      id: "",
      label: baseVersionLabel(product.base_version_label),
      price: toAmount(product.indicative_price),
      compareAtPrice: null,
      photoPath: null,
    },
    ...sorted.map((version) => ({
      id: version.id,
      label: version.name,
      price: toAmount(version.price),
      compareAtPrice:
        version.compare_at_price === null
          ? null
          : toAmount(version.compare_at_price),
      photoPath: version.photo_path,
    })),
  ];
}

export type VersionLookup =
  | { ok: true; name: string; price: number | string }
  | { ok: false };

// Decision half of the server action's version lookup: the action fetches the
// row by id, this decides what it means for the submitted product. A missing
// row covers unknown ids AND versions of inactive products (RLS hides those).
export function checkVersionRow(
  row: { product_id: string; name: string; price: number | string } | null,
  productId: string
): VersionLookup {
  if (!row || row.product_id !== productId) {
    return { ok: false };
  }
  return { ok: true, name: row.name, price: row.price };
}
