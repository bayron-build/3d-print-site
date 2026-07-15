import { describe, expect, it } from "vitest";
import { REQUEST_STATUSES, statusOptionsFor } from "./status";

describe("statusOptionsFor", () => {
  it("skips quoted and approved for fixed-price orders", () => {
    expect(statusOptionsFor(true)).toEqual([
      "received",
      "printing",
      "done",
      "rejected",
    ]);
  });

  it("offers every status when there is no fixed price", () => {
    expect(statusOptionsFor(false)).toEqual([...REQUEST_STATUSES]);
  });
});
