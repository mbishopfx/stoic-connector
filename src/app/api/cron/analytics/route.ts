import { requiredEnv } from "@/lib/config";
import { responseError } from "@/lib/supabase";
import { runDueActivityAnalytics } from "@/lib/activity-analytics";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${requiredEnv("CRON_SECRET")}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    return Response.json(await runDueActivityAnalytics(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return responseError(error);
  }
}
