import { describe, expect, it } from "vitest";
import {
  baseVersionLabel,
  buildVersionOptions,
  checkVersionRow,
  validateVersion,
  type ProductVersion,
} from "./versions";

function version(overrides: Partial<ProductVersion> = {}): ProductVersion {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    product_id: "22222222-2222-2222-2222-222222222222",
    name: "Dubbel",
    price: "40.00",
    compare_at_price: null,
    photo_path: null,
    sort_order: 10,
    ...overrides,
  };
}

describe("validateVersion", () => {
  const valid = { name: "Dubbel", price: "40,00", compareAtPrice: "46,00" };

  it("accepts a valid version and parses Dutch commas", () => {
    const result = validateVersion(valid);
    expect(result).toEqual({
      ok: true,
      data: { name: "Dubbel", price: 40, compareAtPrice: 46 },
    });
  });

  it("accepts an empty compare-at price as null", () => {
    const result = validateVersion({ ...valid, compareAtPrice: "" });
    expect(result).toEqual({
      ok: true,
      data: { name: "Dubbel", price: 40, compareAtPrice: null },
    });
  });

  it("trims the name", () => {
    const result = validateVersion({ ...valid, name: "  Dubbel  " });
    expect(result.ok && result.data.name).toBe("Dubbel");
  });

  it("rejects an empty name", () => {
    const result = validateVersion({ ...valid, name: "   " });
    expect(!result.ok && result.errors.name).toBe("Vul een naam in.");
  });

  it("rejects a name over 40 characters but accepts exactly 40", () => {
    const long = validateVersion({ ...valid, name: "x".repeat(41) });
    expect(!long.ok && long.errors.name).toBe("Gebruik maximaal 40 tekens.");
    expect(validateVersion({ ...valid, name: "x".repeat(40) }).ok).toBe(true);
  });

  it.each(["", "abc", "12,345", "-5"])(
    "rejects invalid price %j",
    (price) => {
      const result = validateVersion({ ...valid, price });
      expect(!result.ok && result.errors.price).toBe(
        "Vul een geldig bedrag in (bijv. 12,50)."
      );
    }
  );

  it("rejects a zero price (DB requires > 0)", () => {
    const result = validateVersion({ ...valid, price: "0" });
    expect(!result.ok && result.errors.price).toBe(
      "Vul een geldig bedrag in (bijv. 12,50)."
    );
  });

  it("rejects a malformed compare-at price", () => {
    const result = validateVersion({ ...valid, compareAtPrice: "abc" });
    expect(!result.ok && result.errors.compareAtPrice).toBe(
      "Vul een geldig bedrag in (bijv. 12,50) of laat leeg."
    );
  });

  it.each(["40,00", "39,99"])(
    "rejects compare-at price %j that does not exceed the price",
    (compareAtPrice) => {
      const result = validateVersion({ ...valid, compareAtPrice });
      expect(!result.ok && result.errors.compareAtPrice).toBe(
        "De oorspronkelijke prijs moet hoger zijn dan de prijs."
      );
    }
  );

  it("collects errors for multiple fields at once", () => {
    const result = validateVersion({ name: "", price: "", compareAtPrice: "x" });
    expect(!result.ok && Object.keys(result.errors).sort()).toEqual([
      "compareAtPrice",
      "name",
      "price",
    ]);
  });
});

describe("baseVersionLabel", () => {
  it("falls back to Standaard for null, empty and whitespace", () => {
    expect(baseVersionLabel(null)).toBe("Standaard");
    expect(baseVersionLabel("")).toBe("Standaard");
    expect(baseVersionLabel("   ")).toBe("Standaard");
  });

  it("returns the trimmed label when set", () => {
    expect(baseVersionLabel(" Enkel ")).toBe("Enkel");
  });
});

describe("buildVersionOptions", () => {
  const product = { indicative_price: "23.00", base_version_label: "Enkel" };

  it("returns no options for a versionless product", () => {
    expect(buildVersionOptions(product, [])).toEqual([]);
  });

  it("returns no options when the product has no price", () => {
    expect(
      buildVersionOptions(
        { indicative_price: null, base_version_label: null },
        [version()]
      )
    ).toEqual([]);
  });

  it("puts the base option first with the label and product price", () => {
    const options = buildVersionOptions(product, [version()]);
    expect(options[0]).toEqual({
      id: "",
      label: "Enkel",
      price: 23,
      compareAtPrice: null,
      photoPath: null,
    });
  });

  it("falls back to Standaard when the label is empty", () => {
    const options = buildVersionOptions(
      { indicative_price: 23, base_version_label: null },
      [version()]
    );
    expect(options[0].label).toBe("Standaard");
  });

  it("maps versions with numeric conversion and photo path", () => {
    const options = buildVersionOptions(product, [
      version({ compare_at_price: "46.00", photo_path: "p/1.jpg" }),
    ]);
    expect(options[1]).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      label: "Dubbel",
      price: 40,
      compareAtPrice: 46,
      photoPath: "p/1.jpg",
    });
  });

  it("orders versions by sort_order", () => {
    const options = buildVersionOptions(product, [
      version({ id: "b", name: "B", sort_order: 20 }),
      version({ id: "a", name: "A", sort_order: 10 }),
    ]);
    expect(options.map((o) => o.label)).toEqual(["Enkel", "A", "B"]);
  });
});

describe("checkVersionRow", () => {
  const productId = "22222222-2222-2222-2222-222222222222";

  it("rejects a missing row (unknown or RLS-hidden version)", () => {
    expect(checkVersionRow(null, productId)).toEqual({ ok: false });
  });

  it("rejects a version of another product", () => {
    expect(
      checkVersionRow(
        { product_id: "33333333-3333-3333-3333-333333333333", name: "Dubbel", price: "40.00" },
        productId
      )
    ).toEqual({ ok: false });
  });

  it("returns name and price for a matching version", () => {
    expect(
      checkVersionRow(
        { product_id: productId, name: "Dubbel", price: "40.00" },
        productId
      )
    ).toEqual({ ok: true, name: "Dubbel", price: "40.00" });
  });
});
