import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  serverAuth: vi.fn(),
  assertSameOrigin: vi.fn(),
  auth: {
    verifyOtp: vi.fn(),
    exchangeCodeForSession: vi.fn(),
    getUser: vi.fn(),
    updateUser: vi.fn(),
    signOut: vi.fn(),
  },
  cookieStore: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/supabase", () => ({
  serverAuth: mocks.serverAuth,
  assertSameOrigin: mocks.assertSameOrigin,
  AppError: class AppError extends Error {
    constructor(message: string, public status = 400) { super(message); }
  },
  responseError: (error: { message?: string; status?: number }) => Response.json(
    { error: error?.message || "Unexpected error" }, { status: error?.status || 500 },
  ),
}));

import { GET } from "../src/app/auth/recovery/route";
import { POST } from "../src/app/api/auth/password-recovery/route";
import { PASSWORD_RECOVERY_COOKIE } from "../src/lib/password-recovery";

const user = { id: "11111111-1111-4111-8111-111111111111" };

function recoveryRequest(search: string) {
  return new Request(`https://stoic.bishoptech.dev/auth/recovery${search}`);
}

function passwordRequest(body: unknown) {
  return new Request("https://stoic.bishoptech.dev/api/auth/password-recovery", {
    method: "POST",
    headers: { Origin: "https://stoic.bishoptech.dev", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Stoic password recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue(mocks.cookieStore);
    mocks.cookieStore.get.mockReturnValue({ value: "1" });
    mocks.serverAuth.mockReturnValue({ auth: mocks.auth });
    mocks.auth.verifyOtp.mockResolvedValue({ data: { user }, error: null });
    mocks.auth.exchangeCodeForSession.mockResolvedValue({ data: { user }, error: null });
    mocks.auth.getUser.mockResolvedValue({ data: { user }, error: null });
    mocks.auth.updateUser.mockResolvedValue({ data: { user }, error: null });
    mocks.auth.signOut.mockResolvedValue({ error: null });
  });

  it("verifies a recovery token and returns the browser to Stoic's password page", async () => {
    const response = await GET(recoveryRequest("?token_hash=one-time-token&type=recovery"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://stoic.bishoptech.dev/reset-password");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "one-time-token", type: "recovery" });
    expect(mocks.cookieStore.set).toHaveBeenCalledWith(PASSWORD_RECOVERY_COOKIE, "1", expect.objectContaining({ httpOnly: true, secure: true, maxAge: 900 }));
  });

  it("supports the PKCE code path without allowing a caller-selected redirect", async () => {
    const response = await GET(recoveryRequest("?code=pkce-code&next=https%3A%2F%2Fevil.example"));

    expect(response.headers.get("location")).toBe("https://stoic.bishoptech.dev/reset-password");
    expect(mocks.auth.exchangeCodeForSession).toHaveBeenCalledWith("pkce-code");
  });

  it("sends invalid or non-recovery token links to the request form", async () => {
    const response = await GET(recoveryRequest("?token_hash=one-time-token&type=signup"));

    expect(response.headers.get("location")).toBe("https://stoic.bishoptech.dev/forgot-password?error=invalid_link");
    expect(mocks.auth.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.cookieStore.set).toHaveBeenCalledWith(PASSWORD_RECOVERY_COOKIE, "", expect.objectContaining({ maxAge: 0 }));
  });

  it("updates the password only with the recovery marker and an authenticated Supabase session", async () => {
    const response = await POST(passwordRequest({ password: "new-secure-password", confirmation: "new-secure-password" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mocks.assertSameOrigin).toHaveBeenCalledOnce();
    expect(mocks.auth.getUser).toHaveBeenCalledOnce();
    expect(mocks.auth.updateUser).toHaveBeenCalledWith({ password: "new-secure-password" });
    expect(mocks.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.cookieStore.set).toHaveBeenCalledWith(PASSWORD_RECOVERY_COOKIE, "", expect.objectContaining({ maxAge: 0 }));
  });

  it("rejects a missing recovery marker, unauthenticated sessions, and mismatched passwords", async () => {
    mocks.cookieStore.get.mockReturnValue(undefined);
    const missingMarker = await POST(passwordRequest({ password: "new-secure-password", confirmation: "new-secure-password" }));
    expect(missingMarker.status).toBe(403);
    expect(mocks.auth.updateUser).not.toHaveBeenCalled();

    mocks.cookieStore.get.mockReturnValue({ value: "1" });
    mocks.auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error("expired") });
    const noSession = await POST(passwordRequest({ password: "new-secure-password", confirmation: "new-secure-password" }));
    expect(noSession.status).toBe(401);

    mocks.auth.getUser.mockResolvedValue({ data: { user }, error: null });
    const mismatch = await POST(passwordRequest({ password: "new-secure-password", confirmation: "another-password" }));
    expect(mismatch.status).toBe(400);
    expect(mocks.auth.updateUser).not.toHaveBeenCalled();
  });
});
