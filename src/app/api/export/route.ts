import { currentUser, adminDb, responseError } from "@/lib/supabase";
import { requireWorkspace } from "@/lib/account";

export const runtime = "nodejs";
export const maxDuration = 60;

const TABLES = ["projects", "agents", "handoffs", "task_events", "board_messages", "synthesis_runs", "approvals", "artifacts", "audit_events", "knowledge_notes", "knowledge_settings", "knowledge_refresh_runs"] as const;
const OPTIONAL_TABLES = new Set(["knowledge_notes", "knowledge_settings", "knowledge_refresh_runs"]);

function missingOptionalTable(table: string, error: { code?: string; message?: string }) {
  return OPTIONAL_TABLES.has(table) && (
    error.code === "42P01" || error.code === "PGRST205" ||
    error.message?.toLowerCase().includes("does not exist") ||
    error.message?.toLowerCase().includes("schema cache")
  );
}

export async function GET() {
  try {
    const user = await currentUser();
    const workspace = await requireWorkspace(user.id);
    const encoder = new TextEncoder();
    const db = adminDb();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(JSON.stringify({ type: "workspace", data: {
            id: workspace.id, name: workspace.name, delegation_level: workspace.delegation_level,
            boss_agent_id: workspace.boss_agent_id, plan: workspace.plan, exported_at: new Date().toISOString(),
          } }) + "\n"));
          for (const table of TABLES) {
            let offset = 0;
            while (true) {
              const { data, error } = await db.from(table).select("*").eq("workspace_id", workspace.id).range(offset, offset + 999);
              if (error) {
                if (missingOptionalTable(table, error)) break;
                throw error;
              }
              for (const row of data || []) {
                // Never export hashes, pairing codes, or Storage paths.
                const safe = { ...row } as Record<string, unknown>;
                if (table === "agents") for (const key of ["credential_hash", "pairing_code_hash", "pairing_expires_at"]) delete safe[key];
                if (table === "artifacts") delete safe.storage_path;
                controller.enqueue(encoder.encode(JSON.stringify({ type: table, data: safe }) + "\n"));
              }
              if (!data || data.length < 1000) break;
              offset += 1000;
            }
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });
    return new Response(stream, { headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": "attachment; filename=stoic-workspace-export.ndjson",
      "Cache-Control": "no-store",
    } });
  } catch (error) { return responseError(error); }
}
