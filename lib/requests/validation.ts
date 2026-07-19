// Shared validation for the public request form. Pure functions only — no
// I/O — so the client can pre-validate for fast feedback and the server
// action re-validates the exact same rules. Client checks are UX; the
// server + row level security are the boundary.

export const REQUEST_TYPES = ["catalog", "file", "custom"] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const MAX_FILES = 5;
// Must match the bucket's file_size_limit in migration 0003 — the bucket
// cap is the server-enforced boundary, this constant is the friendly check.
export const MAX_FILE_SIZE_BYTES = 52428800; // 50MB
export const ALLOWED_EXTENSIONS = [".stl", ".3mf", ".step", ".stp"] as const;

export const MAX_PHOTOS = 5;
// Same 10MB cap as product photos; well under the bucket's 50MB limit,
// which stays the server-enforced boundary.
export const MAX_PHOTO_SIZE_BYTES = 10485760; // 10MB
export const ALLOWED_PHOTO_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
] as const;

// Metadata-only view of a file: fits both browser File objects and the
// upload records the server action receives.
export type FileMeta = {
  name: string;
  sizeBytes: number;
};

// Raw form values; quantity stays a string because FormData has no numbers.
export type RequestInput = {
  type: string;
  customerName: string;
  email: string;
  phone: string;
  productId: string;
  description: string;
  color: string;
  material: string;
  quantity: string;
  licenseAccepted: boolean;
  colorId: string;
  // Catalog only: chosen product_versions id; "" = the base-price option.
  versionId: string;
  files: FileMeta[];
  photos: FileMeta[];
};

// Cleaned values ready for the requests-table insert.
export type ValidRequest = {
  type: RequestType;
  customerName: string;
  email: string;
  phone: string | null;
  productId: string | null;
  description: string | null;
  color: string | null;
  material: string | null;
  quantity: number;
  licenseAccepted: boolean;
  // Catalog only: id in filament_colors. The server action resolves it to a
  // snapshot string; the id itself is never stored.
  colorId: string | null;
  // Catalog only: id in product_versions, null for the base-price option.
  // The server action resolves it to a name+price snapshot itself.
  versionId: string | null;
};

export type ValidationResult =
  | { ok: true; data: ValidRequest }
  | { ok: false; errors: Record<string, string> };

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

export function validateRequest(input: RequestInput): ValidationResult {
  const errors: Record<string, string> = {};

  const type = REQUEST_TYPES.find((t) => t === input.type);
  if (!type) {
    errors.type = "Kies een type aanvraag.";
  }

  const customerName = input.customerName.trim();
  if (!customerName) {
    errors.customerName = "Vul je naam in.";
  }

  const email = input.email.trim();
  if (!EMAIL_PATTERN.test(email)) {
    errors.email = "Vul een geldig e-mailadres in.";
  }

  const description = input.description.trim();
  if (type === "custom" && !description) {
    errors.description =
      "Beschrijf wat je wilt laten maken (afmetingen, doel).";
  }

  const productId = input.productId.trim();
  if (type === "catalog" && !productId) {
    errors.productId = "Kies een product.";
  }

  // The picker always submits a color (defaults to black); a missing id only
  // happens on hand-crafted POSTs. Existence in filament_colors is checked
  // by the server action — this module stays I/O-free.
  const colorId = input.colorId.trim();
  if (type === "catalog" && !colorId) {
    errors.colorId = "Kies een kleur.";
  }

  // No validation rule: an empty id IS the base-price option. Existence and
  // ownership are the server action's job — this module stays I/O-free.
  const versionId = input.versionId.trim();

  // Custom requests are quoted per piece anyway; quantity applies to the
  // other two types and defaults to 1.
  let quantity = 1;
  if (type === "catalog" || type === "file") {
    quantity = Number.parseInt(input.quantity, 10);
    if (!Number.isInteger(quantity) || quantity < 1) {
      errors.quantity = "Vul een aantal van minimaal 1 in.";
    }
  }

  if (type === "file") {
    const fileError = validateFiles(input.files);
    if (fileError) {
      errors.files = fileError;
    }
    if (!input.licenseAccepted) {
      errors.licenseAccepted =
        "Bevestig dat je het ontwerp mag (laten) printen.";
    }
    if (input.photos.length > 0) {
      errors.photos = "Foto's horen niet bij dit type aanvraag.";
    }
  }

  // Reference photos are a custom-only feature. The client only ever sends
  // the matching upload kind; these rejections only hit hand-crafted POSTs.
  if (type === "custom") {
    const photoError = validatePhotos(input.photos);
    if (photoError) {
      errors.photos = photoError;
    }
  }

  if (type === "catalog") {
    if (input.files.length > 0) {
      errors.files = "Bestanden horen niet bij dit type aanvraag.";
    }
    if (input.photos.length > 0) {
      errors.photos = "Foto's horen niet bij dit type aanvraag.";
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      type: type!,
      customerName,
      email,
      phone: input.phone.trim() || null,
      productId: type === "catalog" ? productId : null,
      description: description || null,
      color: input.color.trim() || null,
      material: input.material.trim() || null,
      quantity,
      licenseAccepted: input.licenseAccepted,
      colorId: type === "catalog" ? colorId : null,
      versionId: type === "catalog" ? versionId || null : null,
    },
  };
}

export function validateFiles(files: FileMeta[]): string | null {
  if (files.length === 0) {
    return "Voeg minimaal één bestand toe.";
  }
  if (files.length > MAX_FILES) {
    return `Maximaal ${MAX_FILES} bestanden per aanvraag.`;
  }
  for (const file of files) {
    if (!hasAllowedExtension(file.name)) {
      return `"${file.name}" is geen ondersteund bestandstype (${ALLOWED_EXTENSIONS.join(", ")}).`;
    }
    if (file.sizeBytes > MAX_FILE_SIZE_BYTES) {
      return `"${file.name}" is groter dan 50MB.`;
    }
  }
  return null;
}

export function hasAllowedExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// Photos are optional on custom requests: zero photos is valid.
export function validatePhotos(photos: FileMeta[]): string | null {
  if (photos.length > MAX_PHOTOS) {
    return `Maximaal ${MAX_PHOTOS} foto's per aanvraag.`;
  }
  for (const photo of photos) {
    if (!isImageFileName(photo.name)) {
      return `"${photo.name}" is geen ondersteund fototype (${ALLOWED_PHOTO_EXTENSIONS.join(", ")}).`;
    }
    if (photo.sizeBytes > MAX_PHOTO_SIZE_BYTES) {
      return `"${photo.name}" is groter dan 10MB.`;
    }
  }
  return null;
}

// Doubles as the admin detail page's thumbnail-vs-download-row switch:
// an upload is a photo purely by extension (spec: no kind column).
export function isImageFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return ALLOWED_PHOTO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// A real visitor never sees the honeypot field; any content means a bot.
export function isSpam(honeypot: string): boolean {
  return honeypot.trim() !== "";
}

// Storage object keys allow a limited character set: keep letters, digits,
// dot, dash, underscore; replace the rest. The original name is preserved
// separately in request_files.original_name.
export function sanitizeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, "_");
}
