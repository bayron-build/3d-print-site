"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  isSpam,
  validateRequest,
  type FileMeta,
} from "@/lib/requests/validation";
import { sendConfirmationEmail } from "@/lib/email/notifications";

export type SubmitState = { errors: Record<string, string> | null };

// Metadata about a file the browser already uploaded to storage. The bytes
// themselves never pass through this action (1MB/4.5MB body caps).
export type UploadedFile = {
  storagePath: string;
  originalName: string;
  sizeBytes: number;
};

const GENERIC_ERROR = "Er ging iets mis, probeer het later opnieuw.";

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

  const result = validateRequest({
    type: String(formData.get("type") ?? ""),
    customerName: String(formData.get("customerName") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    productId: String(formData.get("productId") ?? ""),
    description: String(formData.get("description") ?? ""),
    color: String(formData.get("color") ?? ""),
    material: String(formData.get("material") ?? ""),
    quantity: String(formData.get("quantity") ?? ""),
    licenseAccepted: formData.get("licenseAccepted") === "on",
    files: uploadedFiles.map(
      (file): FileMeta => ({
        name: file.originalName,
        sizeBytes: file.sizeBytes,
      })
    ),
    photos: [],
  });

  if (!result.ok) {
    return { errors: result.errors };
  }

  const supabase = await createClient();

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
    color: result.data.color,
    material: result.data.material,
    quantity: result.data.quantity,
    license_accepted: result.data.licenseAccepted,
  });

  if (requestError) {
    return { errors: { form: GENERIC_ERROR } };
  }

  if (result.data.type === "file") {
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
