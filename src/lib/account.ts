import { createHash, randomBytes } from "node:crypto";
import { AppError, adminDb } from "@/lib/supabase";
import { type DelegationLevel, type Platform } from "@/lib/config";
import { redactSensitiveText } from "@/lib/model-input";
import { isGrokBotHarness } from "@/lib/agent-harness";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const ACTIVITY_CHART_DAYS = 30;

type WorkspaceActivityRollup = {
  window_start: string;
  window_end: string;
  mcp_tool_calls: number | string;
  mcp_tool_errors: number | string;
  mcp_agent_tool_calls: number | string;
  mcp_tool_counts: Record<string, { calls: number; errors: number }>;
  task_events: number | string;
  agent_task_events: number | string;
  board_messages: number | string;
  agent_board_messages: number | string;
  agent_to_agent_replies: number | string;
  audit_actions: number | string;
  active_agents: number | string;
  analysis_status: "pending" | "running" | "complete" | "failed";
  analysis_summary: string | null;
  analysis_observations: string[];
};

function activityCount(value: number | string) {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

function activityMetrics(row: WorkspaceActivityRollup) {
  return {
    mcpToolCalls: activityCount(row.mcp_tool_calls),
    mcpToolErrors: activityCount(row.mcp_tool_errors),
    agentMcpToolCalls: activityCount(row.mcp_agent_tool_calls),
    mcpToolCounts: row.mcp_tool_counts || {},
    taskEvents: activityCount(row.task_events),
    agentTaskEvents: activityCount(row.agent_task_events),
    boardMessages: activityCount(row.board_messages),
    agentBoardMessages: activityCount(row.agent_board_messages),
    agentToAgentReplies: activityCount(row.agent_to_agent_replies),
    auditActions: activityCount(row.audit_actions),
    activeAgents: activityCount(row.active_agents),
  };
}

async function loadWorkspaceActivityAnalytics(workspace: { id: string; mcp_activity_capture_started_at?: string | null }, now = new Date()) {
  const currentUtcDayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const latestClosedWindowEnd = Math.floor(now.getTime() / SIX_HOURS_MS) * SIX_HOURS_MS;
  const chartStart = new Date(currentUtcDayStart - (ACTIVITY_CHART_DAYS - 1) * 24 * 60 * 60 * 1000);
  const { data, error } = await adminDb().from("workspace_activity_rollups")
    .select("window_start,window_end,mcp_tool_calls,mcp_tool_errors,mcp_agent_tool_calls,mcp_tool_counts,task_events,agent_task_events,board_messages,agent_board_messages,agent_to_agent_replies,audit_actions,active_agents,analysis_status,analysis_summary,analysis_observations")
    .eq("workspace_id", workspace.id)
    .gte("window_start", chartStart.toISOString())
    .lt("window_start", new Date(latestClosedWindowEnd).toISOString())
    .order("window_start", { ascending: true })
    .limit(ACTIVITY_CHART_DAYS * 4 + 4);

  if (error) {
    if (["42P01", "PGRST205"].includes(error.code)
      || (["42703", "PGRST204"].includes(error.code) && error.message.includes("agent_to_agent_replies"))) {
      return { available: false as const, captureStartedAt: null, latestWindow: null, daily: [] };
    }
    throw error;
  }

  const rollups = (data || []) as WorkspaceActivityRollup[];
  const byWindowStart = new Map(rollups.map((row) => [Date.parse(row.window_start), row]));
  const latestWindowStart = latestClosedWindowEnd - SIX_HOURS_MS;
  const latestRow = byWindowStart.get(latestWindowStart);
  const captureStartedAt = workspace.mcp_activity_capture_started_at || null;
  const captureStartMs = captureStartedAt ? Date.parse(captureStartedAt) : null;
  const daily = Array.from({ length: ACTIVITY_CHART_DAYS }, (_, index) => {
    const dayStart = chartStart.getTime() + index * 24 * 60 * 60 * 1000;
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    const expectedWindowStarts: number[] = [];
    if (captureStartMs !== null && Number.isFinite(captureStartMs)) {
      for (let windowStart = dayStart; windowStart + SIX_HOURS_MS <= Math.min(dayEnd, latestClosedWindowEnd); windowStart += SIX_HOURS_MS) {
        if (windowStart >= Math.floor(captureStartMs / SIX_HOURS_MS) * SIX_HOURS_MS) expectedWindowStarts.push(windowStart);
      }
    }
    const recordedWindowStarts = expectedWindowStarts.filter((windowStart) => byWindowStart.has(windowStart));
    const complete = captureStartMs !== null
      && captureStartMs <= dayStart
      && dayEnd <= latestClosedWindowEnd
      && expectedWindowStarts.length === 4
      && recordedWindowStarts.length === expectedWindowStarts.length;
    const rows = recordedWindowStarts.map((windowStart) => byWindowStart.get(windowStart)).filter((row): row is WorkspaceActivityRollup => Boolean(row));
    const totals = rows.reduce((sum, row) => {
      const metrics = activityMetrics(row);
      sum.mcpToolCalls += metrics.mcpToolCalls;
      sum.agentTaskEvents += metrics.agentTaskEvents;
      sum.agentBoardMessages += metrics.agentBoardMessages;
      sum.agentToAgentReplies += metrics.agentToAgentReplies;
      sum.auditActions += metrics.auditActions;
      return sum;
    }, { mcpToolCalls: 0, agentTaskEvents: 0, agentBoardMessages: 0, agentToAgentReplies: 0, auditActions: 0 });
    return {
      date: new Date(dayStart).toISOString().slice(0, 10),
      recordedWindows: recordedWindowStarts.length,
      expectedWindows: expectedWindowStarts.length,
      complete,
      mcpToolCalls: complete ? totals.mcpToolCalls : null,
      agentTaskEvents: complete ? totals.agentTaskEvents : null,
      agentBoardMessages: complete ? totals.agentBoardMessages : null,
      agentToAgentReplies: complete ? totals.agentToAgentReplies : null,
      auditActions: complete ? totals.auditActions : null,
    };
  });

  return {
    available: true as const,
    captureStartedAt,
    latestWindow: {
      windowStart: new Date(latestWindowStart).toISOString(),
      windowEnd: new Date(latestClosedWindowEnd).toISOString(),
      metrics: latestRow ? activityMetrics(latestRow) : null,
      analysisStatus: latestRow?.analysis_status || "pending",
      analysisSummary: latestRow?.analysis_summary || null,
      analysisObservations: latestRow?.analysis_observations || [],
    },
    daily,
  };
}

export async function teamActivityAnalytics(workspaceId: string) {
  const { data: workspace, error } = await adminDb().from("workspaces").select("*").eq("id", workspaceId).maybeSingle();
  if (error) throw error;
  if (!workspace) throw new AppError("Workspace not found", 404);
  return loadWorkspaceActivityAnalytics(workspace);
}

export async function workspaceForOwner(ownerId: string) {
  const { data, error } = await adminDb().from("workspaces").select("*").eq("owner_id", ownerId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function ensureWorkspaceForOwner(ownerId: string, name = "My Workspace") {
  const { error } = await adminDb().rpc("stoic_provision_workspace", { p_owner_id: ownerId, p_name: name });
  if (error) throw error;
  const workspace = await workspaceForOwner(ownerId);
  if (!workspace) throw new AppError("Workspace setup did not complete", 500);
  return workspace;
}

export async function requireWorkspace(ownerId: string) {
  const workspace = await workspaceForOwner(ownerId);
  if (!workspace) throw new AppError("Create a workspace first", 404);
  return workspace;
}

export async function requireActiveWorkspace(ownerId: string) {
  return requireWorkspace(ownerId);
}

export async function dashboardState(ownerId: string) {
  const workspace = await ensureWorkspaceForOwner(ownerId);
  const db = adminDb();
  const [agents, projects, handoffs, approvals, artifacts, events, board, activity, ideas, activityAnalytics] = await Promise.all([
    db.from("agents").select("id,name,platform,harness_name,status,oauth_client_id,access_notes,schedule_enabled,schedule_cadence_minutes,last_check_at,created_at").eq("workspace_id", workspace.id).order("created_at"),
    db.from("projects").select("*").eq("workspace_id", workspace.id).is("archived_at", null).order("created_at"),
    db.from("handoffs").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(100),
    db.from("approvals").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(50),
    db.from("artifacts").select("id,project_id,handoff_id,name,mime_type,size_bytes,status,created_at").eq("workspace_id", workspace.id).eq("status", "ready").order("created_at", { ascending: false }).limit(100),
    db.from("task_events").select("id,handoff_id,actor_key,event_type,body,created_at").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(150),
    db.from("board_messages").select("id,project_id,parent_id,author_key,kind,body,created_at").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(200),
    db.from("audit_events").select("id,actor_key,details,created_at").eq("workspace_id", workspace.id).eq("action", "inbox.checked").order("created_at", { ascending: false }).limit(100),
    db.from("ideas").select("id,workspace_id,project_id,run_id,title,summary,why_now,next_step,evidence_ids,status,accepted_handoff_id,accepted_at,archived_at,created_at,updated_at").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(200),
    loadWorkspaceActivityAnalytics(workspace),
  ]);
  for (const result of [agents, projects, handoffs, approvals, artifacts, events, board, activity, ideas]) if (result.error) throw result.error;
  const groupChatRootIds = [...new Set(((projects.data || []) as Array<{ group_chat_root_id?: string | null }>)
    .map((project) => project.group_chat_root_id)
    .filter((id): id is string => Boolean(id)))];
  let boardMessages = board.data || [];
  if (groupChatRootIds.length) {
    const { data: roots, error: rootsError } = await db.from("board_messages")
      .select("id,project_id,parent_id,author_key,kind,body,created_at")
      .eq("workspace_id", workspace.id).in("id", groupChatRootIds);
    if (rootsError) throw rootsError;
    boardMessages = [...new Map([...boardMessages, ...(roots || [])].map((message) => [message.id, message])).values()];
  }
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
    board: boardMessages,
    activity: activity.data || [],
    ideas: ideas.data || [],
    activityAnalytics,
    usage: { handoffs: Number(usage.handoffs), storageBytes: Number(usage.storageBytes) },
  };
}

export async function createWorkspace(ownerId: string, name: string) {
  return ensureWorkspaceForOwner(ownerId, name);
}

export async function addAgent(ownerId: string, name: string, platform: Platform, harnessName: string) {
  const workspace = await requireActiveWorkspace(ownerId);
  const db = adminDb();
  const { data, error } = await db.from("agents").insert({ workspace_id: workspace.id, name, platform, harness_name: harnessName }).select("id,name,platform,harness_name,status").single();
  if (error) throw error;
  return data;
}

export async function createProject(ownerId: string, name: string) {
  const workspace = await requireActiveWorkspace(ownerId);
  const db = adminDb();
  const { data, error } = await db.from("projects").insert({ workspace_id: workspace.id, name }).select().single();
  if (error) throw error;
  return data;
}

export async function setProjectRouting(ownerId: string, projectId: string, agentId: string | null) {
  const workspace = await requireActiveWorkspace(ownerId);
  if (agentId) {
    if (agentId === workspace.boss_agent_id) throw new AppError("Choose a worker other than the designated boss", 400);
    const { data: agent } = await adminDb().from("agents").select("id,platform").eq("id", agentId)
      .eq("workspace_id", workspace.id).eq("status", "connected").maybeSingle();
    if (!agent) throw new AppError("Choose a connected agent in this workspace", 400);
    if (agent.platform === "muse") throw new AppError("Muse's browser relay cannot receive MCP handoffs", 400);
  }
  const { data, error } = await adminDb().from("projects").update({ default_agent_id: agentId })
    .eq("id", projectId).eq("workspace_id", workspace.id).is("archived_at", null).select().maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError("Project not found", 404);
  return data;
}

export async function setWorkspacePolicy(
  ownerId: string,
  bossAgentId: string | null,
  delegationLevel: DelegationLevel,
  reassignmentAgentId: string | null = null,
) {
  const workspace = await requireActiveWorkspace(ownerId);
  if (bossAgentId) {
    const { data: boss, error: bossError } = await adminDb().from("agents").select("platform,status")
      .eq("workspace_id", workspace.id).eq("id", bossAgentId).maybeSingle();
    if (bossError) throw bossError;
    if (!boss || boss.status !== "connected") throw new AppError("Choose a connected MCP agent as the team lead", 400);
    if (boss.platform === "muse") throw new AppError("Muse's browser relay cannot lead MCP handoffs", 400);
  }
  if (reassignmentAgentId) {
    if (reassignmentAgentId === bossAgentId) throw new AppError("Choose a worker other than the new team lead to receive open handoffs", 400);
    const { data: replacement, error: replacementError } = await adminDb().from("agents").select("platform,status")
      .eq("workspace_id", workspace.id).eq("id", reassignmentAgentId).maybeSingle();
    if (replacementError) throw replacementError;
    if (!replacement || replacement.status !== "connected" || replacement.platform === "muse") {
      throw new AppError("Choose a connected MCP worker to receive open handoffs", 400);
    }
  }
  const { data, error } = await adminDb().rpc("stoic_set_workspace_policy", {
    p_workspace_id: workspace.id,
    p_owner_id: ownerId,
    p_boss_agent_id: bossAgentId,
    p_delegation_level: delegationLevel,
    p_reassignment_agent_id: reassignmentAgentId,
  });
  if (error?.message.includes("boss_has_active_handoffs")) throw new AppError("This agent has open handoffs. Choose a connected worker to receive them as part of the leadership change.", 409);
  if (error?.message.includes("boss_agent_not_found")) throw new AppError("Choose an active agent in this workspace", 400);
  if (error?.message.includes("reassignment_agent_not_found")) throw new AppError("Choose a connected MCP worker to receive open handoffs", 400);
  if (error?.message.includes("invalid_reassignment_agent")) throw new AppError("Choose a worker other than the new team lead to receive open handoffs", 400);
  if (error) throw error;
  return data;
}

export async function updateBrief(ownerId: string, projectId: string, brief: string, expectedVersion: number) {
  const workspace = await requireActiveWorkspace(ownerId);
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
  const workspace = enabled ? await requireActiveWorkspace(ownerId) : await requireWorkspace(ownerId);
  const { data: agent } = await adminDb().from("agents").select("platform,harness_name").eq("workspace_id", workspace.id).eq("id", agentId).maybeSingle();
  const grokBot = agent?.platform === "grok" && isGrokBotHarness(agent.harness_name);
  if (enabled && (agent?.platform === "muse" || (agent?.platform === "grok" && !grokBot))) throw new AppError("This harness has no documented unattended Stoic inbox path", 400);
  const { data, error } = await adminDb().from("agents").update({ schedule_enabled: enabled, schedule_cadence_minutes: cadenceMinutes })
    .eq("workspace_id", workspace.id).eq("id", agentId).neq("status", "revoked").select("id,schedule_enabled,schedule_cadence_minutes,last_check_at").maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError("Agent not found", 404);
  return data;
}

export async function setAgentAccessNotes(ownerId: string, agentId: string, raw: string) {
  const workspace = await requireActiveWorkspace(ownerId);
  const notes = raw.trim();
  if (notes.length > 2000) throw new AppError("Keep access notes under 2,000 characters", 400);
  if (redactSensitiveText(notes) !== notes) throw new AppError("Remove credentials and secrets from access notes", 400);
  const db = adminDb();
  const { data, error } = await db.from("agents").update({ access_notes: notes })
    .eq("workspace_id", workspace.id).eq("id", agentId).neq("status", "revoked")
    .select("id,access_notes").maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError("Agent not found", 404);
  await db.from("audit_events").insert({ workspace_id: workspace.id, actor_key: `user:${ownerId}`, action: "agent.access_notes_updated", object_id: agentId });
  return data;
}

export async function createPairingCode(ownerId: string, agentId: string) {
  const workspace = await requireActiveWorkspace(ownerId);
  const { data: agent, error: agentError } = await adminDb().from("agents").select("platform")
    .eq("workspace_id", workspace.id).eq("id", agentId).neq("status", "revoked").maybeSingle();
  if (agentError) throw agentError;
  if (agent?.platform === "muse") throw new AppError("Muse uses its browser credential store, not Stoic MCP pairing", 400);
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
  const db = adminDb();
  const workspace = await requireActiveWorkspace(ownerId);
  const { data: agent, error } = await db.from("agents").select("id,name,status,oauth_client_id,platform")
    .eq("workspace_id", workspace.id).eq("pairing_code_hash", hash(code)).gt("pairing_expires_at", new Date().toISOString()).neq("status", "revoked").maybeSingle();
  if (error) throw error;
  if (!agent) throw new AppError("Pairing code is invalid or expired", 403);
  if (agent.platform === "muse") throw new AppError("Muse uses its browser credential store, not Stoic MCP pairing", 400);
  if (agent.oauth_client_id && agent.oauth_client_id !== clientId) throw new AppError("This agent is already paired. Revoke it before pairing again.", 409);
  const { data, error: updateError } = await db.from("agents").update({ oauth_client_id: clientId, credential_hash: null, status: "connected", pairing_code_hash: null, pairing_expires_at: null, last_check_at: null })
    .eq("id", agent.id).eq("workspace_id", workspace.id).eq("pairing_code_hash", hash(code)).select("id,name,platform,status").maybeSingle();
  if (updateError) throw updateError;
  if (!data) throw new AppError("Pairing code was already used", 409);
  await db.from("audit_events").insert({ workspace_id: workspace.id, actor_key: `user:${ownerId}`, action: "agent.paired", object_id: agent.id });
  return data;
}

export async function issueAgentKey(ownerId: string, agentId: string) {
  const workspace = await requireActiveWorkspace(ownerId);
  const { data: agent, error: agentError } = await adminDb().from("agents").select("platform")
    .eq("workspace_id", workspace.id).eq("id", agentId).neq("status", "revoked").maybeSingle();
  if (agentError) throw agentError;
  if (agent?.platform === "muse") throw new AppError("Muse uses its browser credential store, not a Stoic MCP key", 400);
  const raw = `stoic_${randomBytes(32).toString("base64url")}`;
  const { data, error } = await adminDb().from("agents").update({ credential_hash: hash(raw), oauth_client_id: null, pairing_code_hash: null, pairing_expires_at: null, status: "connected", last_check_at: null })
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
