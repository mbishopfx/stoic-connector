import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ adminDb: vi.fn(), requireActiveWorkspace: vi.fn(), contact: { id: "contact-1" } as { id: string } | null, filters: [] as [string, unknown][] }));
vi.mock("@/lib/supabase", () => ({
  AppError: class AppError extends Error { constructor(message: string, public status = 400) { super(message); } },
  adminDb: mocks.adminDb,
}));
vi.mock("@/lib/account", () => ({ requireActiveWorkspace: mocks.requireActiveWorkspace }));
vi.mock("@/lib/handoff-access", () => ({ canReadScopedHandoff: vi.fn() }));
import { listContactSources } from "@/lib/contacts";

describe("owner contact source pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.filters = [];
    mocks.contact = { id: "contact-1" };
    mocks.requireActiveWorkspace.mockResolvedValue({ id: "workspace-1" });
    mocks.adminDb.mockReturnValue({
      from: (table: string) => {
        const builder = {
          select: () => builder,
          eq: (field: string, value: unknown) => { mocks.filters.push([field, value]); return builder; },
          order: () => builder,
          range: (from: number, to: number) => { mocks.filters.push(["range", [from, to]]); return Promise.resolve({ data: [{ id: "source-51" }], count: 51, error: null }); },
          maybeSingle: () => Promise.resolve({ data: table === "contacts" ? mocks.contact : null, error: null }),
        };
        return builder;
      },
    });
  });

  it("checks ownership of the requested contact before returning a page of its sources", async () => {
    const result = await listContactSources("owner-1", "contact-1", 50);
    expect(mocks.requireActiveWorkspace).toHaveBeenCalledWith("owner-1");
    expect(mocks.filters).toEqual([
      ["workspace_id", "workspace-1"], ["id", "contact-1"],
      ["workspace_id", "workspace-1"], ["contact_id", "contact-1"], ["range", [50, 99]],
    ]);
    expect(result).toEqual({ sources: [{ id: "source-51" }], total: 51, nextOffset: null });
  });

  it("returns no source details for a missing or foreign contact", async () => {
    mocks.contact = null;
    await expect(listContactSources("owner-1", "foreign-id")).rejects.toMatchObject({ status: 404 });
    expect(mocks.filters).toEqual([["workspace_id", "workspace-1"], ["id", "foreign-id"]]);
  });
});
