import { afterEach, describe, expect, it, vi } from "vitest";
import { appOrigin, mcpResourceUri } from "../src/lib/config";

afterEach(() => vi.unstubAllEnvs());

describe("public app origin", () => {
  it("uses the configured public origin and strips paths", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://stoic.bishoptech.dev/dashboard");
    vi.stubEnv("NODE_ENV", "production");

    expect(appOrigin()).toBe("https://stoic.bishoptech.dev");
    expect(mcpResourceUri()).toBe("https://stoic.bishoptech.dev/api/mcp");
  });

  it("uses the Vercel host instead of localhost when the public URL is blank", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", '""');
    vi.stubEnv("VERCEL_URL", "stoic-preview.vercel.app");
    vi.stubEnv("NODE_ENV", "production");

    expect(appOrigin()).toBe("https://stoic-preview.vercel.app");
  });

  it("fails closed rather than advertising localhost in production", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    vi.stubEnv("NODE_ENV", "production");

    expect(() => appOrigin()).toThrow("NEXT_PUBLIC_APP_URL must be configured for production");
  });

  it("keeps localhost as the local development default", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    vi.stubEnv("NODE_ENV", "development");

    expect(appOrigin()).toBe("http://localhost:3000");
  });
});
