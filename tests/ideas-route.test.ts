import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  requireActiveWorkspace: vi.fn(),
  getWorkspaceIdeas: vi.fn(),
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

vi.mock("@/lib/account", () => ({ requireActiveWorkspace: mocks.requireActiveWorkspace }));
vi.mock("@/lib/ideas", () => ({ getWorkspaceIdeas: mocks.getWorkspaceIdeas }));

import { GET } from "../src/app/api/ideas/route";

describe("owner ideas history route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser.mockResolvedValue({ id: "owner-1" });
    mocks.requireActiveWorkspace.mockResolvedValue({ id: "workspace-1" });
    mocks.getWorkspaceIdeas.mockResolvedValue(Array.from({ length: 200 }, (_, index) => ({ id: `idea-${index}` })));
  });

  it("loads a bounded page for the signed-in owner's active workspace without caching", async () => {
    const response = await GET(new Request("https://stoic.test/api/ideas?offset=200"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.requireActiveWorkspace).toHaveBeenCalledWith("owner-1");
    expect(mocks.getWorkspaceIdeas).toHaveBeenCalledWith("workspace-1", 200);
    expect(body.nextOffset).toBe(400);
  });

  it("rejects offsets outside the pagination contract before reading workspace data", async () => {
    const response = await GET(new Request("https://stoic.test/api/ideas?offset=-1"));
    expect(response.status).toBe(400);
    expect(mocks.getWorkspaceIdeas).not.toHaveBeenCalled();
  });
});
