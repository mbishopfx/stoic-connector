import type { AgentIdentity } from "@/lib/identity";
import { canReadHandoff } from "@/lib/handoff-policy";

type HandoffAccess = { id?: string; assigned_agent_id: string | null; status: string };

export async function canReadScopedHandoff(agent: AgentIdentity, handoff: HandoffAccess) {
  return canReadHandoff(agent, handoff);
}
