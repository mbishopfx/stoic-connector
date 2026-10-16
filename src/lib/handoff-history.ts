import { z } from "zod";
import { AppError, adminDb } from "@/lib/supabase";
import { requireWorkspace } from "@/lib/account";

const handoffStatuses = ["proposed", "assigned", "claimed", "blocked", "submitted", "changes_requested", "accepted", "canceled"] as const;
const pageSize = 40;
const uuid = z.uuid();
const cursorSchema = z.object({
  createdAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/).refine((value) => Number.isFinite(Date.parse(value))),
  id: uuid,
});
const filtersSchema = z.object({
  q: z.string().trim().max(120).default(""),
  projectId: z.union([z.literal("all"), uuid]).default("all"),
  agentId: z.union([z.literal("all"), z.literal("unassigned"), uuid]).default("all"),
  status: z.union([z.literal("all"), z.enum(handoffStatuses)]).default("all"),
  cursor: z.string().max(256).optional(),
});

export type HandoffHistoryFilters = z.infer<typeof filtersSchema>;

export function parseHandoffHistoryFilters(params: URLSearchParams): HandoffHistoryFilters {
  try {
    const filters = filtersSchema.parse({
      q: params.get("q") || "",
      projectId: params.get("projectId") || "all",
      agentId: params.get("agentId") || "all",
      status: params.get("status") || "all",
      cursor: params.get("cursor") || undefined,
    });
    if (filters.cursor) decodeCursor(filters.cursor);
    return filters;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("Handoff history filters are invalid.", 400);
  }
}

function encodeCursor(value: { createdAt: string; id: string }) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeCursor(value: string) {
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch {
    throw new AppError("Handoff history cursor is invalid. Refresh the list and try again.", 400);
  }
}

export async function listOwnerHandoffHistory(ownerId: string, filters: HandoffHistoryFilters) {
  const workspace = await requireWorkspace(ownerId);
  const cursor = filters.cursor ? decodeCursor(filters.cursor) : null;

  let query = adminDb().from("handoffs")
    .select("id,project_id,assigned_agent_id,created_by_agent_id,title,goal,constraints,status,created_at,updated_at")
    .eq("workspace_id", workspace.id);
  if (filters.projectId !== "all") query = query.eq("project_id", filters.projectId);
  if (filters.agentId === "unassigned") query = query.is("assigned_agent_id", null);
  else if (filters.agentId !== "all") query = query.eq("assigned_agent_id", filters.agentId);
  if (filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.q) query = query.textSearch("search_document", filters.q, { config: "simple", type: "websearch" });
  if (cursor) {
    query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
  }

  const { data, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(pageSize + 1);
  if (error) throw error;
  const rows = data || [];
  const hasMore = rows.length > pageSize;
  const items = rows.slice(0, pageSize);
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null,
    hasMore,
    pageSize,
  };
}

export async function readOwnerHandoffHistory(ownerId: string, handoffId: string) {
  const workspace = await requireWorkspace(ownerId);
  const db = adminDb();
  const { data: handoff, error } = await db.from("handoffs")
    .select("id,project_id,assigned_agent_id,created_by_agent_id,title,goal,constraints,status,created_at,updated_at")
    .eq("workspace_id", workspace.id).eq("id", handoffId).maybeSingle();
  if (error) throw error;
  if (!handoff) throw new AppError("Handoff not found", 404);
  const [events, artifacts] = await Promise.all([
    db.from("task_events").select("id,handoff_id,actor_key,event_type,body,created_at")
      .eq("workspace_id", workspace.id).eq("handoff_id", handoffId).order("created_at", { ascending: false }),
    db.from("artifacts").select("id,project_id,handoff_id,name,mime_type,size_bytes,created_at")
      .eq("workspace_id", workspace.id).eq("handoff_id", handoffId).eq("status", "ready").order("created_at", { ascending: false }),
  ]);
  for (const result of [events, artifacts]) if (result.error) throw result.error;
  return { handoff, events: (events.data || []).reverse(), artifacts: artifacts.data || [] };
}
