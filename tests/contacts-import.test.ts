import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminDb: vi.fn(),
  canReadScopedHandoff: vi.fn(),
  download: vi.fn(),
  requireActiveWorkspace: vi.fn(),
  runManagedCodexJson: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  adminDb: mocks.adminDb,
  AppError: class AppError extends Error {
    constructor(message: string, public status = 400) {
      super(message);
      this.name = "AppError";
    }
  },
}));
vi.mock("@/lib/account", () => ({ requireActiveWorkspace: mocks.requireActiveWorkspace }));
vi.mock("@/lib/managed-codex", () => ({ runManagedCodexJson: mocks.runManagedCodexJson }));
vi.mock("@/lib/handoff-access", () => ({ canReadScopedHandoff: mocks.canReadScopedHandoff }));

import { importContactsFromArtifact, importOwnerContacts } from "@/lib/contacts";

type ImportRow = {
  id: string;
  status: string;
  content_fingerprint: string;
  started_at: string;
  created_count: number;
  updated_count: number;
  skipped_count: number;
};

const csvText = [
  "First name,Last name,Email,Company,Source,Profile,Notes",
  "Ada,Lovelace,ada@example.com,Engines,Conference,https://example.com/ada?access_token=private,Met at the conference",
  "Grace,Hopper,grace@example.com,Navy,Referral,https://example.com/grace,Interested in a follow-up",
].join("\n");

