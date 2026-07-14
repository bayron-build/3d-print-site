import { describe, expect, it } from "vitest";
import { countByStatus } from "./counts";

describe("countByStatus", () => {
  it("returns empty object for no rows", () => {
    expect(countByStatus([])).toEqual({});
  });
  it("counts per status", () => {
    expect(
      countByStatus([
        { status: "received" },
        { status: "received" },
        { status: "done" },
      ])
    ).toEqual({ received: 2, done: 1 });
  });
});
