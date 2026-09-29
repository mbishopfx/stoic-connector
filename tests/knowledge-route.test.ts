import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  currentUser: vi.fn(),
  getOwnerKnowledgeOverview: vi.fn(),
  readOwnerKnowledgeNote: vi.fn(),
  saveOwnerKnowledgeNote: vi.fn(),
  updateOwnerKnowledgeSettings: vi.fn(),
  upsertOwnerKnowledgeNote: vi.fn(),
  runOwnerKnowledgeSteward: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  assertSameOrigin: mocks.assertSameOrigin,
  currentUser: mocks.currentUser,
  AppError: class AppError extends Error {
    constructor(message: string, public status = 400) { super(message); }
  },
  responseError: (error: unknown) => Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 }),
}));

vi.mock("@/lib/knowledge-store", () => ({
  getOwnerKnowledgeOverview: mocks.getOwnerKnowledgeOverview,
  ownerKnowledgeNoteInput: { parse: (value: unknown) => value },
  readOwnerKnowledgeNote: mocks.readOwnerKnowledgeNote,
  saveOwnerKnowledgeNote: mocks.saveOwnerKnowledgeNote,
  knowledgeSettingsInput: { parse: (value: unknown) => value },
  updateOwnerKnowledgeSettings: mocks.updateOwnerKnowledgeSettings,
  upsertOwnerKnowledgeNote: mocks.upsertOwnerKnowledgeNote,
}));

vi.mock("@/lib/knowledge-steward", () => ({
  runOwnerKnowledgeSteward: mocks.runOwnerKnowledgeSteward,
}));

import { GET, POST } from "../src/app/api/knowledge/route";

const userId = "11111111-1111-4111-8111-111111111111";
const projectId = "22222222-2222-4222-8222-222222222222";

describe("owner knowledge route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser.mockResolvedValue({ id: userId });
    mocks.getOwnerKnowledgeOverview.mockResolvedValue({ project: { id: projectId, name: "Launch" }, notes: [], graph: { graph: { nodes: [], edges: [] } } });
    mocks.readOwnerKnowledgeNote.mockResolvedValue({ project: { id: projectId, name: "Launch" }, note: { id: "decision-1", title: "Decision", body: "Keep the release calm." } });
    mocks.saveOwnerKnowledgeNote.mockResolvedValue({ project: { id: projectId, name: "Launch" }, note: { id: "decision-1", title: "Decision" } });
    mocks.runOwnerKnowledgeSteward.mockResolvedValue({ status: "completed", created: 2, archived: 0 });
  });

  it("loads a project overview for the authenticated owner", async () => {
    const response = await GET(new Request(`https://stoic.test/api/knowledge?projectId=${projectId}`));
    expect(response.status).toBe(200);
    expect(mocks.getOwnerKnowledgeOverview).toHaveBeenCalledWith(userId, projectId);
  });

  it("loads an individual note through the owner-scoped detail path", async () => {
    const response = await GET(new Request(`https://stoic.test/api/knowledge?projectId=${projectId}&noteId=decision-1`));
    expect(response.status).toBe(200);
    expect(mocks.readOwnerKnowledgeNote).toHaveBeenCalledWith(userId, projectId, "decision-1");
    expect(mocks.getOwnerKnowledgeOverview).not.toHaveBeenCalled();
  });

  it("saves a structured owner note without accepting an owner ID from the client", async () => {
    const request = new Request("https://stoic.test/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://stoic.test" },
      body: JSON.stringify({
        action: "save_note", projectId, id: "decision-1", title: "Decision", kind: "decision",
        status: "proposed", confidence: "uncertain", body: "Keep the release calm.", sourceUser: "attacker-controlled",
      }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mocks.assertSameOrigin).toHaveBeenCalledWith(request);
    expect(mocks.saveOwnerKnowledgeNote).toHaveBeenCalledWith(userId, expect.objectContaining({ projectId, id: "decision-1", title: "Decision" }));
  });

  it("runs a manual project refresh only for the signed-in owner", async () => {
    const request = new Request("https://stoic.test/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://stoic.test" },
      body: JSON.stringify({ action: "refresh_now", projectId }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mocks.assertSameOrigin).toHaveBeenCalledWith(request);
    expect(mocks.runOwnerKnowledgeSteward).toHaveBeenCalledWith(userId, projectId);
  });
});