describe("workspace contact CSV import", () => {
  let importRow: ImportRow | null;
  let artifactRow: Record<string, unknown> | null;

  beforeEach(() => {
    vi.clearAllMocks();
    importRow = null;
    artifactRow = {
      id: "50000000-0000-4000-8000-000000000001",
      project_id: "40000000-0000-4000-8000-000000000001",
      handoff_id: null,
      name: "prospects.csv",
      mime_type: "text/csv",
      size_bytes: new TextEncoder().encode(csvText).byteLength,
      storage_path: "workspace-1/project-1/prospects.csv",
      status: "ready",
    };
    mocks.download.mockResolvedValue({ data: new Blob([csvText]), error: null });
    mocks.canReadScopedHandoff.mockResolvedValue(true);
    mocks.requireActiveWorkspace.mockResolvedValue({ id: "workspace-1", plan: "pro" });
    mocks.runManagedCodexJson.mockResolvedValue({
      nameColumns: [0, 1],
      emailColumn: 2,
      phoneColumn: null,
      companyColumn: 3,
      jobTitleColumn: null,
      sourceColumn: 4,
      sourceUrlColumn: 5,
      notesColumns: [6],
    });
    mocks.rpc.mockResolvedValue({ data: { created: 2, updated: 0, skipped: 0, processed: 2 }, error: null });
    mocks.adminDb.mockReturnValue({
      from: (table: string) => {
        let inserted: Record<string, unknown> | null = null;
        const builder = {
          error: null,
          select: () => builder,
          eq: () => builder,
          lt: () => builder,
          insert: (values: Record<string, unknown>) => {
            inserted = values;
            return builder;
          },
          update: (values: Record<string, unknown>) => {
            if (table === "contact_imports" && importRow) importRow = { ...importRow, ...values } as ImportRow;
            return builder;
          },
          maybeSingle: async () => {
            if (table === "workspaces") return { data: { plan: "pro" }, error: null };
            if (table === "artifacts") return { data: artifactRow, error: null };
            if (table === "handoffs") return { data: { id: "handoff-1", assigned_agent_id: "agent-other", status: "open" }, error: null };
            if (table !== "contact_imports") return { data: null, error: null };
            if (inserted) {
              const values = inserted;
              inserted = null;
              importRow = {
                ...values,
                id: "import-1",
                status: "processing",
                started_at: new Date().toISOString(),
                created_count: 0,
                updated_count: 0,
                skipped_count: 0,
              } as ImportRow;
              return { data: importRow, error: null };
            }
            return { data: importRow, error: null };
          },
        };
        return builder;
      },
      rpc: mocks.rpc,
      storage: {
        from: () => ({ download: mocks.download }),
      },
    });
  });

  it("maps a private sample, imports confirmed rows with provenance, and returns the same result on retry", async () => {
    const input = {
      fileName: "prospects.csv",
      csvText,
      sourceLabel: "October research",
      projectId: "40000000-0000-4000-8000-000000000001",
      idempotencyKey: "contact-import-2026-10",
    };

    const result = await importOwnerContacts("owner-1", input);

    expect(result).toMatchObject({ created: 2, updated: 0, skipped: 0, importId: "import-1", alreadyImported: false });
    expect(mocks.requireActiveWorkspace).toHaveBeenCalledWith("owner-1");
    expect(mocks.runManagedCodexJson).toHaveBeenCalledOnce();

    const modelInput = JSON.stringify(mocks.runManagedCodexJson.mock.calls[0][0].userInput);
    expect(modelInput).not.toContain("ada@example.com");
    expect(modelInput).not.toContain("Met at the conference");

    expect(mocks.rpc).toHaveBeenCalledOnce();
    const upsert = mocks.rpc.mock.calls[0][1];
    expect(upsert.p_workspace_id).toBe("workspace-1");
    expect(upsert.p_project_id).toBe(input.projectId);
    expect(upsert.p_contacts).toHaveLength(2);
    expect(upsert.p_contacts[0]).toMatchObject({
      full_name: "Ada Lovelace",
      email: "ada@example.com",
      company: "Engines",
      source_label: "Conference",
      source_url: "https://example.com/ada",
      notes: "Notes: Met at the conference",
      source_key: "import:import-1:row:2",
    });
    expect(importRow).toMatchObject({ status: "completed", created_count: 2, updated_count: 0, skipped_count: 0 });

    const retried = await importOwnerContacts("owner-1", input);
    expect(retried).toMatchObject({ created: 2, updated: 0, skipped: 0, importId: "import-1", alreadyImported: true });
    expect(mocks.runManagedCodexJson).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });

  it("rejects reuse of an idempotency key for different file contents", async () => {
    await importOwnerContacts("owner-1", {
      fileName: "prospects.csv",
      csvText,
      sourceLabel: "October research",
      projectId: null,
      idempotencyKey: "contact-import-2026-10",
    });

    await expect(importOwnerContacts("owner-1", {
      fileName: "prospects.csv",
      csvText: csvText.replace("Ada", "Adele"),
      sourceLabel: "October research",
      projectId: null,
      idempotencyKey: "contact-import-2026-10",
    })).rejects.toMatchObject({ status: 409 });
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });

  it("imports a ready project CSV artifact for the paired agent", async () => {
    const result = await importContactsFromArtifact({
      agentId: "agent-1",
      workspaceId: "workspace-1",
      ownerId: "owner-1",
      isBoss: false,
    }, {
      artifactId: "50000000-0000-4000-8000-000000000001",
      sourceLabel: "Agent research",
      idempotencyKey: "agent-import-2026-10",
    });

    expect(result).toMatchObject({ created: 2, updated: 0, skipped: 0, alreadyImported: false });
    expect(mocks.rpc).toHaveBeenCalledWith("stoic_upsert_contacts", expect.objectContaining({
      p_workspace_id: "workspace-1",
      p_actor_agent_id: "agent-1",
      p_project_id: "40000000-0000-4000-8000-000000000001",
      p_artifact_id: "50000000-0000-4000-8000-000000000001",
    }));
  });

  it("refuses a CSV attached to a handoff the agent cannot read", async () => {
    artifactRow = { ...artifactRow, handoff_id: "handoff-1" };
    mocks.canReadScopedHandoff.mockResolvedValue(false);

    await expect(importContactsFromArtifact({
      agentId: "agent-1",
      workspaceId: "workspace-1",
      ownerId: "owner-1",
      isBoss: false,
    }, {
      artifactId: "50000000-0000-4000-8000-000000000001",
      idempotencyKey: "agent-import-denied-01",
    })).rejects.toThrow("Contact CSV file not found");

    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.runManagedCodexJson).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
