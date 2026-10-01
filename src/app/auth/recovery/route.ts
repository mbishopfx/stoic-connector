import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { serverAuth } from "@/lib/supabase";
import { PASSWORD_RECOVERY_COOKIE, PASSWORD_RECOVERY_COOKIE_MAX_AGE } from "@/lib/password-recovery";

export const runtime = "nodejs";

function redirect(requestUrl: URL, path: string) {
  return NextResponse.redirect(new URL(path, requestUrl.origin), { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cookieStore = await cookies();
  cookieStore.set(PASSWORD_RECOVERY_COOKIE, "", { httpOnly: true, secure: url.protocol === "https:", sameSite: "lax", path: "/", maxAge: 0 });
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const code = url.searchParams.get("code");
  const supabase = await serverAuth();

  if (tokenHash && type === "recovery") {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
    if (error) return redirect(url, "/forgot-password?error=invalid_link");
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return redirect(url, "/forgot-password?error=invalid_link");
  } else {
    return redirect(url, "/forgot-password?error=invalid_link");
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return redirect(url, "/forgot-password?error=invalid_link");
  cookieStore.set(PASSWORD_RECOVERY_COOKIE, "1", {
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: PASSWORD_RECOVERY_COOKIE_MAX_AGE,
  });
  return redirect(url, "/reset-password");
}
