import { requiredEnv } from "@/lib/config";
import { adminDb, responseError } from "@/lib/supabase";
import { synthesizeProject } from "@/lib/synthesis";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${requiredEnv("CRON_SECRET")}`) return new Response("Unauthorized", { status: 401 });
  if (!process.env.OPENAI_API_KEY) return Response.json({ enabled: false });
  try {
    const db = adminDb();
    const date = new Date().toISOString().slice(0, 10);
    const { data, error } = await db.rpc("stoic_next_synthesis_projects", { p_date: date, p_limit: 4 });
    if (error) throw error;
    const next = (data || []) as { id: string; workspace_id: string; name: string; brief: string }[];
    const outcomes = await Promise.allSettled(next.map((project) => synthesizeProject(project, date)));
    return Response.json({ attempted: next.length, completed: outcomes.filter((item) => item.status === "fulfilled" && item.value === "completed").length, failed: outcomes.filter((item) => item.status === "rejected").length });
  } catch (error) { return responseError(error); }
}
