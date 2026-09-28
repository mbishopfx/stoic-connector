import { NextResponse } from "next/server";
import { ensureWorkspaceForOwner } from "@/lib/account";
import { serverAuth } from "@/lib/supabase";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/dashboard";
  const safeNext = next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") && new URL(next, url.origin).origin === url.origin ? next : "/dashboard";
  if (!code) return NextResponse.redirect(new URL("/login?error=missing_code", url.origin));
  const supabase = await serverAuth();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=invalid_link", url.origin));
  if (data.user) await ensureWorkspaceForOwner(data.user.id);
  return NextResponse.redirect(new URL(safeNext, url.origin));
}
