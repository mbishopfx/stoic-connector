import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  listOwnerHandoffHistory: vi.fn(),
  parseHandoffHistoryFilters: vi.fn(),
  readOwnerHandoffHistory: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  currentUser: mocks.currentUser,
  AppError: class AppError extends Error {
    constructor(message: string, public status = 400) { super(message); }
  },
  responseError: (error: unknown) => Response.json({ error: error instanceof Error ? error.message : "Unexpected error" }, {
    status: typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 500,
  }),
}));

vi.mock("@/lib/handoff-history", () => ({
  listOwnerHandoffHistory: mocks.listOwnerHandoffHistory,
  parseHandoffHistoryFilters: mocks.parseHandoffHistoryFilters,
  readOwnerHandoffHistory: mocks.readOwnerHandoffHistory,
}));

import { GET } from "../src/app/api/handoffs/route";

const ownerId = "10000000-0000-4000-8000-000000000001";
const handoffId = "50000000-0000-4000-8000-000000000001";

describe("owner handoff history route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser.mockResolvedValue({ id: ownerId });
    mocks.parseHandoffHistoryFilters.mockReturnValue({ q: "research", projectId: "all", agentId: "all", status: "all" });
    mocks.listOwnerHandoffHistory.mockResolvedValue({ items: [], nextCursor: null, hasMore: false, pageSize: 40 });
    mocks.readOwnerHandoffHistory.mockResolvedValue({ handoff: { id: handoffId }, events: [], artifacts: [] });
  });

  it("requires an authenticated owner and returns a filtered page without caching", async () => {
    const response = await GET(new Request("https://stoic.test/api/handoffs?q=research"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.parseHandoffHistoryFilters).toHaveBeenCalledWith(new URLSearchParams("q=research"));
    expect(mocks.listOwnerHandoffHistory).toHaveBeenCalledWith(ownerId, expect.objectContaining({ q: "research" }));
  });

  it("loads a selected handoff's full timeline and artifacts through the owner-scoped service", async () => {
    const response = await GET(new Request(`https://stoic.test/api/handoffs?id=${handoffId}`));
    expect(response.status).toBe(200);
    expect(mocks.readOwnerHandoffHistory).toHaveBeenCalledWith(ownerId, handoffId);
    expect(mocks.listOwnerHandoffHistory).not.toHaveBeenCalled();
  });

  it("rejects malformed handoff detail IDs before querying storage", async () => {
    const response = await GET(new Request("https://stoic.test/api/handoffs?id=not-a-uuid"));
    expect(response.status).toBe(400);
    expect(mocks.readOwnerHandoffHistory).not.toHaveBeenCalled();
  });
});
