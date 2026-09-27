export type AgentCheckStatus = {
  status: string;
  schedule_enabled: boolean;
  schedule_cadence_minutes: number;
  last_check_at: string | null;
};

export function agentHealth(agent: AgentCheckStatus, now = Date.now()) {
  if (agent.status === "revoked") return { label: "Revoked", tone: "muted" };
  if (agent.status !== "connected") return { label: "Needs pairing", tone: "warning" };
  if (!agent.schedule_enabled) return { label: "On demand", tone: "neutral" };
  if (!agent.last_check_at) return { label: "Awaiting first check", tone: "warning" };
  const age = (now - new Date(agent.last_check_at).getTime()) / 60000;
  return age <= agent.schedule_cadence_minutes * 2 + 15 ? { label: "Checking in", tone: "good" } : { label: "Check overdue", tone: "warning" };
}
