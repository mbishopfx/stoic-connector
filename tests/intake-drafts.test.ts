import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminDb: vi.fn(),
  from: vi.fn(),
  readIntakeFiles: vi.fn(),
  interpretIntake: vi.fn(),
  tables: {} as Record<string, { data: unknown; error: null | { message: string } }>,
}));

vi.mock("@/lib/supabase", () => ({
  adminDb: mocks.adminDb,
  AppError: class AppError extends Error {
    constructor(message: string, public status = 400) { super(message); }
  },
}));
vi.mock("@/lib/intake-files", () => ({
  readIntakeFiles: mocks.readIntakeFiles,
  hasReadableIntakeInput: (text: string, files: { readableInput: boolean }) => Boolean(text.trim() || files.readableInput),
}));
vi.mock("@/lib/intake-model", () => ({ interpretIntake: mocks.interpretIntake }));

import { draftIntakeForAgent, intakeDraftInputSchema } from "../src/lib/intake-drafts";

const ids = {
  workspace: "11111111-1111-4111-8111-111111111111",
  project: "22222222-2222-4222-8222-222222222222",
  boss: "33333333-3333-4333-8333-333333333333",
  worker: "44444444-4444-4444-8444-444444444444",
  artifact: "55555555-5555-4555-8555-555555555555",
};

function queryBuilder(result: { data: unknown; error: null | { message: string } }) {
  const query: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ["select", "eq", "neq", "is", "limit"]) query[method] = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => result);
  query.then = (resolve, reject) => Promise.resolve(result).then(resolve as (value: unknown) => unknown, reject as (reason: unknown) => unknown);
  return query;
}

function setRows(options: { delegationLevel?: string; bossAgentId?: string; workers?: boolean }) {
  mocks.tables = {
    projects: { data: { id: ids.project, name: "Launch", brief: "Keep the launch calm and reversible.", default_agent_id: null }, error: null },
    workspaces: { data: { boss_agent_id: options.bossAgentId ?? ids.boss, delegation_level: options.delegationLevel ?? "delegate" }, error: null },
    agents: { data: [
      { id: ids.boss, name: "Codex", platform: "codex", access_notes: "", status: "connected" },
      ...(options.workers ? [{ id: ids.worker, name: "Hermes", platform: "hermes", access_notes: "Reports blockers clearly.", status: "connected" }] : []),
    ], error: null },
  };
  mocks.from.mockImplementation((table: string) => queryBuilder(mocks.tables[table]));
  mocks.adminDb.mockReturnValue({ from: mocks.from });
}

describe("MCP intake draft preparation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setRows({});
    mocks.readIntakeFiles.mockResolvedValue({ notes: [], images: [], transcript: "", warnings: [], readableInput: false, voiceTranscriptionFailed: false });
    mocks.interpretIntake.mockResolvedValue({
      reply: "I shaped this into one reviewable team handoff.",
      proposal: { ready: true, title: "Prepare launch checklist", goal: "Create a short checklist for the launch review.", constraints: "Keep each step reversible." },
    });
  });

  it("accepts one natural-language request and rejects duplicate artifact references", () => {
    expect(intakeDraftInputSchema.safeParse({ projectId: ids.project, prompt: "Review the launch brief", artifactIds: [] }).success).toBe(true);
    expect(intakeDraftInputSchema.safeParse({ projectId: ids.project, prompt: "", artifactIds: [ids.artifact, ids.artifact] }).success).toBe(false);
  });

  it("returns a calm next step without model or file processing when no worker is connected", async () => {
    const result = await draftIntakeForAgent({ agentId: ids.boss, workspaceId: ids.workspace, ownerId: ids.workspace, isBoss: true }, {
      projectId: ids.project, prompt: "Prepare the next launch task", artifactIds: [],
    });

    expect(result.proposal).toBeNull();
    expect(result.reply).toContain("There is no connected worker");
    expect(result.reply).toContain("No handoff was created");
    expect(mocks.readIntakeFiles).not.toHaveBeenCalled();
    expect(mocks.interpretIntake).not.toHaveBeenCalled();
    expect(Object.keys(mocks.tables)).not.toContain("intake_threads");
  });

  it("uses workspace-scoped context to prepare a draft without creating a handoff", async () => {
    setRows({ workers: true });
    const result = await draftIntakeForAgent({ agentId: ids.boss, workspaceId: ids.workspace, ownerId: ids.workspace, isBoss: true }, {
      projectId: ids.project, prompt: "Prepare the launch checklist", artifactIds: [],
      recent: [{ prompt: "Keep the work small", response: "I will keep it to one outcome." }],
    });

    expect(result.proposal?.title).toBe("Prepare launch checklist");
    expect(mocks.interpretIntake).toHaveBeenCalledWith(expect.objectContaining({
      project: expect.objectContaining({ id: ids.project, brief: "Keep the launch calm and reversible." }),
      bossAgentId: ids.boss,
      recent: [{ prompt: "Keep the work small", response: "I will keep it to one outcome." }],
      prompt: "Prepare the launch checklist",
    }));
    expect(mocks.from).toHaveBeenCalledTimes(3);
    expect(mocks.readIntakeFiles).toHaveBeenCalledWith(ids.workspace, ids.project, []);
  });

  it("rejects a worker and an observe-mode workspace", async () => {
    await expect(draftIntakeForAgent({ agentId: ids.worker, workspaceId: ids.workspace, ownerId: ids.workspace, isBoss: false }, {
      projectId: ids.project, prompt: "Prepare a task", artifactIds: [],
    })).rejects.toMatchObject({ status: 403 });

    setRows({ delegationLevel: "observe" });
    await expect(draftIntakeForAgent({ agentId: ids.boss, workspaceId: ids.workspace, ownerId: ids.workspace, isBoss: true }, {
      projectId: ids.project, prompt: "Prepare a task", artifactIds: [],
    })).rejects.toMatchObject({ status: 403 });
    expect(mocks.interpretIntake).not.toHaveBeenCalled();
  });

  it("rechecks the designated boss profile before reading files or calling the model", async () => {
    setRows({ bossAgentId: ids.worker, workers: true });
    await expect(draftIntakeForAgent({ agentId: ids.boss, workspaceId: ids.workspace, ownerId: ids.workspace, isBoss: true }, {
      projectId: ids.project, prompt: "Prepare a task", artifactIds: [],
    })).rejects.toMatchObject({ status: 403 });
    expect(mocks.readIntakeFiles).not.toHaveBeenCalled();
    expect(mocks.interpretIntake).not.toHaveBeenCalled();
  });
});
