import { describe, expect, it } from "vitest";
import { formatEuro, formatFileSize, toAmount } from "./format";

describe("formatEuro", () => {
  it("formats numbers Dutch-style with two decimals", () => {
    expect(formatEuro(12.5)).toBe("€ 12,50");
    expect(formatEuro(0)).toBe("€ 0,00");
    expect(formatEuro(7)).toBe("€ 7,00");
  });

  it("accepts the string form Postgres numeric may arrive in", () => {
    expect(formatEuro("12.50")).toBe("€ 12,50");
  });

  it("groups thousands with a dot", () => {
    expect(formatEuro(1234.5)).toBe("€ 1.234,50");
  });
});

describe("formatFileSize", () => {
  it("formats megabytes with one decimal", () => {
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe("2.5 MB");
  });
  it("formats sub-MB sizes as KB, minimum 1", () => {
    expect(formatFileSize(512 * 1024)).toBe("512 KB");
    expect(formatFileSize(10)).toBe("1 KB");
  });
});

describe("toAmount", () => {
  it("passes numbers through", () => {
    expect(toAmount(12.5)).toBe(12.5);
  });

  it("parses the string form Postgres numeric arrives in", () => {
    expect(toAmount("7.25")).toBe(7.25);
  });

  it("treats null as zero", () => {
    expect(toAmount(null)).toBe(0);
  });
});
