// Pure validation for the admin product form and photo uploads. No I/O —
// unit-testable and shared by client (pre-upload checks) and server actions.
// Mirrors lib/requests/admin-validation.ts.

import { parseFee } from "@/lib/requests/admin-validation";

export const MAX_PHOTOS = 6;
// Keep in sync with the bucket's file_size_limit in 0005_product_photos.sql.
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const PHOTO_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

export type ProductInput = {
  name: string;
  description: string;
  indicativePrice: string;
  active: boolean;
};

export type ValidProduct = {
  name: string;
  description: string | null;
  indicativePrice: number | null;
  active: boolean;
};

export type ProductValidationResult =
  | { ok: true; data: ValidProduct }
  | { ok: false; errors: Record<string, string> };

export function validateProduct(input: ProductInput): ProductValidationResult {
  const errors: Record<string, string> = {};

  const name = input.name.trim();
  if (name === "") {
    errors.name = "Vul een naam in.";
  } else if (name.length > 120) {
    errors.name = "Gebruik maximaal 120 tekens.";
  }

  const price = parseFee(input.indicativePrice);
  if (!price.ok) {
    errors.indicativePrice =
      "Vul een geldig bedrag in (bijv. 12,50) of laat leeg.";
  } else if (input.active && price.value === null) {
    // Fixed-price ordering: the customer pays this amount, so an active
    // (orderable) product must have one. Inactive drafts may stay empty.
    errors.indicativePrice = "Een actief product heeft een vaste prijs nodig.";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      name,
      description: input.description.trim() || null,
      indicativePrice: price.ok ? price.value : null,
      active: input.active,
    },
  };
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

export type PhotoMeta = { name: string; sizeBytes: number };

// Dutch error message, or null when the batch may upload.
export function validatePhotos(
  existingCount: number,
  files: PhotoMeta[]
): string | null {
  if (files.length === 0) {
    return "Kies eerst één of meer foto's.";
  }
  if (existingCount + files.length > MAX_PHOTOS) {
    return `Maximaal ${MAX_PHOTOS} foto's per product.`;
  }
  for (const file of files) {
    if (!PHOTO_EXTENSIONS.includes(extensionOf(file.name))) {
      return "Alleen .jpg, .jpeg, .png of .webp bestanden.";
    }
    if (file.sizeBytes > MAX_PHOTO_BYTES) {
      return "Foto's mogen maximaal 10MB zijn.";
    }
  }
  return null;
}

// Postgres numeric arrives as string or number; the form edits it with a
// Dutch comma. Same idea as the quote form's feeToInput.
export function priceToInput(value: number | string | null): string {
  if (value === null) return "";
  return String(value).replace(".", ",");
}
