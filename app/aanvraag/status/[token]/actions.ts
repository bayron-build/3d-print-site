"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ApproveState = { error: string | null };

const GENERIC_ERROR = "Er ging iets mis, probeer het later opnieuw.";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Accept the quote for the request behind this token. The database function
// only flips quoted -> approved; any other current status (double click,
// stale tab) matches nothing, and the revalidated page simply shows the
// current state. No email goes out for 'approved' by design.
export async function approveQuote(
  _prevState: ApproveState,
  formData: FormData
): Promise<ApproveState> {
  const token = String(formData.get("token") ?? "");
  // Postgres rejects a non-uuid argument with a cast error; catch it here so
  // a hand-crafted POST gets the same generic message as any other failure.
  if (!UUID_PATTERN.test(token)) {
    return { error: GENERIC_ERROR };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_quote_by_token", {
    p_token: token,
  });

  if (error) {
    return { error: GENERIC_ERROR };
  }

  // Applied or not, re-render the page with whatever the status now is.
  revalidatePath(`/aanvraag/status/${token}`);
  return { error: null };
}
