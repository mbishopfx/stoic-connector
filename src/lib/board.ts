import { z } from "zod";
import { requireWorkspace } from "@/lib/account";
import type { AgentIdentity } from "@/lib/identity";
import { adminDb, AppError } from "@/lib/supabase";

type Actor = { agent: AgentIdentity; userId?: never } | { agent?: never; userId: string };

export const boardPostInput = z.object({
  projectId: z.uuid(),
  parentId: z.uuid().nullable().optional(),
  kind: z.enum(["message", "run_report", "suggestion"]).default("message"),
  body: z.string().trim().min(1).max(12000),
  idempotencyKey: z.string().min(8).max(128),
}).superRefine((input, context) => {
  if (input.kind === "suggestion" && input.parentId) {
    context.addIssue({ code: "custom", message: "Suggestions must be top-level board posts", path: ["parentId"] });
  }
});

export async function listBoard(agent: AgentIdentity, projectId: string, offset = 0) {
  const db = adminDb();
  const { data: project, error: projectError } = await db.from("projects").select("id,name")
    .eq("workspace_id", agent.workspaceId).eq("id", projectId).is("archived_at", null).maybeSingle();
  if (projectError) throw projectError;
  if (!project) throw new AppError("Project not found", 404);
  const { data, error } = await db.from("board_messages")
    .select("id,project_id,parent_id,author_key,kind,body,created_at")
    .eq("workspace_id", agent.workspaceId).eq("project_id", projectId)
    .order("message_seq", { ascending: false })
    .range(offset, offset + 99);
  if (error) throw error;
  return { project, messages: data || [], newestMessageId: data?.[0]?.id || null, nextOffset: data?.length === 100 ? offset + 100 : null };
}

export async function acknowledgeBoardMessage(agent: AgentIdentity, projectId: string, messageId: string) {
  const { data, error } = await adminDb().rpc("stoic_ack_board_message", {
    p_workspace_id: agent.workspaceId,
    p_agent_id: agent.agentId,
    p_project_id: projectId,
    p_message_id: messageId,
  });
  if (error) {
    const status = error.message.includes("forbidden") ? 403 : error.message.includes("not_found") ? 404 : 400;
    throw new AppError(error.message.replaceAll("_", " "), status);
  }
  return { projectId, lastReadMessageId: data.last_read_id };
}

export async function postBoardMessage(actor: Actor, raw: unknown) {
  const input = boardPostInput.parse(raw);
  const workspaceId = actor.agent ? actor.agent.workspaceId : (await requireWorkspace(actor.userId!)).id;
  const { data, error } = await adminDb().rpc("stoic_post_board_message", {
    p_workspace_id: workspaceId,
    p_project_id: input.projectId,
    p_actor_agent_id: actor.agent?.agentId || null,
    p_actor_user_id: actor.userId || null,
    p_kind: input.kind,
    p_body: input.body,
    p_parent_id: input.parentId || null,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) {
    const status = error.message.includes("subscription_required") ? 402 : error.message.includes("forbidden") ? 403 : error.message.includes("not_found") ? 404 : error.message.includes("conflict") ? 409 : 400;
    throw new AppError(error.message.replaceAll("_", " "), status);
  }
  return data;
}
