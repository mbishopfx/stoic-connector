import { currentUser, responseError } from "@/lib/supabase";
import { dashboardState } from "@/lib/account";
import { currentMonthlyPrice } from "@/lib/billing";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await currentUser();
    const state = await dashboardState(user.id);
    const monthlyPrice = state.workspace?.plan === "pro" ? await currentMonthlyPrice(state.workspace.stripe_subscription_id) : null;
    return Response.json({ user: { id: user.id, email: user.email }, ...state, monthlyPrice }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return responseError(error);
  }
}
