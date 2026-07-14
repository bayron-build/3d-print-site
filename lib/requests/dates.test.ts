import { describe, expect, it } from "vitest";
import { formatRequestDate } from "./dates";

const NOW = new Date(2026, 6, 14, 15, 0); // 14 jul 2026

describe("formatRequestDate", () => {
  it("returns vandaag for the same day", () => {
    expect(formatRequestDate(new Date(2026, 6, 14, 9, 0).toISOString(), NOW)).toBe("vandaag");
  });
  it("returns gisteren for the previous day", () => {
    expect(formatRequestDate(new Date(2026, 6, 13, 23, 0).toISOString(), NOW)).toBe("gisteren");
  });
  it("returns a short date for older days", () => {
    expect(formatRequestDate(new Date(2026, 5, 2).toISOString(), NOW)).toBe("2 jun 2026");
  });
});
