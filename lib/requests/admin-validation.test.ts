import { describe, expect, it } from "vitest";
import { parseFee, validateQuote, type QuoteInput } from "./admin-validation";

// Valid baseline; tests override single fields to isolate each rule.
function input(overrides: Partial<QuoteInput> = {}): QuoteInput {
  return {
    designFee: "",
    printFee: "",
    status: "received",
    notes: "",
    ...overrides,
  };
}

describe("parseFee", () => {
  it("treats empty and whitespace as null (fee not set)", () => {
    expect(parseFee("")).toEqual({ ok: true, value: null });
    expect(parseFee("   ")).toEqual({ ok: true, value: null });
  });

  it("accepts a dot decimal", () => {
    expect(parseFee("12.50")).toEqual({ ok: true, value: 12.5 });
  });

  it("accepts a Dutch comma decimal", () => {
    expect(parseFee("12,50")).toEqual({ ok: true, value: 12.5 });
  });

  it("accepts a whole number and zero", () => {
    expect(parseFee("40")).toEqual({ ok: true, value: 40 });
    expect(parseFee("0")).toEqual({ ok: true, value: 0 });
  });

  it("rejects negative amounts", () => {
    expect(parseFee("-5")).toEqual({ ok: false });
  });

  it("rejects more than two decimals", () => {
    expect(parseFee("12,505")).toEqual({ ok: false });
  });

  it("rejects non-numeric junk", () => {
    expect(parseFee("abc")).toEqual({ ok: false });
    expect(parseFee("1.2.3")).toEqual({ ok: false });
    expect(parseFee("€10")).toEqual({ ok: false });
  });

  it("rejects amounts beyond numeric(10,2) precision (9+ integer digits)", () => {
    expect(parseFee("123456789")).toEqual({ ok: false });
    expect(parseFee("99999999")).toEqual({ ok: true, value: 99999999 });
  });
});

describe("validateQuote", () => {
  it("accepts empty fees and returns nulls", () => {
    const result = validateQuote(input());
    expect(result).toEqual({
      ok: true,
      data: { designFee: null, printFee: null, status: "received", notes: null },
    });
  });

  it("accepts both fees with mixed separators and trims notes", () => {
    const result = validateQuote(
      input({
        designFee: "15",
        printFee: "7,25",
        status: "quoted",
        notes: "  Bespreken met klant  ",
      })
    );
    expect(result).toEqual({
      ok: true,
      data: {
        designFee: 15,
        printFee: 7.25,
        status: "quoted",
        notes: "Bespreken met klant",
      },
    });
  });

  it("reports a Dutch error for an invalid design fee", () => {
    const result = validateQuote(input({ designFee: "gratis" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.designFee).toBeTruthy();
  });

  it("reports a Dutch error for an invalid print fee", () => {
    const result = validateQuote(input({ printFee: "-1" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.printFee).toBeTruthy();
  });

  it("rejects an unknown status", () => {
    const result = validateQuote(input({ status: "verzonden" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.status).toBeTruthy();
  });
});
