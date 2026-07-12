import { createClient } from "./server";

// Answers "is the caller the admin?" from locally verified JWT claims
// (getClaims verifies the token against Supabase's public signing keys —
// no network round-trip per request). The admin is the user whose
// app_metadata carries role "admin"; see the Phase 2 design doc.
export async function getAdminSession(): Promise<{
  isAdmin: boolean;
  email: string | null;
}> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  return {
    isAdmin: claims?.app_metadata?.role === "admin",
    email: claims?.email ?? null,
  };
}
