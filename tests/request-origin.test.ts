import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError, assertSameOrigin } from "@/lib/supabase";

describe("same-origin request guard", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://stoic.example");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts browser multipart requests with a generated boundary", () => {
    const request = new Request("https://stoic.example/api/contacts/import", {
      method: "POST",
      headers: {
        origin: "https://stoic.example",
        "content-type": "multipart/form-data; boundary=----stoic-test",
      },
    });

    expect(() => assertSameOrigin(request, "multipart/form-data")).not.toThrow();
  });

  it("continues to require JSON by default", () => {
    const request = new Request("https://stoic.example/api/commands", {
      method: "POST",
      headers: { origin: "https://stoic.example", "content-type": "text/plain" },
    });

    expect(() => assertSameOrigin(request)).toThrow(new AppError("JSON required", 415));
  });

  it("rejects multipart requests from another origin", () => {
    const request = new Request("https://stoic.example/api/contacts/import", {
      method: "POST",
      headers: {
        origin: "https://attacker.example",
        "content-type": "multipart/form-data; boundary=----stoic-test",
      },
    });

    expect(() => assertSameOrigin(request, "multipart/form-data")).toThrow(new AppError("Invalid request origin", 403));
  });
});
