import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminDb: vi.fn(),
  requireWorkspace: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  adminDb: mocks.adminDb,
  AppError: class AppError extends Error {
    constructor(message: string, public status = 400) { super(message); }
  },
}));

vi.mock("@/lib/account", () => ({ requireWorkspace: mocks.requireWorkspace }));

import { listOwnerHandoffHistory, parseHandoffHistoryFilters, readOwnerHandoffHistory } from "../src/lib/handoff-history";

const workspaceId = "20000000-0000-4000-8000-000000000001";
const projectId = "40000000-0000-4000-8000-000000000001";
const agentId = "30000000-0000-4000-8000-000000000001";
const handoffId = "50000000-0000-4000-8000-000000000001";
const ownerId = "10000000-0000-4000-8000-000000000001";

function makeBuilder(data: unknown[] = []) {
  const calls: Array<[string, ...unknown[]]> = [];
  const builder = {
    calls,
    select: vi.fn((...args: unknown[]) => { calls.push(["select", ...args]); return builder; }),
    eq: vi.fn((...args: unknown[]) => { calls.push(["eq", ...args]); return builder; }),
    is: vi.fn((...args: unknown[]) => { calls.push(["is", ...args]); return builder; }),
    textSearch: vi.fn((...args: unknown[]) => { calls.push(["textSearch", ...args]); return builder; }),
    or: vi.fn((...args: unknown[]) => { calls.push(["or", ...args]); return builder; }),
    order: vi.fn((...args: unknown[]) => { calls.push(["order", ...args]); return builder; }),
    limit: vi.fn(async (...args: unknown[]) => { calls.push(["limit", ...args]); return { data, error: null }; }),
    maybeSingle: vi.fn(async () => ({ data: data[0] ?? null, error: null })),
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve, reject),
  };
  return builder;
}

describe("handoff history filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireWorkspace.mockResolvedValue({ id: workspaceId, plan: "pro" });
  });

  it("defaults to the complete newest-first history", () => {
    expect(parseHandoffHistoryFilters(new URLSearchParams())).toEqual({
      q: "", projectId: "all", agentId: "all", status: "all", cursor: undefined,
    });
  });

  it("accepts bounded search and project, agent, and status filters", () => {
    expect(parseHandoffHistoryFilters(new URLSearchParams({
      q: "  launch planning  ", projectId, agentId, status: "submitted",
    }))).toMatchObject({ q: "launch planning", projectId, agentId, status: "submitted" });
  });

  it.each([
    ["invalid project ID", { projectId: "foreign-project" }, "Handoff history filters are invalid."],
    ["invalid agent ID", { agentId: "foreign-agent" }, "Handoff history filters are invalid."],
    ["invalid status", { status: "running" }, "Handoff history filters are invalid."],
    ["overlong search", { q: "x".repeat(121) }, "Handoff history filters are invalid."],
    ["invalid cursor", { cursor: "not-a-cursor" }, "Handoff history cursor is invalid."],
  ])("rejects %s", (_label, params, message) => {
    expect(() => parseHandoffHistoryFilters(new URLSearchParams(params))).toThrow(message);
  });

  it("filters every database page to the owner workspace and supports indexed search", async () => {
    const builder = makeBuilder([]);
    mocks.adminDb.mockReturnValue({ from: vi.fn(() => builder) });
    const filters = parseHandoffHistoryFilters(new URLSearchParams({ q: "launch notes", projectId, agentId, status: "submitted" }));

    const page = await listOwnerHandoffHistory(ownerId, filters);

    expect(mocks.requireWorkspace).toHaveBeenCalledWith(ownerId);
    expect(builder.calls).toContainEqual(["eq", "workspace_id", workspaceId]);
    expect(builder.calls).toContainEqual(["eq", "project_id", projectId]);
    expect(builder.calls).toContainEqual(["eq", "assigned_agent_id", agentId]);
    expect(builder.calls).toContainEqual(["eq", "status", "submitted"]);
    expect(builder.calls).toContainEqual(["textSearch", "search_document", "launch notes", { config: "simple", type: "websearch" }]);
    expect(builder.calls).toContainEqual(["order", "created_at", { ascending: false }]);
    expect(builder.calls).toContainEqual(["limit", 41]);
    expect(page).toEqual({ items: [], nextCursor: null, hasMore: false, pageSize: 40 });
  });

  it("uses an opaque cursor and returns a next page when more records exist", async () => {
    const createdAt = "2026-09-28T12:30:00.123456+00:00";
    const cursor = Buffer.from(JSON.stringify({ createdAt, id: handoffId })).toString("base64url");
    const rows = Array.from({ length: 41 }, (_, index) => ({
      id: `50000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      created_at: createdAt,
    }));
    const builder = makeBuilder(rows);
    mocks.adminDb.mockReturnValue({ from: vi.fn(() => builder) });
    const filters = parseHandoffHistoryFilters(new URLSearchParams({ cursor }));

    const page = await listOwnerHandoffHistory(ownerId, filters);

    expect(builder.calls).toContainEqual(["or", `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${handoffId})`]);
    expect(page.items).toHaveLength(40);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBeTruthy();
  });

  it("rejects history reads outside the paid workspace", async () => {
    mocks.requireWorkspace.mockResolvedValue({ id: workspaceId, plan: "free" });
    await expect(listOwnerHandoffHistory(ownerId, parseHandoffHistoryFilters(new URLSearchParams())))
      .rejects.toThrow("An active Stoic subscription is required");
    expect(mocks.adminDb).not.toHaveBeenCalled();
  });

  it("scopes selected handoff, event, and artifact reads to the same workspace", async () => {
    const tables: Array<{ name: string; calls: Array<[string, ...unknown[]]> }> = [];
    const handoff = { id: handoffId, project_id: projectId, title: "Launch research", goal: "Review launch options", constraints: "", status: "accepted", assigned_agent_id: agentId, created_by_agent_id: null, created_at: "2026-09-28T12:00:00.000Z", updated_at: "2026-09-28T13:00:00.000Z" };
    mocks.adminDb.mockReturnValue({ from: (name: string) => {
      const builder = makeBuilder(name === "handoffs" ? [handoff] : []);
      tables.push({ name, calls: builder.calls });
      return builder;
    } });

    const detail = await readOwnerHandoffHistory(ownerId, handoffId);

    expect(detail.handoff).toEqual(handoff);
    expect(tables.map((table) => table.name)).toEqual(["handoffs", "task_events", "artifacts"]);
    for (const table of tables) expect(table.calls).toContainEqual(["eq", "workspace_id", workspaceId]);
    expect(tables[1].calls).toContainEqual(["eq", "handoff_id", handoffId]);
    expect(tables[2].calls).toContainEqual(["eq", "handoff_id", handoffId]);
  });
});
