import { describe, expect, it } from "vitest";
import { hasValidOAuthClaims } from "../src/lib/oauth-claims";

const expected = {
  issuer: "https://project.supabase.co/auth/v1",
  audience: "https://stoic.bishoptech.dev/api/mcp",
  nowSeconds: 1_800_000_000,
};
const validClaims = {
  iss: expected.issuer,
  aud: expected.audience,
  sub: "owner-1",
  client_id: "oauth-client-1",
  exp: expected.nowSeconds + 300,
};

describe("MCP OAuth claim validation", () => {
  it("accepts a current token issued for this MCP resource", () => {
    expect(hasValidOAuthClaims(validClaims, expected)).toBe(true);
  });

  it("accepts a resource listed among multiple audiences", () => {
    expect(hasValidOAuthClaims({ ...validClaims, aud: ["other-api", expected.audience] }, expected)).toBe(true);
  });

  it.each([
    ["issuer", { iss: "https://other.supabase.co/auth/v1" }],
    ["audience", { aud: "https://other.example.com/api" }],
    ["subject", { sub: "" }],
    ["OAuth client", { client_id: undefined }],
    ["missing expiry", { exp: undefined }],
    ["expired token", { exp: expected.nowSeconds }],
  ])("rejects invalid %s claims", (_name, override) => {
    expect(hasValidOAuthClaims({ ...validClaims, ...override }, expected)).toBe(false);
  });

  it("rejects non-object claims", () => {
    expect(hasValidOAuthClaims(null, expected)).toBe(false);
  });
});
