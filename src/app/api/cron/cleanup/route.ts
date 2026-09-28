import { adminDb, responseError } from "@/lib/supabase";
import { requiredEnv } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${requiredEnv("CRON_SECRET")}`) return new Response("Unauthorized", { status: 401 });
  try {
    const db = adminDb();
    let removedReservations = 0;
    const { data: expired, error: expiredError } = await db.from("artifacts").select("id,storage_path")
      .eq("status", "pending").lt("expires_at", new Date().toISOString()).limit(1000);
    if (expiredError) throw expiredError;
    if (expired?.length) {
      const removed = await db.storage.from("stoic-artifacts").remove(expired.map((row) => row.storage_path));
      if (removed.error) throw removed.error;
      const { error: deleteError } = await db.from("artifacts").delete().in("id", expired.map((row) => row.id));
      if (deleteError) throw deleteError;
      removedReservations += expired.length;
    }
    const { error: counterError } = await db.from("rate_counters").delete().lt("window_start", new Date(Date.now() - 86400_000).toISOString());
    if (counterError) throw counterError;
    return Response.json({ removedReservations });
  } catch (error) { return responseError(error); }
}
