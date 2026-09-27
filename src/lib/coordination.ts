import { adminDb, AppError } from "@/lib/supabase";
import { handoffActionInput, handoffInput } from "@/lib/validation";
import { setBrief, requireWorkspace } from "@/lib/account";
import type { AgentIdentity } from "@/lib/identity";

type Actor = { agent: AgentIdentity; userId?: never } | { agent?: never; userId: string };

function dbFailure(error: { message: string } | null): never {
  const message = error?.message || "Database request failed";
  const status = message.includes("quota") ? 402 : message.includes("forbidden") ? 403 : message.includes("not_found") ? 404 : message.includes("invalid_transition") ? 409 : 400;
  throw new AppError(message.replaceAll("_", " "), status);
}

export async function projectBrief(agent: AgentIdentity, projectId: string) {
  const { data, error } = await adminDb().from("projects").select("id,name,brief,brief_version,created_at")
    .eq("workspace_id", agent.workspaceId).eq("id", projectId).is("archived_at", null).maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError("Project not found", 404);
  return data;
}

export async function listInbox(agent: AgentIdentity, offset = 0) {
  const db = adminDb();
  const query = db.from("handoffs").select("id,project_id,assigned_agent_id,created_by_agent_id,title,goal,constraints,status,created_at,updated_at")
    .eq("workspace_id", agent.workspaceId).not("status", "in", '("accepted","canceled")')
    .order("updated_at", { ascending: false }).range(offset, offset + 99);
  const { data, error } = agent.isBoss ? await query : await query.eq("assigned_agent_id", agent.agentId).neq("status", "proposed");
  if (error) throw error;
  const checked = await db.from("agents").update({ last_check_at: new Date().toISOString() }).eq("id", agent.agentId).eq("status", "connected");
  if (checked.error) throw checked.error;
  return { handoffs: data || [], nextOffset: data?.length === 100 ? offset + 100 : null };
}

export async function handoffDetails(agent: AgentIdentity, handoffId: string) {
  const db = adminDb();
  const { data: handoff, error } = await db.from("handoffs").select("*").eq("workspace_id", agent.workspaceId).eq("id", handoffId).maybeSingle();
  if (error) throw error;
  if (!handoff) throw new AppError("Handoff not found", 404);
  const [events, artifacts, approvals] = await Promise.all([
    db.from("task_events").select("id,actor_key,event_type,body,created_at").eq("handoff_id", handoffId).eq("workspace_id", agent.workspaceId).order("created_at"),
    db.from("artifacts").select("id,name,mime_type,size_bytes,created_at").eq("handoff_id", handoffId).eq("workspace_id", agent.workspaceId).eq("status", "ready"),
    db.from("approvals").select("id,action_summary,status,created_at,decided_at").eq("handoff_id", handoffId).eq("workspace_id", agent.workspaceId),
  ]);
  for (const result of [events, artifacts, approvals]) if (result.error) throw result.error;
  return { handoff, events: events.data || [], artifacts: artifacts.data || [], approvals: approvals.data || [] };
}

export async function createHandoff(actor: Actor, input: unknown) {
  const parsed = handoffInput.parse(input);
  const workspaceId = actor.agent ? actor.agent.workspaceId : (await requireWorkspace(actor.userId)).id;
  let assignedAgentId = parsed.assignedAgentId;
  if (!assignedAgentId) {
    const db = adminDb();
    const { data: workspace } = await db.from("workspaces").select("plan").eq("id", workspaceId).single();
    if (workspace?.plan !== "pro") throw new AppError("Project routing is included with Pro", 402);
    const { data: project } = await db.from("projects").select("default_agent_id").eq("id", parsed.projectId).eq("workspace_id", workspaceId).maybeSingle();
    assignedAgentId = project?.default_agent_id;
    if (!assignedAgentId) throw new AppError("Choose an agent or set this project's default agent", 400);
  }
  const { data, error } = await adminDb().rpc("relay_create_handoff", {
    p_workspace_id: workspaceId,
    p_project_id: parsed.projectId,
    p_assigned_agent_id: assignedAgentId,
    p_actor_agent_id: actor.agent?.agentId || null,
    p_actor_user_id: actor.userId || null,
    p_title: parsed.title,
    p_goal: parsed.goal,
    p_constraints: parsed.constraints,
    p_idempotency_key: parsed.idempotencyKey || null,
  });
  if (error) dbFailure(error);
  return data;
}

export async function handoffAction(actor: Actor, input: unknown) {
  const parsed = handoffActionInput.parse(input);
  const { data, error } = await adminDb().rpc("relay_handoff_action", {
    p_handoff_id: parsed.handoffId,
    p_actor_agent_id: actor.agent?.agentId || null,
    p_actor_user_id: actor.userId || null,
    p_action: parsed.action,
    p_body: parsed.body,
    p_idempotency_key: parsed.idempotencyKey || null,
  });
  if (error) dbFailure(error);
  return data;
}

export async function agentUpdateBrief(agent: AgentIdentity, projectId: string, brief: string, expectedVersion: number) {
  if (!agent.isBoss) throw new AppError("Only the designated boss can update the shared brief", 403);
  return setBrief(agent.workspaceId, projectId, brief, expectedVersion, `agent:${agent.agentId}`);
}

export async function requestApproval(agent: AgentIdentity, handoffId: string, actionSummary: string, idempotencyKey: string) {
  const { data, error } = await adminDb().rpc("relay_request_approval", {
    p_handoff_id: handoffId, p_actor_agent_id: agent.agentId, p_action_summary: actionSummary, p_idempotency_key: idempotencyKey,
  });
  if (error) dbFailure(error);
  return data;
}

export async function decideApproval(ownerId: string, approvalId: string, decision: "approved" | "denied") {
  const workspace = await requireWorkspace(ownerId);
  const db = adminDb();
  const { data, error } = await db.from("approvals").update({ status: decision, decided_at: new Date().toISOString() })
    .eq("workspace_id", workspace.id).eq("id", approvalId).eq("status", "pending").select().maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError("Approval not found or already decided", 409);
  await db.from("audit_events").insert({ workspace_id: workspace.id, actor_key: `user:${ownerId}`, action: `approval.${decision}`, object_id: approvalId });
  return data;
}
