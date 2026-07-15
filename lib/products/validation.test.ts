import { describe, expect, it } from "vitest";
import {
  MAX_PHOTO_BYTES,
  MAX_PHOTOS,
  extensionOf,
  priceToInput,
  validatePhotos,
  validateProduct,
  type ProductInput,
} from "./validation";

function input(overrides: Partial<ProductInput> = {}): ProductInput {
  return {
    name: "Vaas",
    description: "",
    indicativePrice: "",
    active: true,
    ...overrides,
  };
}

describe("validateProduct", () => {
  // Inactive: an empty price only survives validation on a draft, so this is
  // the one shape that still exercises nulling every empty optional.
  it("accepts a minimal product and nulls empty optionals", () => {
    const result = validateProduct(input({ active: false }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({
        name: "Vaas",
        description: null,
        indicativePrice: null,
        active: false,
      });
    }
  });

  it("parses a Dutch comma price and trims fields", () => {
    const result = validateProduct(
      input({ name: "  Vaas  ", description: " mooi ", indicativePrice: "12,50" })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.name).toBe("Vaas");
      expect(result.data.description).toBe("mooi");
      expect(result.data.indicativePrice).toBe(12.5);
    }
  });

  it("rejects a blank name", () => {
    const result = validateProduct(input({ name: "   " }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.name).toBeDefined();
  });

  it("rejects a name over 120 characters", () => {
    const result = validateProduct(input({ name: "x".repeat(121) }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.name).toBeDefined();
  });

  it("rejects an invalid price but keeps other fields' errors independent", () => {
    const result = validateProduct(input({ indicativePrice: "abc" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.indicativePrice).toBeDefined();
  });
});

describe("validateProduct — fixed price rule", () => {
  it("rejects an active product without a price", () => {
    const result = validateProduct({
      name: "Vaas",
      description: "",
      indicativePrice: "",
      active: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.indicativePrice).toBe(
        "Een actief product heeft een vaste prijs nodig."
      );
    }
  });

  it("allows an inactive product without a price", () => {
    const result = validateProduct({
      name: "Vaas",
      description: "",
      indicativePrice: "",
      active: false,
    });
    expect(result.ok).toBe(true);
  });

  it("allows an active product with a price", () => {
    const result = validateProduct({
      name: "Vaas",
      description: "",
      indicativePrice: "12,50",
      active: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.indicativePrice).toBe(12.5);
    }
  });
});

describe("validatePhotos", () => {
  const photo = (name: string, sizeBytes = 1024) => ({ name, sizeBytes });

  it("accepts a valid batch", () => {
    expect(validatePhotos(0, [photo("a.jpg"), photo("b.PNG")])).toBeNull();
  });

  it("rejects an empty selection", () => {
    expect(validatePhotos(0, [])).toMatch(/foto/i);
  });

  it("rejects when the total would exceed the maximum", () => {
    const files = [photo("a.jpg"), photo("b.jpg")];
    expect(validatePhotos(MAX_PHOTOS - 1, files)).toMatch(/maximaal/i);
  });

  it("rejects disallowed extensions and extensionless names", () => {
    expect(validatePhotos(0, [photo("model.stl")])).toMatch(/jpg/i);
    expect(validatePhotos(0, [photo("geen-extensie")])).toMatch(/jpg/i);
  });

  it("rejects oversized files", () => {
    expect(validatePhotos(0, [photo("a.jpg", MAX_PHOTO_BYTES + 1)])).toMatch(/10/);
  });
});

describe("extensionOf", () => {
  it("lowercases and handles missing dots", () => {
    expect(extensionOf("Foto.JPG")).toBe(".jpg");
    expect(extensionOf("archive.tar.gz")).toBe(".gz");
    expect(extensionOf("nodot")).toBe("");
  });
});

describe("priceToInput", () => {
  it("renders DB numerics with a Dutch comma and null as empty", () => {
    expect(priceToInput(12.5)).toBe("12,5");
    expect(priceToInput("12.50")).toBe("12,50");
    expect(priceToInput(null)).toBe("");
  });
});
