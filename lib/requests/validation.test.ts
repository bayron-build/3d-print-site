import { describe, expect, it } from "vitest";
import {
  hasAllowedExtension,
  isSpam,
  sanitizeFileName,
  validateFiles,
  validateRequest,
  type RequestInput,
} from "./validation";

// Valid custom-type baseline; tests override single fields to isolate rules.
function input(overrides: Partial<RequestInput> = {}): RequestInput {
  return {
    type: "custom",
    customerName: "Jan Jansen",
    email: "jan@example.com",
    phone: "",
    productId: "",
    description: "Een vaas van 20cm hoog",
    color: "",
    material: "",
    quantity: "1",
    licenseAccepted: false,
    files: [],
    ...overrides,
  };
}

const stlFile = { name: "model.stl", sizeBytes: 1024 };

describe("validateRequest", () => {
  it("accepts a valid custom request", () => {
    expect(validateRequest(input()).ok).toBe(true);
  });

  it("accepts a valid catalog request and returns cleaned data", () => {
    const result = validateRequest(
      input({ type: "catalog", productId: "abc-123", quantity: "2" })
    );
    expect(result).toEqual({
      ok: true,
      data: {
        type: "catalog",
        customerName: "Jan Jansen",
        email: "jan@example.com",
        phone: null,
        productId: "abc-123",
        description: "Een vaas van 20cm hoog",
        color: null,
        material: null,
        quantity: 2,
        licenseAccepted: false,
      },
    });
  });

  it("accepts a valid file request", () => {
    const result = validateRequest(
      input({ type: "file", files: [stlFile], licenseAccepted: true })
    );
    expect(result.ok).toBe(true);
  });

  it("rejects an unknown type", () => {
    const result = validateRequest(input({ type: "banana" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.type).toBeDefined();
  });

  it("requires a name and a valid email", () => {
    const result = validateRequest(
      input({ customerName: "  ", email: "geen-email" })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.customerName).toBeDefined();
      expect(result.errors.email).toBeDefined();
    }
  });

  it("requires a description for custom requests only", () => {
    const custom = validateRequest(input({ description: "" }));
    expect(custom.ok).toBe(false);
    if (!custom.ok) expect(custom.errors.description).toBeDefined();

    const file = validateRequest(
      input({
        type: "file",
        description: "",
        files: [stlFile],
        licenseAccepted: true,
      })
    );
    expect(file.ok).toBe(true);
  });

  it("requires a product for catalog requests", () => {
    const result = validateRequest(input({ type: "catalog", productId: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.productId).toBeDefined();
  });

  it("rejects a quantity below 1 or non-numeric", () => {
    for (const quantity of ["0", "-3", "abc", ""]) {
      const result = validateRequest(
        input({ type: "catalog", productId: "abc-123", quantity })
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.quantity).toBeDefined();
    }
  });

  it("requires the license checkbox for file requests", () => {
    const result = validateRequest(
      input({ type: "file", files: [stlFile], licenseAccepted: false })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.licenseAccepted).toBeDefined();
  });

  it("rejects a file request with invalid files", () => {
    const result = validateRequest(
      input({ type: "file", files: [], licenseAccepted: true })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.files).toBeDefined();
  });

  it("normalizes empty optional fields to null and ignores productId for non-catalog types", () => {
    const result = validateRequest(
      input({ phone: " ", color: "", material: " ", productId: "abc-123" })
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.phone).toBeNull();
      expect(result.data.color).toBeNull();
      expect(result.data.material).toBeNull();
      expect(result.data.productId).toBeNull();
    }
  });
});

describe("validateFiles", () => {
  it("accepts 1 to 5 valid files", () => {
    expect(validateFiles([stlFile])).toBeNull();
    expect(validateFiles(Array(5).fill(stlFile))).toBeNull();
  });

  it("rejects zero files", () => {
    expect(validateFiles([])).not.toBeNull();
  });

  it("rejects more than 5 files", () => {
    expect(validateFiles(Array(6).fill(stlFile))).not.toBeNull();
  });

  it("rejects unsupported extensions", () => {
    expect(validateFiles([{ name: "model.zip", sizeBytes: 10 }])).not.toBeNull();
    expect(validateFiles([{ name: "geen-extensie", sizeBytes: 10 }])).not.toBeNull();
  });

  it("accepts all allowed extensions case-insensitively", () => {
    expect(validateFiles([{ name: "MODEL.STL", sizeBytes: 10 }])).toBeNull();
    expect(validateFiles([{ name: "part.3MF", sizeBytes: 10 }])).toBeNull();
    expect(validateFiles([{ name: "bracket.StEp", sizeBytes: 10 }])).toBeNull();
    expect(validateFiles([{ name: "cad.stp", sizeBytes: 10 }])).toBeNull();
  });

  it("rejects files over 50MB but accepts exactly 50MB", () => {
    expect(
      validateFiles([{ name: "big.stl", sizeBytes: 50 * 1024 * 1024 + 1 }])
    ).not.toBeNull();
    expect(
      validateFiles([{ name: "edge.stl", sizeBytes: 50 * 1024 * 1024 }])
    ).toBeNull();
  });
});

describe("isSpam", () => {
  it("flags a filled honeypot", () => {
    expect(isSpam("http://spam.example")).toBe(true);
  });

  it("passes an empty or whitespace honeypot", () => {
    expect(isSpam("")).toBe(false);
    expect(isSpam("  ")).toBe(false);
  });
});

describe("sanitizeFileName", () => {
  it("keeps letters, digits, dot, dash, underscore", () => {
    expect(sanitizeFileName("my-model_v2.stl")).toBe("my-model_v2.stl");
  });

  it("replaces every other character with an underscore", () => {
    expect(sanitizeFileName("mijn vaas (rood).stl")).toBe(
      "mijn_vaas__rood_.stl"
    );
  });
});

describe("hasAllowedExtension", () => {
  it("matches allowed extensions case-insensitively", () => {
    expect(hasAllowedExtension("a.STL")).toBe(true);
    expect(hasAllowedExtension("a.pdf")).toBe(false);
  });
});
