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

// Shape of one storage.list() entry we rely on: id is null for folders.
export interface ListedEntry {
  name: string;
  id: string | null;
  created_at: string | null;
}

export type ListPage = (
  prefix: string,
  offset: number,
  limit: number
) => Promise<ListedEntry[]>;

const LIST_PAGE_SIZE = 1000;

// storage.list() returns one folder level at a time and caps each response,
// so both recursion and offset-pagination are needed — otherwise growth past
// one page would silently truncate the scan and strand orphans forever.
export async function listAllObjects(
  listPage: ListPage,
  prefix = "",
  pageSize: number = LIST_PAGE_SIZE
): Promise<BucketObject[]> {
  const objects: BucketObject[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await listPage(prefix, offset, pageSize);
    for (const entry of page) {
      const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.id === null) {
        objects.push(...(await listAllObjects(listPage, path, pageSize)));
      } else {
        objects.push({ path, createdAt: entry.created_at });
      }
    }
    if (page.length < pageSize) break;
  }
  return objects;
}
