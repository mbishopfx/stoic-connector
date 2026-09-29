export function canReadHandoff(
  agent: { agentId: string; isBoss: boolean },
  handoff: { assigned_agent_id: string | null; status: string },
  isEligibleCandidate = false,
) {
  return agent.isBoss
    || (handoff.assigned_agent_id === agent.agentId && handoff.status !== "proposed")
    || (isEligibleCandidate && handoff.assigned_agent_id === null && handoff.status !== "proposed");
}

export function canCompleteArtifact(agent: { agentId: string; isBoss: boolean }, artifact: { uploaded_by_agent_id: string | null }) {
  return agent.isBoss || artifact.uploaded_by_agent_id === agent.agentId;
}
