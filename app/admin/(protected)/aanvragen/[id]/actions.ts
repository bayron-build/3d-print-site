"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateQuote } from "@/lib/requests/admin-validation";

export type UpdateState = { errors: Record<string, string> | null; ok: boolean };

const GENERIC_ERROR = "Er ging iets mis, probeer het later opnieuw.";

// The single place a request's quote and status change. Phase 5 will hook a
// "status changed → email the customer" step onto this action.
export async function updateRequest(
  _prevState: UpdateState,
  formData: FormData
): Promise<UpdateState> {
  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) {
    return { errors: { form: GENERIC_ERROR }, ok: false };
  }

  const result = validateQuote({
    designFee: String(formData.get("designFee") ?? ""),
    printFee: String(formData.get("printFee") ?? ""),
    status: String(formData.get("status") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });

  if (!result.ok) {
    return { errors: result.errors, ok: false };
  }

  const supabase = await createClient();
  // RLS restricts UPDATE to the admin; a non-admin session cannot reach here.
  const { error } = await supabase
    .from("requests")
    .update({
      quote_design_fee: result.data.designFee,
      quote_print_fee: result.data.printFee,
      status: result.data.status,
      admin_notes: result.data.notes,
    })
    .eq("id", requestId);

  if (error) {
    return { errors: { form: GENERIC_ERROR }, ok: false };
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/aanvragen/${requestId}`);
  return { errors: null, ok: true };
}

// Removes storage objects first, then the request row (the DB cascade removes
// request_files rows). If storage removal fails, abort and leave everything
// intact — a retry is always possible, and we never orphan files that no
// longer have a request pointing at them.
export async function deleteRequest(formData: FormData): Promise<void> {
  const requestId = String(formData.get("requestId") ?? "");
  if (!requestId) {
    redirect("/admin");
  }

  const supabase = await createClient();

  const { data: files, error: filesError } = await supabase
    .from("request_files")
    .select("storage_path")
    .eq("request_id", requestId);
  if (filesError) {
    throw new Error("Kon bestanden niet ophalen.");
  }

  if (files && files.length > 0) {
    const { error: storageError } = await supabase.storage
      .from("request-files")
      .remove(files.map((file) => file.storage_path));
    if (storageError) {
      throw new Error("Kon bestanden niet verwijderen.");
    }
  }

  const { error: deleteError } = await supabase
    .from("requests")
    .delete()
    .eq("id", requestId);
  if (deleteError) {
    throw new Error("Kon de aanvraag niet verwijderen.");
  }

  revalidatePath("/admin");
  redirect("/admin");
}
