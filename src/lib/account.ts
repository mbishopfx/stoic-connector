import { createHash, randomBytes } from "node:crypto";
import { AppError, adminDb } from "@/lib/supabase";
import { LIMITS, type DelegationLevel, type Platform } from "@/lib/config";
import { rateLimit } from "@/lib/rate-limit";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export async function workspaceForOwner(ownerId: string) {
  const { data, error } = await adminDb().from("workspaces").select("*").eq("owner_id", ownerId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function requireWorkspace(ownerId: string) {
  const workspace = await workspaceForOwner(ownerId);
  if (!workspace) throw new AppError("Create a workspace first", 404);
  return workspace;
}

export async function dashboardState(ownerId: string) {
  const workspace = await workspaceForOwner(ownerId);
  if (!workspace) return { workspace: null };
  const db = adminDb();
  const [agents, projects, handoffs, approvals, artifacts, events] = await Promise.all([
    db.from("agents").select("id,name,platform,status,oauth_client_id,schedule_enabled,schedule_cadence_minutes,last_check_at,created_at").eq("workspace_id", workspace.id).order("created_at"),
    db.from("projects").select("*").eq("workspace_id", workspace.id).is("archived_at", null).order("created_at"),
    db.from("handoffs").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(100),
    db.from("approvals").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(50),
    db.from("artifacts").select("id,project_id,handoff_id,name,mime_type,size_bytes,status,created_at").eq("workspace_id", workspace.id).eq("status", "ready").order("created_at", { ascending: false }).limit(100),
    db.from("task_events").select("id,handoff_id,actor_key,event_type,body,created_at").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(150),
  ]);
  for (const result of [agents, projects, handoffs, approvals, artifacts, events]) if (result.error) throw result.error;
  const { data: usage, error: usageError } = await db.rpc("relay_workspace_usage", { p_workspace_id: workspace.id });
  if (usageError) throw usageError;
  return {
    workspace,
    agents: agents.data || [],
    projects: projects.data || [],
    handoffs: handoffs.data || [],
    approvals: approvals.data || [],
    artifacts: artifacts.data || [],
    events: events.data || [],
    usage: { handoffs: Number(usage.handoffs), storageBytes: Number(usage.storageBytes) },
    limits: LIMITS[workspace.plan as "free" | "pro"],
  };
}

export async function createWorkspace(ownerId: string, name: string) {
  const existing = await workspaceForOwner(ownerId);
  if (existing) {
    const { count, error: countError } = await adminDb().from("projects").select("id", { count: "exact", head: true }).eq("workspace_id", existing.id);
    if (countError) throw countError;
    if (!count) {
      const { error: repairError } = await adminDb().from("projects").insert({ workspace_id: existing.id, name: "First project", brief: "" });
      if (repairError) throw repairError;
    }
    return existing;
  }
  const db = adminDb();
  const { data, error } = await db.from("workspaces").insert({ owner_id: ownerId, name, delegation_level: "delegate" }).select().single();
  if (error) throw error;
  const project = await db.from("projects").insert({ workspace_id: data.id, name: "First project", brief: "" });
  if (project.error) throw project.error;
  return data;
}

export async function addAgent(ownerId: string, name: string, platform: Platform) {
  const workspace = await requireWorkspace(ownerId);
  const db = adminDb();
  const { count, error: countError } = await db.from("agents").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).neq("status", "revoked");
  if (countError) throw countError;
  if ((count || 0) >= LIMITS[workspace.plan as "free" | "pro"].agents) throw new AppError("Agent limit reached. Upgrade or revoke an agent.", 402);
  const { data, error } = await db.from("agents").insert({ workspace_id: workspace.id, name, platform }).select("id,name,platform,status").single();
  if (error) throw error;
  if (!workspace.boss_agent_id) await db.from("workspaces").update({ boss_agent_id: data.id }).eq("id", workspace.id);
  return data;
}

export async function createProject(ownerId: string, name: string) {
  const workspace = await requireWorkspace(ownerId);
  const db = adminDb();
  const { count, error: countError } = await db.from("projects").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).is("archived_at", null);
  if (countError) throw countError;
  if ((count || 0) >= LIMITS[workspace.plan as "free" | "pro"].projects) throw new AppError("Project limit reached. Upgrade to add another project.", 402);
  const { data, error } = await db.from("projects").insert({ workspace_id: workspace.id, name }).select().single();
  if (error) throw error;
  return data;
}

export async function setProjectRouting(ownerId: string, projectId: string, agentId: string | null) {
  const workspace = await requireWorkspace(ownerId);
  if (workspace.plan !== "pro") throw new AppError("Project routing is included with Pro", 402);
  if (agentId) {
    const { data: agent } = await adminDb().from("agents").select("id").eq("id", agentId)
      .eq("workspace_id", workspace.id).eq("status", "connected").maybeSingle();
    if (!agent) throw new AppError("Choose a connected agent in this workspace", 400);
  }
  const { data, error } = await adminDb().from("projects").update({ default_agent_id: agentId })
    .eq("id", projectId).eq("workspace_id", workspace.id).is("archived_at", null).select().maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError("Project not found", 404);
  return data;
}

