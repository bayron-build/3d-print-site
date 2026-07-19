import { describe, expect, it } from "vitest";
import { selectOrphans, type BucketObject } from "./orphans";

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
