import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminDb: vi.fn(),
  assertSameOrigin: vi.fn(),
  currentUser: vi.fn(),
  requireActiveWorkspace: vi.fn(),
  interpretIntake: vi.fn(),
  readIntakeFiles: vi.fn(),
  agents: [] as { id: string; name: string; platform: string; access_notes: string; status: string }[],
  completedTurn: null as unknown,
}));

vi.mock("@/lib/supabase", () => ({
  adminDb: mocks.adminDb,
  assertSameOrigin: mocks.assertSameOrigin,
  currentUser: mocks.currentUser,
  AppError: class AppError extends Error {
    constructor(message: string, public status = 400) { super(message); }
  },
  responseError: (error: unknown) => Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 }),
}));
vi.mock("@/lib/account", () => ({ requireActiveWorkspace: mocks.requireActiveWorkspace }));
vi.mock("@/lib/intake-model", () => ({ interpretIntake: mocks.interpretIntake }));
vi.mock("@/lib/intake-files", () => ({
  readIntakeFiles: mocks.readIntakeFiles,
  hasReadableIntakeInput: (text: string, files: { readableInput: boolean }) => Boolean(text.trim() || files.readableInput),
}));

import { POST } from "../src/app/api/intake/route";

const ids = {
  user: "11111111-1111-4111-8111-111111111111",
  workspace: "22222222-2222-4222-8222-222222222222",
  project: "33333333-3333-4333-8333-333333333333",
  thread: "44444444-4444-4444-8444-444444444444",
  turn: "55555555-5555-4555-8555-555555555555",
  boss: "66666666-6666-4666-8666-666666666666",
  worker: "77777777-7777-4777-8777-777777777777",
  artifact: "88888888-8888-4888-8888-888888888888",
};

function queryBuilder(result: { data: unknown; error: null | { code?: string; message?: string } }) {
  const query: Record<string, (...args: unknown[]) => unknown> = {};
  let updateValues: Record<string, unknown> | null = null;
  for (const method of ["select", "eq", "neq", "is", "order", "limit", "insert", "update"]) {
    query[method] = vi.fn((value?: unknown) => {
      if (method === "update" && value && typeof value === "object") updateValues = value as Record<string, unknown>;
      return query;
    });
  }
  const currentResult = () => updateValues && result.data && !Array.isArray(result.data)
    ? { ...result, data: { ...result.data, ...updateValues } }
    : result;
  query.maybeSingle = vi.fn(async () => currentResult());
  query.single = vi.fn(async () => currentResult());
  query.then = (resolve, reject) => Promise.resolve(currentResult()).then(resolve as (value: unknown) => unknown, reject as (reason: unknown) => unknown);
  return query;
}

describe("owner intake route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser.mockResolvedValue({ id: ids.user });
    mocks.requireActiveWorkspace.mockResolvedValue({ id: ids.workspace, plan: "pro", boss_agent_id: ids.boss });

    const turn = {
      id: ids.turn, thread_id: ids.thread, prompt: "Organize these notes", artifact_ids: [], transcript: "",
      response: "I saved this note and its files with the project, but there is no connected worker to receive an assignment yet. Connect a worker and have it complete a successful Stoic inbox check; then I can prepare a handoff for your review. No handoff was created.", proposal: null, proposal_status: "none", handoff_id: null,
      status: "completed", created_at: "2026-09-28T00:00:00.000Z",
    };
    mocks.completedTurn = turn;
    mocks.agents = [{ id: ids.boss, name: "Codex", platform: "codex", access_notes: "", status: "connected" }];
    const responses: Record<string, unknown[]> = {
      intake_turns: [
        { data: null, error: null },
        { data: { id: ids.turn }, error: null },
        { data: [], error: null },
        { data: mocks.completedTurn, error: null },
      ],
      projects: [{ data: { id: ids.project, name: "Launch", brief: "", default_agent_id: null }, error: null }],
      intake_threads: [
        { data: { id: ids.thread, project_id: ids.project }, error: null },
        { data: null, error: null },
      ],
      agents: [{ data: mocks.agents, error: null }],
    };
    const calls: Record<string, number> = {};
    mocks.adminDb.mockReturnValue({
      from: (table: string) => {
        const index = calls[table] || 0;
        calls[table] = index + 1;
        const result = table === "agents" ? { data: mocks.agents, error: null } : responses[table][index];
        return queryBuilder(result as { data: unknown; error: null | { code?: string; message?: string } });
      },
    });
  });

  it("guides an owner with no connected worker without invoking model or transcription APIs", async () => {
    const request = new Request("http://localhost:3000/api/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
      body: JSON.stringify({
        threadId: ids.thread, projectId: ids.project, text: "Organize these notes", artifactIds: [], requestKey: "request-0001",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.turn.status).toBe("completed");
    expect(body.turn.proposal).toBeNull();
    expect(body.turn.response).toContain("there is no connected worker");
    expect(body.turn.response).toContain("No handoff was created");
    expect(mocks.interpretIntake).not.toHaveBeenCalled();
    expect(mocks.readIntakeFiles).not.toHaveBeenCalled();
  });

  it("does not invoke the model when an attached voice file has no readable preview", async () => {
    mocks.agents = [
      { id: ids.boss, name: "Codex", platform: "codex", access_notes: "", status: "connected" },
      { id: ids.worker, name: "Hermes", platform: "hermes", access_notes: "", status: "connected" },
    ];
    mocks.readIntakeFiles.mockResolvedValue({
      notes: [{ id: ids.artifact, name: "voice.webm", note: "Audio could not be previewed." }],
      images: [], transcript: "", warnings: ["voice.webm: Stoic could not transcribe this voice memo."],
      readableInput: false, voiceTranscriptionFailed: true,
    });
    const request = new Request("https://stoic.bishoptech.dev/api/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://stoic.bishoptech.dev" },
      body: JSON.stringify({
        threadId: ids.thread, projectId: ids.project, text: "", artifactIds: [ids.artifact], requestKey: "request-0002",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body.turn.status).toBe("completed");
    expect(body.turn.proposal).toBeNull();
    expect(body.turn.response).toContain("could not transcribe this voice memo");
    expect(body.turn.response).toContain("No handoff was created");
    expect(mocks.readIntakeFiles).toHaveBeenCalledWith(ids.workspace, ids.project, [ids.artifact]);
    expect(mocks.interpretIntake).not.toHaveBeenCalled();
  });
});
