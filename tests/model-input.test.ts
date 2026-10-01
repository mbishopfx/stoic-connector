import { describe, expect, it } from "vitest";
import { redactSensitiveText } from "../src/lib/model-input";

describe("managed model input redaction", () => {
  it("removes common credentials before excerpts reach the model", () => {
    const privateKey = "-----BEGIN PRIVATE KEY-----\nexample-private-material\n-----END PRIVATE KEY-----";
    const secret = "sk-proj-examplecredential1234567890";
    const input = redactSensitiveText(`Use the brief. ${privateKey}; API_KEY=${secret}; Authorization: Bearer long-secret-value-123456; password is examplepassword12345; postgres://user:db-password@example.com:5432/db`);
    expect(input).not.toContain("example-private-material");
    expect(input).not.toContain(secret);
    expect(input).not.toContain("long-secret-value-123456");
    expect(input).not.toContain("examplepassword12345");
    expect(input).not.toContain("db-password");
    expect(redactSensitiveText("No credential here")).toBe("No credential here");
  });
});
