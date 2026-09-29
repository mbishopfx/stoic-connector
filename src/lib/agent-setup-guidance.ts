import type { Platform } from "@/lib/config";

export function hermesInstallPrompt(endpoint: string) {
  const keyReference = "${STOIC_AGENT_KEY}";
  return `Help me connect this Hermes installation to Stoic as a remote MCP server.

Stoic MCP endpoint: ${endpoint}
MCP server name: stoic_connector

Use the Hermes profile and host that will run this agent. First inspect its existing MCP configuration and preserve every existing entry. Do not overwrite the whole config, remove another server, or replace an existing stoic_connector entry. If that name is already configured, stop and tell me what is there before changing it.

Authentication must use a dedicated, revocable Stoic key for this Hermes profile. Never ask me to paste the key into this chat, a command, shell history, logs, or your final response. Do not put the key itself in config.yaml. Store it as STOIC_AGENT_KEY in this profile's private secret environment file (the default profile uses ~/.hermes/.env; use the equivalent private secret store for a named or remote profile), then configure the Authorization header as Bearer ${keyReference}. If I have not generated a key or you cannot store it securely, pause and tell me to generate it from Stoic → Agents → Hermes and add it to that private secret file manually. Do not continue with a placeholder or another agent's key. Replacing a key can revoke the previous Hermes connection, so do not replace one without asking first.

Merge this exact entry into the existing mcp_servers map, keeping all other settings unchanged:

mcp_servers:
  stoic_connector:
    url: "${endpoint}"
    headers:
      Authorization: "Bearer ${keyReference}"

Use Hermes' documented remote HTTP MCP config format. Do not use OAuth; the Stoic OAuth client must be registered separately.

After the entry is saved, reload MCP or restart Hermes as needed, run hermes mcp test stoic_connector, and confirm that the Stoic tools are discovered. If the test succeeds, call get_team_context and check_inbox once to verify this installation. Do not create, claim, update, or approve handoffs, post project messages, or create a schedule during this setup. Report the connection and inbox-check result without exposing any credential. If you cannot make a change safely or verify it, stop and explain the remaining manual step. A config edit alone is not proof of a working connection.`;
}

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
