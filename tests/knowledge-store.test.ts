import { describe, expect, it } from "vitest";
import { knowledgeSearchPattern, knowledgeSettingsInput, ownerKnowledgeNoteInput } from "../src/lib/knowledge-boundary";

const projectId = "00000000-0000-4000-8000-000000000001";

function validSettings(overrides: Record<string, unknown> = {}) {
  return {
    projectId,
    enabled: false,
    timezone: "America/Chicago",
    scheduleSlots: ["08:00", "13:00", "18:00"],
    sourceScopes: ["brief", "decisions", "board", "handoffs", "artifacts", "agents"],
    retentionDays: 365,
    pinnedNoteIds: [],
    ...overrides,
  };
}

describe("knowledge persistence boundary", () => {
  it("escapes wildcard characters before using a literal ILIKE search pattern", () => {
    expect(knowledgeSearchPattern("auth_%\\boundary")).toBe("%auth\\_\\%\\\\boundary%");
  });

  it("accepts bounded owner settings with the default three refresh slots", () => {
    const parsed = knowledgeSettingsInput.safeParse(validSettings());
    expect(parsed.success).toBe(true);
  });

  it("rejects duplicate slots, duplicate scopes, invalid timezone whitespace, and malformed note IDs", () => {
    expect(knowledgeSettingsInput.safeParse(validSettings({ scheduleSlots: ["08:00", "08:00"] })).success).toBe(false);
    expect(knowledgeSettingsInput.safeParse(validSettings({ sourceScopes: ["brief", "brief"] })).success).toBe(false);
    expect(knowledgeSettingsInput.safeParse(validSettings({ timezone: "America/Chicago local" })).success).toBe(false);
    expect(knowledgeSettingsInput.safeParse(validSettings({ timezone: "Mars/Olympus_Mons" })).success).toBe(false);
    expect(knowledgeSettingsInput.safeParse(validSettings({ pinnedNoteIds: ["bad id"] })).success).toBe(false);
  });

  it("accepts bounded owner notes but reserves generated brief and index notes", () => {
    const note = { projectId, id: "decision-1", title: "Current decision", kind: "decision", status: "proposed", confidence: "uncertain", body: "Keep the launch scoped to the pilot." };
    expect(ownerKnowledgeNoteInput.safeParse(note).success).toBe(true);
    expect(ownerKnowledgeNoteInput.safeParse({ ...note, kind: "brief" }).success).toBe(false);
    expect(ownerKnowledgeNoteInput.safeParse({ ...note, body: "x".repeat(24_001) }).success).toBe(false);
  });
});
