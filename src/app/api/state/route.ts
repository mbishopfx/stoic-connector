import { currentUser, responseError } from "@/lib/supabase";
import { dashboardState } from "@/lib/account";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await currentUser();
    const state = await dashboardState(user.id);
    return Response.json({ user: { id: user.id, email: user.email }, ...state }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return responseError(error);
  }
}
