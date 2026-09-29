import { afterEach, describe, expect, it } from "vitest";
import { GET } from "../src/app/.well-known/openai-apps-challenge/route";

const originalChallenge = process.env.OPENAI_APP_VERIFICATION_CHALLENGE;

afterEach(() => {
  if (originalChallenge === undefined) delete process.env.OPENAI_APP_VERIFICATION_CHALLENGE;
  else process.env.OPENAI_APP_VERIFICATION_CHALLENGE = originalChallenge;
});

describe("OpenAI app domain challenge", () => {
  it("returns only the configured token as uncached plain text", async () => {
    process.env.OPENAI_APP_VERIFICATION_CHALLENGE = " challenge-token ";

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(await response.text()).toBe("challenge-token");
  });

  it("does not publish a placeholder when no token is configured", async () => {
    delete process.env.OPENAI_APP_VERIFICATION_CHALLENGE;

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.text()).toBe("Challenge is not configured");
  });
});
