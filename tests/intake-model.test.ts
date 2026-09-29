import { describe, expect, it } from "vitest";
import { buildIntakeInput, intakeReply } from "../src/lib/intake-model";

describe("owner intake model boundary", () => {
  it("sends bounded context without database identifiers or revoked workers", () => {
    const payload = JSON.parse(buildIntakeInput({
      project: { id: "project-a", name: "Launch", brief: "b".repeat(7000), default_agent_id: null },
      bossAgentId: "boss-a",
      agents: [
        { id: "boss-a", name: "Codex", platform: "codex", access_notes: "Boss", status: "connected" },
        { id: "worker-a", name: "Hermes", platform: "hermes", access_notes: "Research", status: "connected" },
        { id: "revoked-a", name: "Old worker", platform: "openclaw", access_notes: "Do not use", status: "revoked" },
      ],
      recent: Array.from({ length: 8 }, (_, index) => ({ prompt: `old-${index} ${"p".repeat(2000)}`, response: "r".repeat(2000) })),
      prompt: "Draft the next handoff",
      fileNotes: [{ id: "file-a", name: "brief.pdf", note: "n".repeat(6000) }],
      images: [],
    }));
    expect(payload.connectedWorkerCount).toBe(1);
    expect(payload.workerProfiles).toEqual([{ name: "Hermes", platform: "hermes", accessNotes: "Research" }]);
    expect(payload.workerProfiles[0]).not.toHaveProperty("id");
    expect(payload.project).not.toHaveProperty("id");
    expect(payload.project).not.toHaveProperty("defaultWorkerId");
    expect(payload.project.brief).toHaveLength(3000);
    expect(payload.recentConversation).toHaveLength(2);
    expect(payload.recentConversation[0].owner).toMatch(/^old-6 /);
    expect(payload.recentConversation[0].owner).toHaveLength(700);
    expect(payload.files[0].extract).toHaveLength(5000);
    expect(JSON.stringify(payload).length).toBeLessThan(25_000);
  });

  it("caps roster samples and the combined file preview budget", () => {
    const agents = Array.from({ length: 15 }, (_, index) => ({
      id: `worker-${index}`, name: `Worker ${index}`, platform: "hermes", access_notes: "c".repeat(1000), status: "connected",
    }));
    const payload = JSON.parse(buildIntakeInput({
      project: { id: "project-a", name: "Launch", brief: "", default_agent_id: null },
      bossAgentId: "boss-a", agents,
      recent: [], prompt: "Assign bounded work",
      fileNotes: Array.from({ length: 5 }, (_, index) => ({ id: `file-${index}`, name: `file-${index}.txt`, note: "f".repeat(5000) })),
      images: [],
    }));

    expect(payload.connectedWorkerCount).toBe(15);
    expect(payload.workerProfiles).toHaveLength(8);
    expect(payload.additionalWorkerProfilesOmitted).toBe(7);
    expect(payload.files.reduce((total: number, file: { extract: string }) => total + file.extract.length, 0)).toBe(12_000);
    expect(JSON.stringify(payload).length).toBeLessThan(20_000);
  });

  it("rejects a malformed draft before it can become a handoff", () => {
    expect(() => intakeReply.parse({ reply: "Ready", proposal: { ready: true, title: "Task", goal: "Research it", constraints: "", extra: "not allowed" } })).toThrow();
  });

  it("keeps routing out of the model response so the server can offer one task to the whole team", () => {
    const parsed = intakeReply.parse({ reply: "Ready", proposal: { ready: true, title: "Market research", goal: "Find three useful market examples", constraints: "" } });
    expect(parsed.proposal).not.toHaveProperty("assignedAgentId");
  });
});
