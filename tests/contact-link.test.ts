import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminDb: vi.fn(),
  canReadScopedHandoff: vi.fn(),
  requireActiveWorkspace: vi.fn(),
  rpc: vi.fn(),
  artifact: null as Record<string, unknown> | null,
}));
vi.mock("@/lib/supabase", () => ({
  adminDb: mocks.adminDb,
  AppError: class AppError extends Error {
    constructor(message: string, public status = 400) { super(message); }
  },
}));
vi.mock("@/lib/account", () => ({ requireActiveWorkspace: mocks.requireActiveWorkspace }));
vi.mock("@/lib/handoff-access", () => ({ canReadScopedHandoff: mocks.canReadScopedHandoff }));

import { contactLinkInputSchema, createContact, linkContact } from "@/lib/contacts";

const contactId = "40000000-0000-4000-8000-000000000001";
const artifactId = "50000000-0000-4000-8000-000000000001";
const agent = { agentId: "agent-1", workspaceId: "workspace-1", ownerId: "owner-1", isBoss: false };
const input = { contactId, sourceLabel: "Gmail, inbound, Oct 3", sourceUrl: "https://mail.example/thread/1?token=private&view=short#message", notes: "Asked about a pilot.", idempotencyKey: "gmail-message-001" };

describe("linking verified contact interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.artifact = null;
    mocks.requireActiveWorkspace.mockResolvedValue({ id: "workspace-1", plan: "pro" });
    mocks.canReadScopedHandoff.mockResolvedValue(true);
    mocks.rpc.mockResolvedValue({ data: { contactId, updated: true, alreadyLinked: false }, error: null });
    mocks.adminDb.mockReturnValue({
      from: (table: string) => {
        const builder = {
          select: () => builder,
          eq: () => builder,
          maybeSingle: async () => ({ data: table === "workspaces" ? { plan: "pro" } : table === "artifacts" ? mocks.artifact : { id: "handoff-1", assigned_agent_id: "agent-1", status: "open" }, error: null }),
        };
        return builder;
      },
      rpc: mocks.rpc,
    });
  });

  it("scopes agent writes and strips secret query parameters from provenance", async () => {
    const result = await linkContact({ agent }, input);
    expect(result).toEqual({ contactId, updated: true, alreadyLinked: false });
    expect(mocks.rpc).toHaveBeenCalledWith("stoic_link_contact", {
      p_workspace_id: "workspace-1",
      p_actor_agent_id: "agent-1",
      p_actor_user_id: null,
      p_contact_id: contactId,
      p_source: {
        source_key: "agent:agent-1:link:gmail-message-001",
        source_label: "Gmail, inbound, Oct 3",
        source_url: "https://mail.example/thread/1?view=short",
        notes: "Asked about a pilot.",
        artifact_id: null,
        email: null,
        phone: null,
        company: null,
        job_title: null,
      },
    });
  });

  it("allows owner-linked sources without changing status and carries verified fields", async () => {
    await linkContact({ userId: "owner-1" }, { ...input, email: "ada@example.com", company: "Engines" });
    expect(mocks.requireActiveWorkspace).toHaveBeenCalledWith("owner-1");
    expect(mocks.rpc).toHaveBeenCalledWith("stoic_link_contact", expect.objectContaining({
      p_actor_user_id: "owner-1", p_actor_agent_id: null,
      p_source: expect.objectContaining({ email: "ada@example.com", company: "Engines", source_key: "user:owner-1:link:gmail-message-001" }),
    }));
  });

  it("checks ready artifact and handoff visibility before an agent can link it", async () => {
    mocks.artifact = { id: artifactId, handoff_id: "handoff-1", status: "ready" };
    mocks.canReadScopedHandoff.mockResolvedValue(false);
    await expect(linkContact({ agent }, { ...input, artifactId })).rejects.toMatchObject({ status: 404 });
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.canReadScopedHandoff.mockResolvedValue(true);
    await linkContact({ agent }, { ...input, artifactId });
    expect(mocks.rpc).toHaveBeenCalledWith("stoic_link_contact", expect.objectContaining({
      p_source: expect.objectContaining({ artifact_id: artifactId }),
    }));
  });

  it("attaches a ready artifact to a new contact only within its project", async () => {
    mocks.artifact = { id: artifactId, project_id: "60000000-0000-4000-8000-000000000001", handoff_id: null, status: "ready" };
    await expect(createContact({ agent }, { fullName: "Ada Lovelace", projectId: "60000000-0000-4000-8000-000000000002", sourceLabel: "Research", artifactId, idempotencyKey: "new-contact-001" })).rejects.toMatchObject({ status: 404 });
    expect(mocks.rpc).not.toHaveBeenCalled();
    await createContact({ agent }, { fullName: "Ada Lovelace", projectId: "60000000-0000-4000-8000-000000000001", sourceLabel: "Research", artifactId, idempotencyKey: "new-contact-001" });
    expect(mocks.rpc).toHaveBeenCalledWith("stoic_upsert_contacts", expect.objectContaining({ p_artifact_id: artifactId }));
  });

  it("rejects invalid input before calling the database and surfaces identity conflict", async () => {
    expect(contactLinkInputSchema.safeParse({ ...input, sourceLabel: "a" }).success).toBe(false);
    await expect(linkContact({ agent }, { ...input, contactId: "not-a-uuid" })).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "contact_identity_conflict" } });
    await expect(linkContact({ agent }, input)).rejects.toMatchObject({ status: 409 });
  });
});
