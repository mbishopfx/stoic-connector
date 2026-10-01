import { requiredEnv } from "@/lib/config";
import { responseError } from "@/lib/supabase";
import { runDueIdeas } from "@/lib/ideas";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${requiredEnv("CRON_SECRET")}`) return new Response("Unauthorized", { status: 401 });
  try {
    return Response.json({ ideas: await runDueIdeas() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return responseError(error);
  }
}
