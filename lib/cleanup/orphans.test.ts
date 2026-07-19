import { describe, expect, it } from "vitest";
import {
  listAllObjects,
  selectOrphans,
  type BucketObject,
  type ListedEntry,
} from "./orphans";

const NOW = new Date("2026-07-19T12:00:00Z");
const TWO_DAYS_AGO = "2026-07-17T12:00:00Z";
const ONE_HOUR_AGO = "2026-07-19T11:00:00Z";

function obj(path: string, createdAt: string | null): BucketObject {
  return { path, createdAt };
}

describe("selectOrphans", () => {
  it("selects old objects that no request references", () => {
    const objects = [obj("aaa/0-model.stl", TWO_DAYS_AGO)];
    expect(selectOrphans(objects, new Set(), NOW)).toEqual(["aaa/0-model.stl"]);
  });

  it("never selects objects referenced by a request_files row", () => {
    const objects = [obj("aaa/0-model.stl", TWO_DAYS_AGO)];
    const referenced = new Set(["aaa/0-model.stl"]);
    expect(selectOrphans(objects, referenced, NOW)).toEqual([]);
  });

  it("leaves young objects alone: they may belong to an in-flight submission", () => {
    const objects = [obj("bbb/0-photo.jpg", ONE_HOUR_AGO)];
    expect(selectOrphans(objects, new Set(), NOW)).toEqual([]);
  });

  // Exactly 24h old is still "young": the threshold must err toward keeping.
  it("does not select an object at exactly the age threshold", () => {
    const objects = [obj("ccc/0-a.stl", "2026-07-18T12:00:00Z")];
    expect(selectOrphans(objects, new Set(), NOW)).toEqual([]);
  });

  // A null timestamp means we cannot prove the object is old. Deleting a
  // file of unknown age risks racing a live upload, so it stays.
  it("never selects objects with an unknown timestamp", () => {
    const objects = [obj("ddd/0-b.stl", null)];
    expect(selectOrphans(objects, new Set(), NOW)).toEqual([]);
  });

  it("handles a mixed listing", () => {
    const objects = [
      obj("aaa/0-keep.stl", TWO_DAYS_AGO), // referenced
      obj("bbb/0-orphan.stl", TWO_DAYS_AGO), // orphan, old → delete
      obj("ccc/0-fresh.stl", ONE_HOUR_AGO), // orphan, young → keep
    ];
    const referenced = new Set(["aaa/0-keep.stl"]);
    expect(selectOrphans(objects, referenced, NOW)).toEqual([
      "bbb/0-orphan.stl",
    ]);
  });
});

const CREATED = "2026-07-17T12:00:00Z";

function file(name: string): ListedEntry {
  return { name, id: crypto.randomUUID(), created_at: CREATED };
}

function folder(name: string): ListedEntry {
  return { name, id: null, created_at: null };
}

// Fake Storage API over a prefix → entries map, slicing like the real
// list(prefix, { offset, limit }) endpoint does.
function fakeListPage(tree: Record<string, ListedEntry[]>) {
  return async (prefix: string, offset: number, limit: number) =>
    (tree[prefix] ?? []).slice(offset, offset + limit);
}

describe("listAllObjects", () => {
  it("walks folders and returns full paths with timestamps", async () => {
    const tree = {
      "": [folder("aaa"), folder("bbb")],
      aaa: [file("0-model.stl"), file("1-photo.jpg")],
      bbb: [file("0-thing.3mf")],
    };
    const objects = await listAllObjects(fakeListPage(tree));
    expect(objects).toEqual([
      { path: "aaa/0-model.stl", createdAt: CREATED },
      { path: "aaa/1-photo.jpg", createdAt: CREATED },
      { path: "bbb/0-thing.3mf", createdAt: CREATED },
    ]);
  });

  // The real bucket only nests one level (<uuid>/<n>-<name>), but the walk
  // must not silently drop deeper files if that ever changes.
  it("recurses into nested folders", async () => {
    const tree = {
      "": [folder("aaa")],
      aaa: [folder("deep")],
      "aaa/deep": [file("0-x.stl")],
    };
    const objects = await listAllObjects(fakeListPage(tree));
    expect(objects).toEqual([{ path: "aaa/deep/0-x.stl", createdAt: CREATED }]);
  });

  it("paginates: a level with more entries than one page is fully read", async () => {
    const tree = {
      "": [folder("aaa")],
      aaa: [file("0-a"), file("1-b"), file("2-c"), file("3-d"), file("4-e")],
    };
    const objects = await listAllObjects(fakeListPage(tree), "", 2);
    expect(objects.map((o) => o.path)).toEqual([
      "aaa/0-a",
      "aaa/1-b",
      "aaa/2-c",
      "aaa/3-d",
      "aaa/4-e",
    ]);
  });

  it("returns an empty list for an empty bucket", async () => {
    expect(await listAllObjects(fakeListPage({}))).toEqual([]);
  });
});
