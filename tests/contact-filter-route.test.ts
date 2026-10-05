import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ currentUser: vi.fn(), listContacts: vi.fn(), listContactSources: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  currentUser: mocks.currentUser,
  responseError: (error: unknown) => Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 400 }),
}));
vi.mock("@/lib/contacts", () => ({ listContacts: mocks.listContacts, listContactSources: mocks.listContactSources }));
import { GET } from "@/app/api/contacts/route";

describe("owner contact list filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser.mockResolvedValue({ id: "owner-1" });
    mocks.listContacts.mockResolvedValue({ contacts: [], total: 0, nextOffset: null });
  });

  it("normalizes and passes all bounded filters to the owner-scoped query", async () => {
    const projectId = "40000000-0000-4000-8000-000000000001";
    const params = new URLSearchParams({ q: "  Company, Inc.  ", field: "source", status: "new", projectId,
      contactability: "missing_email", activity: "30d", sort: "name_asc", offset: "50" });
    const response = await GET(new Request(`https://stoic.example/api/contacts?${params}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.listContacts).toHaveBeenCalledWith("owner-1", {
      search: "Company, Inc.", field: "source", status: "new", projectId,
      contactability: "missing_email", activity: "30d", sort: "name_asc", offset: 50,
    });
    expect(mocks.listContactSources).not.toHaveBeenCalled();
  });

  it("keeps the existing search-only URL compatible", async () => {
    const response = await GET(new Request("https://stoic.example/api/contacts?q=Ada"));
    expect(response.status).toBe(200);
    expect(mocks.listContacts).toHaveBeenCalledWith("owner-1", {
      search: "Ada", field: "all", status: "all", projectId: "all",
      contactability: "any", activity: "any", sort: "recent", offset: 0,
    });
  });

  it.each(["status=unknown", "projectId=other-workspace", "sort=random", "offset=-1", "q=" + "x".repeat(121)])("rejects malformed filters without a database read: %s", async (params) => {
    const response = await GET(new Request(`https://stoic.example/api/contacts?${params}`));
    expect(response.status).toBe(400);
    expect(mocks.listContacts).not.toHaveBeenCalled();
  });
});
