export function canReadHandoff(
  agent: { agentId: string; isBoss: boolean },
  handoff: { assigned_agent_id: string | null; status: string },
) {
  // The authenticated MCP connection and workspace-scoped query establish read access.
  // Routing and claim state govern execution, not visibility to teammates.
  return Boolean(agent.agentId && handoff.status);
}

export function canCompleteArtifact(agent: { agentId: string; isBoss: boolean }, artifact: { uploaded_by_agent_id: string | null }) {
  return agent.isBoss || artifact.uploaded_by_agent_id === agent.agentId;
}
