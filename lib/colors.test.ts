import { describe, expect, it } from "vitest";
import {
  DEFAULT_COLOR_ID,
  formatColorSnapshot,
  isNearWhite,
  lineLabel,
  resolveColorId,
} from "./colors";

describe("lineLabel", () => {
  it("maps the two lines to their display labels", () => {
    expect(lineLabel("basic")).toBe("PLA Basic");
    expect(lineLabel("matte")).toBe("PLA Matte");
  });
});

describe("formatColorSnapshot", () => {
  it("formats an in-stock color as line – name", () => {
    expect(
      formatColorSnapshot({ line: "basic", name: "Black", available: true })
    ).toBe("PLA Basic – Black");
  });

  it("appends the delivery note for an out-of-stock color", () => {
    expect(
      formatColorSnapshot({ line: "matte", name: "Charcoal", available: false })
    ).toBe("PLA Matte – Charcoal (niet op voorraad, langere levertijd)");
  });
});

describe("resolveColorId", () => {
  const colors = [{ id: "basic-black" }, { id: "matte-plum" }];

  it("accepts a known id", () => {
    expect(resolveColorId("matte-plum", colors)).toBe("matte-plum");
  });

  it("falls back to the default for an unknown id", () => {
    expect(resolveColorId("basic-vantablack", colors)).toBe(DEFAULT_COLOR_ID);
  });

  it("falls back to the default when the param is missing or repeated", () => {
    expect(resolveColorId(undefined, colors)).toBe(DEFAULT_COLOR_ID);
    expect(resolveColorId(["a", "b"], colors)).toBe(DEFAULT_COLOR_ID);
  });

  it("falls back to the default for an empty color list", () => {
    expect(resolveColorId("basic-black", [])).toBe(DEFAULT_COLOR_ID);
  });
});

describe("isNearWhite", () => {
  it("flags white and near-white swatches", () => {
    expect(isNearWhite("#FFFFFF")).toBe(true);
    expect(isNearWhite("#F7E6DE")).toBe(true); // Beige
  });

  it("does not flag dark or saturated swatches", () => {
    expect(isNearWhite("#000000")).toBe(false);
    expect(isNearWhite("#F4EE2A")).toBe(false); // Yellow — bright but visible
  });

  it("treats malformed hex as not near-white", () => {
    expect(isNearWhite("banaan")).toBe(false);
  });
});
