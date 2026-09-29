import { adminDb } from "@/lib/supabase";
import type { AgentIdentity } from "@/lib/identity";
import { canReadHandoff } from "@/lib/handoff-policy";

type HandoffAccess = { id?: string; assigned_agent_id: string | null; status: string };

export async function canReadScopedHandoff(agent: AgentIdentity, handoff: HandoffAccess) {
  if (canReadHandoff(agent, handoff)) return true;
  if (agent.isBoss || handoff.assigned_agent_id !== null || handoff.status === "proposed" || !handoff.id) return false;

  const { data, error } = await adminDb().from("handoff_eligible_agents").select("handoff_id")
    .eq("workspace_id", agent.workspaceId).eq("handoff_id", handoff.id).eq("agent_id", agent.agentId).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
