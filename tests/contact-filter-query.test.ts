import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminDb: vi.fn(),
  requireActiveWorkspace: vi.fn(),
  calls: [] as { table: string; method: string; args: unknown[] }[],
  contacts: [] as Record<string, unknown>[],
  count: 0,
}));
vi.mock("@/lib/supabase", () => ({ adminDb: mocks.adminDb, AppError: class AppError extends Error { constructor(message: string, public status = 400) { super(message); } } }));
vi.mock("@/lib/account", () => ({ requireActiveWorkspace: mocks.requireActiveWorkspace }));
vi.mock("@/lib/handoff-access", () => ({ canReadScopedHandoff: vi.fn() }));
import { listContacts, searchContactsForAgent } from "@/lib/contacts";

const filters = { search: "Ada", field: "name", status: "new", projectId: "40000000-0000-4000-8000-000000000001", contactability: "missing_email", activity: "30d", sort: "name_asc", offset: 50 } as const;

describe("workspace-scoped contact filters", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.calls = []; mocks.contacts = [{ id: "contact-51", full_name: "Ada" }]; mocks.count = 51;
    mocks.requireActiveWorkspace.mockResolvedValue({ id: "workspace-1" });
    mocks.adminDb.mockReturnValue({ from: (table: string) => {
      const record = (method: string, ...args: unknown[]) => { mocks.calls.push({ table, method, args }); return builder; };
      const builder = {
        select: (...args: unknown[]) => record("select", ...args),
        eq: (...args: unknown[]) => record("eq", ...args),
        is: (...args: unknown[]) => record("is", ...args),
        not: (...args: unknown[]) => record("not", ...args),
        or: (...args: unknown[]) => record("or", ...args),
        ilike: (...args: unknown[]) => record("ilike", ...args),
        textSearch: (...args: unknown[]) => record("textSearch", ...args),
        gte: (...args: unknown[]) => record("gte", ...args),
        order: (...args: unknown[]) => record("order", ...args),
        in: (...args: unknown[]) => record("in", ...args),
        range: (...args: unknown[]) => { record("range", ...args); return Promise.resolve({ data: mocks.contacts, count: mocks.count, error: null }); },
        limit: (...args: unknown[]) => { record("limit", ...args); return Promise.resolve({ data: [], error: null }); },
        maybeSingle: async () => ({ data: { plan: "pro" }, error: null }),
      };
      return builder;
    } });
  });

  it("combines field, status, project, missing detail, activity, stable sort, and page before counting", async () => {
    const result = await listContacts("owner-1", filters);
    expect(result).toMatchObject({ total: 51, nextOffset: null, contacts: [{ id: "contact-51" }] });
    const calls = mocks.calls.filter((call) => call.table === "contacts");
    expect(calls).toContainEqual({ table: "contacts", method: "eq", args: ["workspace_id", "workspace-1"] });
    expect(calls).toContainEqual({ table: "contacts", method: "eq", args: ["status", "new"] });
    expect(calls).toContainEqual({ table: "contacts", method: "eq", args: ["project_id", filters.projectId] });
    expect(calls).toContainEqual({ table: "contacts", method: "is", args: ["email", null] });
    expect(calls).toContainEqual({ table: "contacts", method: "ilike", args: ["full_name", "%Ada%"] });
    expect(calls.find((call) => call.method === "gte" && call.args[0] === "last_seen_at")?.args[1]).toMatch(/^20\d\d-/);
    expect(calls).toContainEqual({ table: "contacts", method: "order", args: ["full_name", { ascending: true }] });
    expect(calls.at(-1)).toEqual({ table: "contacts", method: "range", args: [50, 99] });
  });

  it("treats wildcards and punctuation literally when searching source labels", async () => {
    mocks.contacts = [{ id: "contact-51", contact_sources: [{ id: "source-match" }] }];
    const result = await listContacts("owner-1", { search: "Meet%up_(Oct),", field: "source" });
    const calls = mocks.calls.filter((call) => call.table === "contacts");
    expect(calls.find((call) => call.method === "select")?.args[0]).toContain("contact_sources!inner(id)");
    expect(calls).toContainEqual({ table: "contacts", method: "ilike", args: ["contact_sources.source_label", "%Meet\\%up\\_(Oct),%"] });
    expect(result.contacts[0]).not.toHaveProperty("contact_sources");
  });

  it("keeps the existing agent search defaults compatible and workspace-scoped", async () => {
    await searchContactsForAgent({ agentId: "agent-1", workspaceId: "workspace-2", ownerId: "owner-1", isBoss: false }, { search: "Ada" });
    const calls = mocks.calls.filter((call) => call.table === "contacts");
    expect(calls).toContainEqual({ table: "contacts", method: "eq", args: ["workspace_id", "workspace-2"] });
    expect(calls).toContainEqual({ table: "contacts", method: "textSearch", args: ["search_document", "Ada", { type: "plain", config: "simple" }] });
  });

  it("supports unassigned, no direct contact method, and recent activity sort", async () => {
    await listContacts("owner-1", { projectId: "unassigned", contactability: "no_direct", sort: "last_seen" });
    const calls = mocks.calls.filter((call) => call.table === "contacts");
    expect(calls).toContainEqual({ table: "contacts", method: "is", args: ["project_id", null] });
    expect(calls).toContainEqual({ table: "contacts", method: "is", args: ["email", null] });
    expect(calls).toContainEqual({ table: "contacts", method: "is", args: ["phone", null] });
    expect(calls).toContainEqual({ table: "contacts", method: "order", args: ["last_seen_at", { ascending: false }] });
    expect(calls).toContainEqual({ table: "contacts", method: "order", args: ["id", { ascending: false }] });
  });
});
