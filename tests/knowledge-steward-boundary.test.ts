import { describe, expect, it } from "vitest";
import { buildKnowledgeStewardInput, hasAllowedStewardEvidence, knowledgeStewardReply } from "../src/lib/knowledge-steward-boundary";

describe("Knowledge Steward model boundary", () => {
  it("sends only opted-in bounded sources and redacts credential-like values", () => {
    const result = buildKnowledgeStewardInput({
      scopes: ["brief", "board", "handoffs", "artifacts", "agents"],
      pinnedNoteIds: [],
      project: { id: "project-secret-id", name: "Pilot", brief: `Decision: stay calm. ${"x".repeat(5000)} sk-proj-abcdefghijklmnopqrstuvwxyz1234567890`, brief_version: 4 },
      notes: [{ id: "decision-1", kind: "decision", title: "Unselected decision", status: "active", body: "Private note", updated_at: "2026-09-28T12:00:00Z" }],
      messages: [{ id: "11111111-1111-4111-8111-111111111111", author_key: "agent:hermes", kind: "message", body: "Use the calm plan. API_KEY=secret-secret-secret", created_at: "2026-09-28T12:00:00Z" }],
      handoffs: [{ id: "22222222-2222-4222-8222-222222222222", title: "Research", goal: "Find three examples.", constraints: "No external outreach.", status: "claimed", updated_at: "2026-09-28T12:00:00Z" }],
      events: [{ id: "33333333-3333-4333-8333-333333333333", handoff_id: "22222222-2222-4222-8222-222222222222", event_type: "progress", body: "One example found.", created_at: "2026-09-28T12:00:00Z" }],
      artifacts: [{ id: "44444444-4444-4444-8444-444444444444", name: "research.pdf", mime_type: "application/pdf", size_bytes: 1024, handoff_id: null, created_at: "2026-09-28T12:00:00Z" }],
      agents: [{ id: "55555555-5555-4555-8555-555555555555", name: "Hermes", platform: "hermes", status: "connected", schedule_enabled: true, last_check_at: "2026-09-28T12:00:00Z" }],
    });
    const payload = JSON.parse(result.input);
    expect(payload.sources.projectBrief.text.length).toBeLessThanOrEqual(3000);
    expect(payload.sources.knowledgeNotes).toBeUndefined();
    expect(payload.sources.boardMessages).toHaveLength(1);
    expect(result.input).not.toContain("project-secret-id");
    expect(result.input).not.toContain("sk-proj-abcdefghijklmnopqrstuvwxyz1234567890");
    expect(result.input).not.toContain("API_KEY=secret-secret-secret");
    expect(result.input.length).toBeLessThanOrEqual(28_000);
    expect(result.evidenceReferences.has("message:11111111-1111-4111-8111-111111111111")).toBe(true);
  });

  it("requires bounded note bodies and at least one source reference", () => {
    expect(knowledgeStewardReply.safeParse({ notes: [{ title: "Fact", kind: "note", body: "A durable fact", evidence: ["message:one"] }] }).success).toBe(true);
    expect(knowledgeStewardReply.safeParse({ notes: [{ title: "Fact", kind: "note", body: "A durable fact", evidence: [] }] }).success).toBe(false);
    expect(knowledgeStewardReply.safeParse({ notes: [{ title: "Fact", kind: "note", body: "x".repeat(24_001), evidence: ["message:one"] }] }).success).toBe(false);
  });

  it("accepts only exact, unique evidence references from the project input", () => {
    const allowed = new Set(["message:one", "brief:version-2"]);
    expect(hasAllowedStewardEvidence(["message:one"], allowed)).toBe(true);
    expect(hasAllowedStewardEvidence(["message:other"], allowed)).toBe(false);
    expect(hasAllowedStewardEvidence(["message:one", "message:one"], allowed)).toBe(false);
  });
});
