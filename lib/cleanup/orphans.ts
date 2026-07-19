// Pure logic for the daily orphan-upload cleanup: no Supabase imports here,
// so every rule is unit-testable. The cron route wires this to the real
// Storage API and database.

export interface BucketObject {
  path: string;
  createdAt: string | null;
}

const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Deleting is only safe when BOTH hold: no request_files row references the
// path, and the object is provably older than the threshold (a young or
// undated object may belong to a submission happening right now).
export function selectOrphans(
  objects: BucketObject[],
  referencedPaths: ReadonlySet<string>,
  now: Date,
  maxAgeMs: number = DEFAULT_MAX_AGE_MS
): string[] {
  return objects
    .filter((object) => {
      if (referencedPaths.has(object.path)) return false;
      if (object.createdAt === null) return false;
      return now.getTime() - new Date(object.createdAt).getTime() > maxAgeMs;
    })
    .map((object) => object.path);
}
