import { handleStripeWebhook } from "@/lib/billing";
import { responseError } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    return Response.json(await handleStripeWebhook(request));
  } catch (error) {
    return responseError(error);
  }
}
