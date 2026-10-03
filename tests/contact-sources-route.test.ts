import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ currentUser: vi.fn(), listContacts: vi.fn(), listContactSources: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  AppError: class AppError extends Error { constructor(message: string, public status = 400) { super(message); } },
  currentUser: mocks.currentUser,
  responseError: (error: unknown) => Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 400 }),
}));
vi.mock("@/lib/contacts", () => ({ listContacts: mocks.listContacts, listContactSources: mocks.listContactSources }));
import { GET } from "@/app/api/contacts/route";

const contactId = "40000000-0000-4000-8000-000000000001";

describe("private contact source history route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser.mockResolvedValue({ id: "owner-1" });
    mocks.listContactSources.mockResolvedValue({ sources: [{ id: "source-1" }], total: 51, nextOffset: 50 });
  });

  it("pages source history through the authenticated owner only", async () => {
    const response = await GET(new Request(`https://stoic.example/api/contacts?sourcesFor=${contactId}&offset=0`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.listContactSources).toHaveBeenCalledWith("owner-1", contactId, 0);
    expect(mocks.listContacts).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ data: { total: 51, nextOffset: 50 } });
  });

  it("does not query source history without a signed-in user", async () => {
    mocks.currentUser.mockRejectedValue(new Error("Not signed in"));
    const response = await GET(new Request(`https://stoic.example/api/contacts?sourcesFor=${contactId}`));
    expect(response.ok).toBe(false);
    expect(mocks.listContactSources).not.toHaveBeenCalled();
  });

  it("rejects an invalid contact ID before a database lookup", async () => {
    const response = await GET(new Request("https://stoic.example/api/contacts?sourcesFor=other-workspace"));
    expect(response.ok).toBe(false);
    expect(mocks.listContactSources).not.toHaveBeenCalled();
  });
});
