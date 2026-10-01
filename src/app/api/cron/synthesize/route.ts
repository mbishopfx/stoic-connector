import { requiredEnv } from "@/lib/config";
import { responseError } from "@/lib/supabase";
import { runDueKnowledgeSteward } from "@/lib/knowledge-steward";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${requiredEnv("CRON_SECRET")}`) return new Response("Unauthorized", { status: 401 });
  try {
    const knowledge = await runDueKnowledgeSteward();
    return Response.json({ knowledge });
  } catch (error) { return responseError(error); }
}
