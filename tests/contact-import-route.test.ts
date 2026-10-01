import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  currentUser: vi.fn(),
  importOwnerContacts: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  AppError: class AppError extends Error {
    constructor(message: string, public status = 400) { super(message); }
  },
  assertSameOrigin: mocks.assertSameOrigin,
  currentUser: mocks.currentUser,
  responseError: (error: unknown) => Response.json(
    { error: error instanceof Error ? error.message : "Unexpected error" },
    { status: typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 500 },
  ),
}));
vi.mock("@/lib/contacts", () => ({ importOwnerContacts: mocks.importOwnerContacts }));

import { POST } from "@/app/api/contacts/import/route";

describe("contacts CSV import route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser.mockResolvedValue({ id: "owner-1" });
    mocks.importOwnerContacts.mockResolvedValue({ created: 1, updated: 0, skipped: 0 });
  });

  it("accepts the same-origin multipart upload and imports the selected CSV", async () => {
    const form = new FormData();
    form.set("file", new File(["name,email\nStoic QA Fixture,qa@example.invalid"], "contacts.csv", { type: "text/csv" }));
    form.set("sourceLabel", "Synthetic UI acceptance test");
    form.set("idempotencyKey", "csv-import-test-20261001");
    const request = new Request("https://stoic.example/api/contacts/import", {
      method: "POST",
      headers: { origin: "https://stoic.example" },
      body: form,
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { created: 1, updated: 0, skipped: 0 } });
    expect(mocks.assertSameOrigin).toHaveBeenCalledWith(request, "multipart/form-data");
    expect(mocks.importOwnerContacts).toHaveBeenCalledWith("owner-1", expect.objectContaining({
      fileName: "contacts.csv",
      csvText: "name,email\nStoic QA Fixture,qa@example.invalid",
      sourceLabel: "Synthetic UI acceptance test",
      idempotencyKey: "csv-import-test-20261001",
    }));
  });
});
