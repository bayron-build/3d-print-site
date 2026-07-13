import { afterEach, describe, expect, it, vi } from "vitest";
import { productPhotoUrl } from "./photos";

describe("productPhotoUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("builds the public bucket URL for a storage path", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    expect(productPhotoUrl("abc/1.jpg")).toBe(
      "https://example.supabase.co/storage/v1/object/public/product-photos/abc/1.jpg"
    );
  });
});
