import { cookies } from "next/headers";
import { z } from "zod";
import { AppError, assertSameOrigin, responseError, serverAuth } from "@/lib/supabase";
import { PASSWORD_RECOVERY_COOKIE } from "@/lib/password-recovery";

export const runtime = "nodejs";

const passwordInput = z.object({
  password: z.string().min(8).max(128),
  confirmation: z.string().min(8).max(128),
}).refine((value) => value.password === value.confirmation, { path: ["confirmation"], message: "Those passwords don’t match." });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (Number(request.headers.get("content-length") || 0) > 4_096) throw new AppError("Request too large", 413);
    const cookieStore = await cookies();
    if (cookieStore.get(PASSWORD_RECOVERY_COOKIE)?.value !== "1") throw new AppError("Open a valid password reset link before saving a new password.", 403);
    let raw: unknown;
    let body: string;
    try {
      body = await request.text();
    } catch {
      throw new AppError("Enter a valid password and confirmation.", 400);
    }
    if (body.length > 4_096) throw new AppError("Request too large", 413);
    try {
      raw = JSON.parse(body);
    } catch {
      throw new AppError("Enter a valid password and confirmation.", 400);
    }
    const parsed = passwordInput.safeParse(raw);
    if (!parsed.success) throw new AppError(parsed.error.issues[0]?.message || "Enter a valid password and confirmation.", 400);

    const supabase = await serverAuth();
    const { data, error: userError } = await supabase.auth.getUser();
    if (userError || !data.user) throw new AppError("Your reset link has expired. Request a new one and try again.", 401);
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) throw new AppError("Could not update your password. Request a new reset link and try again.", 400);
    await supabase.auth.signOut({ scope: "local" });
    cookieStore.set(PASSWORD_RECOVERY_COOKIE, "", { httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "lax", path: "/", maxAge: 0 });
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return responseError(error);
  }
}
