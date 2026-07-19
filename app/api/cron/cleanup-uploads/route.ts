import {
  listAllObjects,
  selectOrphans,
  type BucketObject,
} from "@/lib/cleanup/orphans";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "request-files";

// Daily Vercel Cron (see vercel.json): deletes uploads no request_files row
// references, once they are older than 24h. Uploads happen browser → bucket
// BEFORE the request row exists, so abandoned submissions leak objects that
// anon can never delete — this is the only place they get cleaned up.
export async function GET(request: Request) {
  // Vercel sends `Authorization: Bearer ${CRON_SECRET}` on cron calls.
  // Fail closed when the env var is missing.
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dry") === "1";

  try {
    const supabase = createAdminClient();

    const objects = await listAllObjects(async (prefix, offset, limit) => {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list(prefix, { offset, limit });
      if (error) {
        throw new Error(`Listing "${prefix}" failed: ${error.message}`);
      }
      return data;
    });

    const referenced = await fetchReferencedPaths(supabase, objects);
    const orphans = selectOrphans(objects, referenced, new Date());

    if (!dryRun && orphans.length > 0) {
      const { error } = await supabase.storage.from(BUCKET).remove(orphans);
      if (error) {
        throw new Error(`Deleting orphans failed: ${error.message}`);
      }
    }

    console.log(
      `[cleanup-uploads] checked=${objects.length} ` +
        `${dryRun ? "would-delete" : "deleted"}=${orphans.length}`,
      orphans
    );
    return Response.json({ checked: objects.length, orphans, dryRun });
  } catch (error) {
    // A failed run deletes nothing extra and the next daily run retries,
    // so log + 500 (Vercel marks the cron run failed) is all we need.
    console.error("[cleanup-uploads] run failed:", error);
    return new Response("Cleanup failed", { status: 500 });
  }
}

async function fetchReferencedPaths(
  supabase: ReturnType<typeof createAdminClient>,
  objects: BucketObject[]
): Promise<Set<string>> {
  if (objects.length === 0) return new Set();
  const { data, error } = await supabase
    .from("request_files")
    .select("storage_path")
    .in(
      "storage_path",
      objects.map((object) => object.path)
    );
  if (error) {
    throw new Error(`Loading request_files failed: ${error.message}`);
  }
  return new Set(data.map((row) => row.storage_path));
}
