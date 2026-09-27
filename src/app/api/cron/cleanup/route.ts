import { adminDb, responseError } from "@/lib/supabase";
import { LIMITS, requiredEnv } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${requiredEnv("CRON_SECRET")}`) return new Response("Unauthorized", { status: 401 });
  try {
    const db = adminDb();
    let removedHandoffs = 0;
    let removedReservations = 0;
    const { data: workspaces, error } = await db.from("workspaces").select("id,plan");
    if (error) throw error;
    for (const workspace of workspaces || []) {
      const days = LIMITS[workspace.plan as "free" | "pro"].historyDays;
      const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
      const { data: old, error: oldError } = await db.from("handoffs").select("id")
        .eq("workspace_id", workspace.id).in("status", ["accepted", "canceled"]).lt("updated_at", cutoff).limit(1000);
      if (oldError) throw oldError;
      if (old?.length) {
        const { error: deleteError } = await db.from("handoffs").delete().eq("workspace_id", workspace.id).in("id", old.map((row) => row.id));
        if (deleteError) throw deleteError;
        removedHandoffs += old.length;
      }
      const { error: auditError } = await db.from("audit_events").delete().eq("workspace_id", workspace.id).lt("created_at", cutoff);
      if (auditError) throw auditError;
      const { data: expired, error: expiredError } = await db.from("artifacts").select("id,storage_path")
        .eq("workspace_id", workspace.id).eq("status", "pending").lt("expires_at", new Date().toISOString()).limit(1000);
      if (expiredError) throw expiredError;
      if (expired?.length) {
        const removed = await db.storage.from("relay-artifacts").remove(expired.map((row) => row.storage_path));
        if (removed.error) throw removed.error;
        const { error: deleteError } = await db.from("artifacts").delete().eq("workspace_id", workspace.id).in("id", expired.map((row) => row.id));
        if (deleteError) throw deleteError;
        removedReservations += expired.length;
      }
    }
    const { error: counterError } = await db.from("rate_counters").delete().lt("window_start", new Date(Date.now() - 86400_000).toISOString());
    if (counterError) throw counterError;
    return Response.json({ removedHandoffs, removedReservations });
  } catch (error) { return responseError(error); }
}
