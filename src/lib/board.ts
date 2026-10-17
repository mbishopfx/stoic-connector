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
  const { data: project, error: projectError } = await db.from("projects").select("*")
    .eq("workspace_id", agent.workspaceId).eq("id", projectId).is("archived_at", null).maybeSingle();
  if (projectError) throw projectError;
  if (!project) throw new AppError("Project not found", 404);
  const { data, error } = await db.from("board_messages")
    .select("id,project_id,parent_id,author_key,kind,body,created_at")
    .eq("workspace_id", agent.workspaceId).eq("project_id", projectId)
    .order("message_seq", { ascending: false })
    .range(offset, offset + 99);
  if (error) throw error;
  const groupChatRootId = (project as typeof project & { group_chat_root_id?: string | null }).group_chat_root_id || null;
  let messages = data || [];
  if (groupChatRootId && !messages.some((message) => message.id === groupChatRootId)) {
    const { data: root, error: rootError } = await db.from("board_messages")
      .select("id,project_id,parent_id,author_key,kind,body,created_at")
      .eq("workspace_id", agent.workspaceId).eq("project_id", projectId).eq("id", groupChatRootId).maybeSingle();
    if (rootError) throw rootError;
    if (root) messages = [...messages, root];
  }
  return {
    project: { id: project.id, name: project.name },
    groupChatRootId,
    messages,
    newestMessageId: data?.[0]?.id || null,
    nextOffset: data?.length === 100 ? offset + 100 : null,
  };
}

export async function listUnreadProjectMessages(agent: AgentIdentity, offset = 0) {
  const { data, error } = await adminDb().rpc("stoic_agent_unread_board_page", {
    p_workspace_id: agent.workspaceId, p_agent_id: agent.agentId, p_offset: offset,
  });
  if (error) throw error;
  return { messages: data || [], nextOffset: data?.length === 100 ? offset + 100 : null };
}

export async function listGroupDiscussions(agent: AgentIdentity, projectId: string, offset = 0) {
  const db = adminDb();
  const { data: project, error: projectError } = await db.from("projects").select("id,name")
    .eq("workspace_id", agent.workspaceId).eq("id", projectId).is("archived_at", null).maybeSingle();
  if (projectError) throw projectError;
  if (!project) throw new AppError("Project not found", 404);
  const { data, error } = await db.rpc("stoic_group_discussion_roots_page", {
    p_workspace_id: agent.workspaceId, p_agent_id: agent.agentId,
    p_project_id: projectId, p_offset: offset,
  });
  if (error) throw error;
  const discussions = (data || []).map((item: {
    id: string; project_id: string; author_key: string; body: string; created_at: string;
  }) => ({
    id: item.id,
    projectId: item.project_id,
    authorKey: item.author_key,
    topic: item.body.match(/^Topic: (.+)$/m)?.[1] || "Untitled discussion",
    participantAgentIds: (item.body.match(/^Invited agent IDs: (.+)$/m)?.[1] || "")
      .split(",").map((value: string) => value.trim().replace(/^agent:/, "")).filter(Boolean),
    createdAt: item.created_at,
    closesAt: item.body.startsWith("[stoic-agent-discussion:v1]")
      ? new Date(new Date(item.created_at).getTime() + 90 * 60_000).toISOString() : null,
  }));
  return { project, discussions, nextOffset: data?.length === 100 ? offset + 100 : null };
}

export async function readGroupDiscussion(agent: AgentIdentity, projectId: string, rootId: string, offset = 0) {
  const { data, error } = await adminDb().rpc("stoic_discussion_messages_page", {
    p_workspace_id: agent.workspaceId, p_agent_id: agent.agentId,
    p_project_id: projectId, p_root_id: rootId, p_offset: offset,
  });
  if (error) {
    if (error.message.includes("not_found")) throw new AppError("Discussion not found", 404);
    throw error;
  }
  const { data: root, error: rootError } = await adminDb().from("board_messages")
    .select("id,project_id,parent_id,author_key,kind,body,created_at,message_seq")
    .eq("workspace_id", agent.workspaceId).eq("project_id", projectId).eq("id", rootId).single();
  if (rootError) throw rootError;
  return { root, messages: data || [], nextOffset: data?.length === 100 ? offset + 100 : null };
}

export async function startGroupDiscussion(agent: AgentIdentity, input: {
  projectId: string; topic: string; guidance?: string; participantAgentIds: string[]; idempotencyKey: string;
}) {
  const participants = [...new Set([agent.agentId, ...input.participantAgentIds])];
  if (participants.length > 10) throw new AppError("Choose at most ten participants including yourself", 400);
  const { data, error } = await adminDb().rpc("stoic_start_agent_discussion", {
    p_workspace_id: agent.workspaceId, p_project_id: input.projectId,
    p_actor_agent_id: agent.agentId, p_topic: input.topic, p_guidance: input.guidance || null,
    p_participant_ids: participants, p_idempotency_key: input.idempotencyKey,
  });
  if (error) {
    const status = error.message.includes("not_found") ? 404
      : error.message.includes("forbidden") ? 403
        : error.message.includes("idempotency_conflict") ? 409 : 400;
    throw new AppError(error.message.replaceAll("_", " "), status);
  }
  return data;
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
    const status = error.message.includes("subscription_required") ? 402
      : error.message.includes("discussion_agent_not_invited") || error.message.includes("forbidden") ? 403
        : error.message.includes("not_found") ? 404
          : error.message.includes("discussion_window_ended") || error.message.includes("discussion_reply_cap_reached") || error.message.includes("conflict") ? 409
            : 400;
    throw new AppError(error.message.replaceAll("_", " "), status);
  }
  return data;
}
