import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminDb: vi.fn(),
  assertSameOrigin: vi.fn(),
  currentUser: vi.fn(),
  requireActiveWorkspace: vi.fn(),
  createHandoff: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  adminDb: mocks.adminDb,
  assertSameOrigin: mocks.assertSameOrigin,
  currentUser: mocks.currentUser,
  AppError: class AppError extends Error {
    constructor(message: string, public status = 400) { super(message); }
  },
  responseError: (error: { message?: string; status?: number }) => Response.json(
    { error: error?.message || "Unexpected error" }, { status: error?.status || 500 },
  ),
}));
vi.mock("@/lib/account", () => ({ requireActiveWorkspace: mocks.requireActiveWorkspace }));
vi.mock("@/lib/coordination", () => ({ createHandoff: mocks.createHandoff }));

import { POST } from "../src/app/api/intake/confirm/route";

const ids = {
  user: "11111111-1111-4111-8111-111111111111",
  workspace: "22222222-2222-4222-8222-222222222222",
  project: "33333333-3333-4333-8333-333333333333",
  thread: "44444444-4444-4444-8444-444444444444",
  turn: "55555555-5555-4555-8555-555555555555",
  boss: "66666666-6666-4666-8666-666666666666",
  workerA: "77777777-7777-4777-8777-777777777777",
  workerB: "88888888-8888-4888-8888-888888888888",
  artifact: "99999999-9999-4999-8999-999999999999",
  handoff: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};

type QueryResult = { data: unknown; error: null | { code?: string; message?: string } };

function queryBuilder(result: QueryResult) {
  const query: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ["select", "eq", "in", "limit", "update"]) query[method] = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => result);
  query.then = (resolve, reject) => Promise.resolve(result)
    .then(resolve as (value: unknown) => unknown, reject as (reason: unknown) => unknown);
  return query;
}

function request(action: "create" | "dismiss" = "create") {
  return new Request("https://stoic.bishoptech.dev/api/intake/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://stoic.bishoptech.dev" },
    body: JSON.stringify({ turnId: ids.turn, action }),
  });
}

describe("owner approval for intake handoffs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser.mockResolvedValue({ id: ids.user });
    mocks.requireActiveWorkspace.mockResolvedValue({ id: ids.workspace, plan: "pro", boss_agent_id: ids.boss });
    mocks.createHandoff.mockResolvedValue({ id: ids.handoff });
    mocks.rpc.mockResolvedValue({ data: 1, error: null });
  });

  function configureDatabase({
    proposalStatus = "pending",
    artifacts = [ids.artifact],
    workers = [ids.boss, ids.workerA, ids.workerB],
  }: { proposalStatus?: string; artifacts?: string[]; workers?: string[] } = {}) {
    const proposal = {
      title: "Summarize the project notes",
      goal: "Read the attached project notes and return a concise summary for the team.",
      constraints: "Do not contact anyone or publish anything.",
    };
    const turn = {
      id: ids.turn, thread_id: ids.thread, artifact_ids: artifacts, proposal,
      proposal_status: proposalStatus, handoff_id: proposalStatus === "created" ? ids.handoff : null,
      status: "completed",
    };
    const responses: Record<string, QueryResult[]> = {
      intake_turns: [
        { data: turn, error: null },
        { data: { id: ids.turn }, error: null },
        { data: { id: ids.turn, handoff_id: ids.handoff }, error: null },
      ],
      intake_threads: [{ data: { project_id: ids.project }, error: null }],
      agents: [{ data: workers.map((id) => ({ id })), error: null }],
      artifacts: [{ data: artifacts.map((id) => ({ id, name: "project-notes.txt" })), error: null }],
    };
    const callCounts: Record<string, number> = {};
    mocks.adminDb.mockReturnValue({
      rpc: mocks.rpc,
      from: (table: string) => {
        const index = callCounts[table] || 0;
        callCounts[table] = index + 1;
        const result = responses[table]?.[index];
        if (!result) throw new Error(`Unexpected query for ${table} #${index + 1}`);
        return queryBuilder(result);
      },
    });
  }

  it("owner approval creates one shared team-queue handoff with its project file", async () => {
    configureDatabase();

    const response = await POST(request());
    const body = await response.json();

    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body).toEqual({ handoffId: ids.handoff, status: "created" });
    expect(mocks.createHandoff).toHaveBeenCalledOnce();
    expect(mocks.createHandoff).toHaveBeenCalledWith({ userId: ids.user }, expect.objectContaining({
      projectId: ids.project,
      teamQueue: true,
      title: "Summarize the project notes",
      goal: "Read the attached project notes and return a concise summary for the team.",
      idempotencyKey: ids.turn,
      constraints: expect.stringContaining(`project-notes.txt (artifact ${ids.artifact})`),
    }));
    expect(mocks.createHandoff.mock.calls[0][1].constraints).toContain("request owner approval");
    expect(mocks.rpc).toHaveBeenCalledWith("stoic_attach_intake_artifacts_to_handoff", {
      p_workspace_id: ids.workspace,
      p_owner_id: ids.user,
      p_project_id: ids.project,
      p_handoff_id: ids.handoff,
      p_artifact_ids: [ids.artifact],
    });
  });

  it("returns the existing handoff on retry without creating a duplicate", async () => {
    configureDatabase({ proposalStatus: "created" });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ handoffId: ids.handoff, status: "created" });
    expect(mocks.createHandoff).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("dismisses a draft without adding it to the queue", async () => {
    configureDatabase({ artifacts: [] });

    const response = await POST(request("dismiss"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ status: "dismissed" });
    expect(mocks.createHandoff).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("keeps a handoff draft retryable if file attachment fails", async () => {
    configureDatabase();
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("artifact_not_attachable") });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toContain("artifact_not_attachable");
    expect(mocks.createHandoff).toHaveBeenCalledOnce();
  });

  it("does not add the draft when no connected non-boss worker is available", async () => {
    configureDatabase({ workers: [ids.boss], artifacts: [] });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status, JSON.stringify(body)).toBe(409);
    expect(body.error).toContain("Connect a worker");
    expect(mocks.createHandoff).not.toHaveBeenCalled();
  });
});
