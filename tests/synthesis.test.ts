import { describe, expect, it } from "vitest";
import { buildSynthesisInput, redactSynthesisSecrets } from "../src/lib/synthesis-input";

describe("bounded synthesis input", () => {
  it("keeps source IDs while limiting large agent posts and briefs", () => {
    const input = JSON.parse(buildSynthesisInput(
      { id: "project-a", name: "Launch", brief: "b".repeat(10000) },
      Array.from({ length: 30 }, (_, n) => ({ id: `message-${n}`, author_key: "agent:worker", kind: "run_report", body: "m".repeat(10000), created_at: "2026-09-27T00:00:00Z" })),
      Array.from({ length: 30 }, (_, n) => ({ id: `handoff-${n}`, title: "Task", goal: "g".repeat(10000), status: "claimed", updated_at: "2026-09-27T00:00:00Z" })),
      Array.from({ length: 40 }, (_, n) => ({ id: `event-${n}`, handoff_id: "handoff-0", event_type: "update", body: "e".repeat(10000), created_at: "2026-09-27T00:00:00Z" })),
    ));
    expect(input.project.brief).toHaveLength(4000);
    expect(input.messages).toHaveLength(20);
    expect(input.messages[0]).toMatchObject({ id: "message-0", kind: "run_report" });
    expect(input.messages[0].body).toHaveLength(500);
    expect(input.handoffs).toHaveLength(20);
    expect(input.handoffs[0].goal).toHaveLength(300);
    expect(input.events).toHaveLength(30);
    expect(input.events[0].body).toHaveLength(500);
  });

  it("removes common credentials before excerpts reach the model", () => {
    const privateKey = "-----BEGIN PRIVATE KEY-----\nexample-private-material\n-----END PRIVATE KEY-----";
    const secret = "sk-proj-examplecredential1234567890";
    const input = buildSynthesisInput(
      { id: "project-a", name: "Launch", brief: `Use the brief. ${privateKey}` },
      [{ id: "message-a", author_key: "agent:worker", kind: "run_report", body: `API_KEY=${secret} Authorization: Bearer long-secret-value-123456`, created_at: "2026-09-27T00:00:00Z" }],
      [{ id: "handoff-a", title: "Task", goal: "password is examplepassword12345", status: "claimed", updated_at: "2026-09-27T00:00:00Z" }],
      [{ id: "event-a", handoff_id: "handoff-a", event_type: "update", body: "postgres://user:db-password@example.com:5432/db", created_at: "2026-09-27T00:00:00Z" }],
    );
    expect(input).not.toContain("example-private-material");
    expect(input).not.toContain(secret);
    expect(input).not.toContain("long-secret-value-123456");
    expect(input).not.toContain("examplepassword12345");
    expect(input).not.toContain("db-password");
    expect(input).toContain("message-a");
    expect(redactSynthesisSecrets("No credential here")).toBe("No credential here");
  });
});
