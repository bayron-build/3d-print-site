import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

function request(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/cron/cleanup-uploads", { headers });
}

describe("cleanup-uploads auth gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects requests without an Authorization header", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const response = await GET(request());
    expect(response.status).toBe(401);
  });

  it("rejects requests with the wrong secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const response = await GET(request({ authorization: "Bearer wrong" }));
    expect(response.status).toBe(401);
  });

  // If CRON_SECRET is missing from the environment the route must fail
  // closed, not fall through to comparing against undefined.
  it("rejects everything when CRON_SECRET is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const response = await GET(request({ authorization: "Bearer " }));
    expect(response.status).toBe(401);
  });
});
