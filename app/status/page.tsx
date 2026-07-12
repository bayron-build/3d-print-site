// Health-check page: proves the full chain (deploy -> env vars -> Supabase)
// works. Rendered on the server so the check runs from server code, exactly
// like real queries will in later phases.

// Re-run the check on every request instead of caching the result at build time.
export const dynamic = "force-dynamic";

type HealthResult = { ok: true } | { ok: false; detail: string };

async function checkSupabase(): Promise<HealthResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return { ok: false, detail: "Omgevingsvariabelen ontbreken" };
  }

  try {
    // The auth health endpoint returns 200 for any valid API key; a wrong or
    // missing key gives 401. (The REST root /rest/v1/ can't be used here: it
    // only accepts secret keys, which Phase 1 deliberately never touches.)
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key },
      cache: "no-store",
    });
    return res.ok ? { ok: true } : { ok: false, detail: `HTTP ${res.status}` };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : "Onbekende fout",
    };
  }
}

export default async function StatusPage() {
  const result = await checkSupabase();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8">
      <h1 className="text-2xl font-bold">Systeemstatus</h1>
      {result.ok ? (
        <p className="text-green-700">Database verbonden ✓</p>
      ) : (
        <p className="text-red-700">Geen verbinding ✗ ({result.detail})</p>
      )}
    </main>
  );
}
