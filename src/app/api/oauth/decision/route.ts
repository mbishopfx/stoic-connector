import { NextResponse } from "next/server";
import { AppError, currentUser, responseError, serverAuth } from "@/lib/supabase";
import { appOrigin } from "@/lib/config";

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (!origin || origin !== appOrigin()) throw new AppError("Invalid request origin", 403);
    await currentUser();
    const form = await request.formData();
    const authorizationId = form.get("authorization_id");
    const decision = form.get("decision");
    if (typeof authorizationId !== "string" || !["approve", "deny"].includes(String(decision))) throw new AppError("Invalid decision");
    const supabase = await serverAuth();
    const { data, error } = decision === "approve" ? await supabase.auth.oauth.approveAuthorization(authorizationId) : await supabase.auth.oauth.denyAuthorization(authorizationId);
    if (error || !data) throw new AppError(error?.message || "Authorization failed");
    return NextResponse.redirect(data.redirect_url);
  } catch (error) { return responseError(error); }
}