export async function setWorkspacePolicy(ownerId: string, bossAgentId: string | null, delegationLevel: DelegationLevel) {
  const workspace = await requireWorkspace(ownerId);
  if (bossAgentId) {
    const { data } = await adminDb().from("agents").select("id").eq("workspace_id", workspace.id).eq("id", bossAgentId).neq("status", "revoked").maybeSingle();
    if (!data) throw new AppError("Choose an active agent in this workspace");
  }
  const { data, error } = await adminDb().from("workspaces").update({ boss_agent_id: bossAgentId, delegation_level: delegationLevel }).eq("id", workspace.id).select().single();
  if (error) throw error;
  return data;
}

export async function updateBrief(ownerId: string, projectId: string, brief: string, expectedVersion: number) {
  const workspace = await requireWorkspace(ownerId);
  return setBrief(workspace.id, projectId, brief, expectedVersion, `user:${ownerId}`);
}

export async function setBrief(workspaceId: string, projectId: string, brief: string, expectedVersion: number, actorKey: string) {
  if (brief.length > 20000) throw new AppError("Brief is too long");
  const db = adminDb();
  const { data, error } = await db.from("projects").update({ brief, brief_version: expectedVersion + 1 })
    .eq("workspace_id", workspaceId).eq("id", projectId).eq("brief_version", expectedVersion).is("archived_at", null).select().maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError("Brief changed since you opened it. Refresh and try again.", 409);
  await db.from("audit_events").insert({ workspace_id: workspaceId, actor_key: actorKey, action: "project.brief_updated", object_id: projectId });
  return data;
}

export async function setSchedule(ownerId: string, agentId: string, enabled: boolean, cadenceMinutes: number) {
  const workspace = await requireWorkspace(ownerId);
  const { data: agent } = await adminDb().from("agents").select("platform").eq("workspace_id", workspace.id).eq("id", agentId).maybeSingle();
  if (enabled && ["grok", "muse"].includes(agent?.platform || "")) throw new AppError("This platform has no verified unattended inbox check", 400);
  const { data, error } = await adminDb().from("agents").update({ schedule_enabled: enabled, schedule_cadence_minutes: cadenceMinutes })
    .eq("workspace_id", workspace.id).eq("id", agentId).neq("status", "revoked").select("id,schedule_enabled,schedule_cadence_minutes,last_check_at").maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError("Agent not found", 404);
  return data;
}

export async function createPairingCode(ownerId: string, agentId: string) {
  const workspace = await requireWorkspace(ownerId);
  const code = randomBytes(12).toString("base64url");
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const { data, error } = await adminDb().from("agents").update({ pairing_code_hash: hash(code), pairing_expires_at: expires })
    .eq("workspace_id", workspace.id).eq("id", agentId).neq("status", "revoked").select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError("Agent not found", 404);
  return { code, expiresAt: expires };
}

export async function pairOAuthAgent(ownerId: string, clientId: string, code: string) {
  if (!clientId || !code) throw new AppError("Pairing requires an OAuth client and code");
  await rateLimit(`pair:${ownerId}:${clientId}`, 20);
  const db = adminDb();
  const workspace = await requireWorkspace(ownerId);
  const { data: agent, error } = await db.from("agents").select("id,name,status,oauth_client_id")
    .eq("workspace_id", workspace.id).eq("pairing_code_hash", hash(code)).gt("pairing_expires_at", new Date().toISOString()).neq("status", "revoked").maybeSingle();
  if (error) throw error;
  if (!agent) throw new AppError("Pairing code is invalid or expired", 403);
  if (agent.oauth_client_id && agent.oauth_client_id !== clientId) throw new AppError("This agent is already paired. Revoke it before pairing again.", 409);
  const { data, error: updateError } = await db.from("agents").update({ oauth_client_id: clientId, status: "connected", pairing_code_hash: null, pairing_expires_at: null })
    .eq("id", agent.id).eq("workspace_id", workspace.id).eq("pairing_code_hash", hash(code)).select("id,name,platform,status").maybeSingle();
  if (updateError) throw updateError;
  if (!data) throw new AppError("Pairing code was already used", 409);
  await db.from("audit_events").insert({ workspace_id: workspace.id, actor_key: `user:${ownerId}`, action: "agent.paired", object_id: agent.id });
  return data;
}

export async function issueAgentKey(ownerId: string, agentId: string) {
  const workspace = await requireWorkspace(ownerId);
  const raw = `rly_${randomBytes(32).toString("base64url")}`;
  const { data, error } = await adminDb().from("agents").update({ credential_hash: hash(raw), status: "connected" })
    .eq("workspace_id", workspace.id).eq("id", agentId).neq("status", "revoked").select("id,name,platform,status").maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError("Agent not found", 404);
  await adminDb().from("audit_events").insert({ workspace_id: workspace.id, actor_key: `user:${ownerId}`, action: "agent.key_rotated", object_id: agentId });
  return { agent: data, key: raw };
}

export async function revokeAgent(ownerId: string, agentId: string) {
  const workspace = await requireWorkspace(ownerId);
  const db = adminDb();
  if (workspace.boss_agent_id === agentId) await db.from("workspaces").update({ boss_agent_id: null }).eq("id", workspace.id);
  const { data, error } = await db.from("agents").update({ status: "revoked", credential_hash: null, oauth_client_id: null, pairing_code_hash: null, schedule_enabled: false })
    .eq("workspace_id", workspace.id).eq("id", agentId).select("id,status").maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError("Agent not found", 404);
  await db.from("audit_events").insert({ workspace_id: workspace.id, actor_key: `user:${ownerId}`, action: "agent.revoked", object_id: agentId });
  return data;
}

export { hash };
