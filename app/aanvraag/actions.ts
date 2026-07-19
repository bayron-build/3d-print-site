"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  isSpam,
  validateRequest,
  type FileMeta,
} from "@/lib/requests/validation";
import {
  sendConfirmationEmail,
  sendNewRequestNotification,
} from "@/lib/email/notifications";
import { formatColorSnapshot } from "@/lib/colors";
import { checkVersionRow } from "@/lib/products/versions";

export type SubmitState = { errors: Record<string, string> | null };

// Metadata about a file the browser already uploaded to storage. The bytes
// themselves never pass through this action (1MB/4.5MB body caps).
export type UploadedFile = {
  storagePath: string;
  originalName: string;
  sizeBytes: number;
};

const GENERIC_ERROR = "Er ging iets mis, probeer het later opnieuw.";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function submitRequest(
  _prevState: SubmitState,
  formData: FormData
): Promise<SubmitState> {
  // Bots fill every field; humans never see this one. Pretend success so
  // the bot learns nothing.
  if (isSpam(String(formData.get("website") ?? ""))) {
    redirect("/aanvraag/verzonden");
  }

  const uploadedFiles = parseUploadedFiles(formData.get("uploadedFiles"));
  if (uploadedFiles === null) {
    return { errors: { form: GENERIC_ERROR } };
  }

  const type = String(formData.get("type") ?? "");
  const uploadMeta = uploadedFiles.map(
    (file): FileMeta => ({
      name: file.originalName,
      sizeBytes: file.sizeBytes,
    })
  );

  // Custom uploads are reference photos, file uploads are 3D models; catalog
  // must have neither. Validation rejects uploads under the wrong key, so a
  // hand-crafted POST can't smuggle files onto the wrong request type.
  const result = validateRequest({
    type,
    customerName: String(formData.get("customerName") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    productId: String(formData.get("productId") ?? ""),
    description: String(formData.get("description") ?? ""),
    color: String(formData.get("color") ?? ""),
    material: String(formData.get("material") ?? ""),
    quantity: String(formData.get("quantity") ?? ""),
    licenseAccepted: formData.get("licenseAccepted") === "on",
    colorId: String(formData.get("colorId") ?? ""),
    versionId: String(formData.get("versionId") ?? ""),
    files: type === "custom" ? [] : uploadMeta,
    photos: type === "custom" ? uploadMeta : [],
  });

  if (!result.ok) {
    return { errors: result.errors };
  }

  const supabase = await createClient();

  // Fixed-price orders: the server looks the price up itself — a price sent
  // from the browser is never trusted. Unknown, inactive or unpriced products
  // are rejected. The active filter is load-bearing, not just documentation:
  // RLS hides inactive products from anon, but this action runs with the
  // caller's cookies, so an admin filling the form would otherwise see them.
  let unitPrice: number | string | null = null;
  let productName = "";
  if (result.data.type === "catalog") {
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("name, indicative_price")
      .eq("id", result.data.productId!)
      .eq("active", true)
      .maybeSingle();
    // A query error is a transport/database failure, not a verdict on the
    // product: the remedy is retry, not "pick something else".
    if (productError) {
      return { errors: { form: GENERIC_ERROR } };
    }
    if (!product || product.indicative_price === null) {
      return {
        errors: { productId: "Dit product is momenteel niet te bestellen." },
      };
    }
    unitPrice = product.indicative_price;
    productName = product.name;
  }

  // Same trust rule as the price and the color: the browser sends only a
  // version id; the server resolves name and price itself and snapshots
  // both. The product lookup above already proved the product is active —
  // and RLS hides versions of inactive products anyway, so a version of an
  // inactive product resolves to "no row" here.
  let versionName: string | null = null;
  if (result.data.type === "catalog" && result.data.versionId !== null) {
    // Reject malformed ids before the query: a non-uuid string would make
    // Postgres error on the cast, which must read as a bad choice, not as a
    // transport failure.
    if (!UUID_PATTERN.test(result.data.versionId)) {
      return { errors: { versionId: "Kies een versie." } };
    }
    const { data: versionRow, error: versionError } = await supabase
      .from("product_versions")
      .select("product_id, name, price")
      .eq("id", result.data.versionId)
      .maybeSingle();
    if (versionError) {
      return { errors: { form: GENERIC_ERROR } };
    }
    const version = checkVersionRow(versionRow, result.data.productId!);
    if (!version.ok) {
      return { errors: { versionId: "Kies een versie." } };
    }
    unitPrice = version.price;
    versionName = version.name;
  }

  // Same trust rule as the price: the browser sends only a color id, the
  // server resolves name and availability itself. The snapshot string is
  // point-in-time — later stock changes never rewrite this order.
  let colorSnapshot: string | null = null;
  if (result.data.type === "catalog") {
    const { data: color, error: colorError } = await supabase
      .from("filament_colors")
      .select("line, name, available")
      .eq("id", result.data.colorId!)
      .maybeSingle();
    if (colorError) {
      return { errors: { form: GENERIC_ERROR } };
    }
    if (!color) {
      return { errors: { colorId: "Kies een kleur." } };
    }
    colorSnapshot = formatColorSnapshot(color);
  }

  // Generate the id here instead of reading it back from the insert:
  // PostgREST only returns inserted rows to callers with SELECT permission,
  // and anonymous visitors must never be able to read requests. The access
  // token follows the same rule — it must go into the confirmation email,
  // and the inserted row can never be read back.
  const requestId = crypto.randomUUID();
  const accessToken = crypto.randomUUID();

  const { error: requestError } = await supabase.from("requests").insert({
    id: requestId,
    access_token: accessToken,
    type: result.data.type,
    product_id: result.data.productId,
    customer_name: result.data.customerName,
    email: result.data.email,
    phone: result.data.phone,
    description: result.data.description,
    color: colorSnapshot ?? result.data.color,
    material: result.data.material,
    quantity: result.data.quantity,
    license_accepted: result.data.licenseAccepted,
    unit_price: unitPrice,
    version_name: versionName,
  });

  if (requestError) {
    return { errors: { form: GENERIC_ERROR } };
  }

  // Photos (custom) and model files (file) share the request_files table;
  // validation has already confirmed uploads match the request type.
  if (uploadedFiles.length > 0) {
    const { error: filesError } = await supabase.from("request_files").insert(
      uploadedFiles.map((file) => ({
        request_id: requestId,
        storage_path: file.storagePath,
        original_name: file.originalName,
        size_bytes: file.sizeBytes,
      }))
    );
    if (filesError) {
      return { errors: { form: GENERIC_ERROR } };
    }
  }

  // Awaited (serverless can kill work after the response), but failure-proof:
  // sendConfirmationEmail never throws, so a Resend outage cannot fail a
  // submission that is already in the database.
  await sendConfirmationEmail({
    to: result.data.email,
    customerName: result.data.customerName,
    accessToken,
    order:
      unitPrice !== null
        ? {
            unitPrice,
            quantity: result.data.quantity,
            color: colorSnapshot ?? undefined,
            versionName: versionName ?? undefined,
          }
        : undefined,
  });

  // Owner alert — same never-throws guarantee as the confirmation above.
  await sendNewRequestNotification({
    requestId,
    customerName: result.data.customerName,
    email: result.data.email,
    phone: result.data.phone,
    order:
      unitPrice !== null
        ? {
            productName,
            unitPrice,
            quantity: result.data.quantity,
            color: colorSnapshot ?? undefined,
            versionName: versionName ?? undefined,
          }
        : undefined,
    request:
      unitPrice === null
        ? {
            description: result.data.description,
            color: result.data.color,
            material: result.data.material,
            quantity: result.data.quantity,
            fileCount: uploadedFiles.length,
          }
        : undefined,
  });

  redirect("/aanvraag/verzonden");
}

// The client sends upload metadata as one JSON string field. Parse
// defensively: hand-crafted POSTs can contain anything. Returns null on
// malformed input (treated as a generic error by the caller).
function parseUploadedFiles(
  value: FormDataEntryValue | null
): UploadedFile[] | null {
  if (value === null || value === "") {
    return [];
  }
  if (typeof value !== "string") {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return null;
    }
    const files: UploadedFile[] = [];
    for (const entry of parsed) {
      if (typeof entry !== "object" || entry === null) {
        return null;
      }
      const candidate = entry as Record<string, unknown>;
      if (
        typeof candidate.storagePath !== "string" ||
        typeof candidate.originalName !== "string" ||
        typeof candidate.sizeBytes !== "number"
      ) {
        return null;
      }
      files.push({
        storagePath: candidate.storagePath,
        originalName: candidate.originalName,
        sizeBytes: candidate.sizeBytes,
      });
    }
    return files;
  } catch {
    return null;
  }
}
