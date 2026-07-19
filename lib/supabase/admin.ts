import { createClient } from "@supabase/supabase-js";

// Service-role client for trusted server-only jobs (the cleanup cron). It
// bypasses RLS entirely, so it must never be imported from client
// components or from code paths a visitor's request can influence.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
