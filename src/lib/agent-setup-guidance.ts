import type { Platform } from "@/lib/config";

export type AgentSetupStep = {
  id: "connection" | "inbox_check" | "schedule" | "handoff";
  label: string;
  detail: string;
  complete: boolean;
};

type AgentSetupInput = {
  agent: {
    id: string;
    platform: Platform;
    status: string;
    last_check_at: string | null;
    schedule_enabled: boolean;
  };
  bossAgentId: string | null;
  handoffs: {
    assigned_agent_id: string | null;
    created_by_agent_id: string | null;
    status: string;
  }[];
};

const NATIVE_SCHEDULE_PLATFORMS = new Set<Platform>(["codex", "hermes", "openclaw"]);

export function getAgentSetupGuidance({ agent, bossAgentId, handoffs }: AgentSetupInput) {
  const connected = agent.status === "connected";
  const isBoss = agent.id === bossAgentId;
  const completedHandoff = handoffs.some((handoff) =>
    handoff.status === "accepted"
    && (isBoss ? handoff.created_by_agent_id === agent.id : handoff.assigned_agent_id === agent.id),
  );
  const isMusePreview = agent.platform === "muse";

  const steps: AgentSetupStep[] = [
    {
      id: "connection",
      label: "Connect this installation",
      complete: connected,
      detail: connected
        ? "A Stoic identity is paired. The first server inbox check confirms that this installation can reach Stoic."
        : isMusePreview
          ? "Consumer Muse connector access is still in preview. This profile cannot be paired yet."
          : "Create a separate Stoic credential for this profile, then add the MCP server to this agent installation.",
    },
    {
      id: "inbox_check",
      label: "Verify its first inbox check",
      complete: connected && Boolean(agent.last_check_at),
      detail: agent.last_check_at
        ? "Stoic received a successful check from this installation."
        : "Ask this installation to call get_team_context and check_inbox once. Stoic marks this complete only after the server receives the call.",
    },
    ...(NATIVE_SCHEDULE_PLATFORMS.has(agent.platform) ? [{
      id: "schedule" as const,
      label: "Set its native schedule",
      complete: agent.schedule_enabled,
      detail: agent.schedule_enabled
        ? "You marked the schedule as configured. This is your declaration; successful inbox checks are the evidence that it ran."
        : "After the first check, add a recurring inbox prompt in this agent’s own scheduler. Choose a cadence that fits your provider costs.",
    }] : []),
    {
      id: "handoff",
      label: "Complete and accept a handoff",
      complete: completedHandoff,
      detail: completedHandoff
        ? "An accepted handoff has completed this agent’s first team workflow."
        : isBoss
          ? "Use Stoic chat to draft a small assignment, then review the worker’s returned result."
          : "Create a small assignment for this agent, let it claim and return the result, then accept the work.",
    },
  ];

  return {
    steps,
    completedSteps: steps.filter((step) => step.complete).length,
    nextStep: steps.find((step) => !step.complete) || null,
  };
}
