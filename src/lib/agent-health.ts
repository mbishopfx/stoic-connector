import type { Platform } from "@/lib/config";
import { isGrokBotHarness } from "@/lib/agent-harness";

export type AgentHealthTone = "good" | "warning" | "neutral" | "muted";

export type AgentCheckStatus = {
  status: string;
  schedule_enabled: boolean;
  schedule_cadence_minutes: number;
  last_check_at: string | null;
};

export type AgentConnectionRecord = AgentCheckStatus & {
  platform: Platform;
  harness_name?: string | null;
  oauth_client_id: string | null;
  access_notes?: string | null;
};

export type AgentHealth = { label: string; tone: AgentHealthTone };

export const FIRST_INBOX_CHECK_PROMPT = "Using the Stoic MCP connection in this agent, call get_team_context, then check_inbox once. Do not create, claim, update, or approve any work. Report whether both calls succeeded; do not include credentials in your reply.";

export function agentHealth(agent: AgentCheckStatus, now = Date.now()): AgentHealth {
  if (agent.status === "revoked") return { label: "Revoked", tone: "muted" };
  if (agent.status !== "connected") return { label: "Needs pairing", tone: "warning" };
  if (!agent.last_check_at) return { label: "Awaiting first check", tone: "warning" };
  if (!agent.schedule_enabled) return { label: "On demand", tone: "neutral" };
  const age = (now - new Date(agent.last_check_at).getTime()) / 60000;
  return age <= agent.schedule_cadence_minutes * 2 + 15 ? { label: "Checking in", tone: "good" } : { label: "Check overdue", tone: "warning" };
}

type HostPosture = "pilot_guided" | "interactive_only" | "preview" | "generic";

type AgentConnectionSummary = {
  auth: { label: string; evidence: "server_record" | "missing"; tone: AgentHealthTone };
  transport: { label: "Streamable HTTP MCP"; evidence: "product_config" };
  host: { label: string; posture: HostPosture; note: string };
  schedule: { label: string; evidence: "owner_declared" | "server_record"; tone: AgentHealthTone };
  proof: { label: string; evidence: "server_check" | "none"; tone: AgentHealthTone; detail: string };
  access: { label: string; evidence: "owner_declared" | "missing"; tone: AgentHealthTone };
};

const hostPosture: Record<Platform, { posture: HostPosture; label: string; note: string }> = {
  codex: { posture: "pilot_guided", label: "Codex · guided pilot path", note: "Host setup is documented; a real inbox check still proves this installation." },
  hermes: { posture: "pilot_guided", label: "Hermes · guided pilot path", note: "Host setup is documented; a real inbox check still proves this installation." },
  openclaw: { posture: "pilot_guided", label: "OpenClaw · guided pilot path", note: "Host setup is documented; a real inbox check still proves this installation." },
  grok: { posture: "interactive_only", label: "Grok web · interactive only", note: "No unattended inbox path is recorded for this harness." },
  muse: { posture: "preview", label: "Consumer Muse · browser relay", note: "A supervised browser relay is configured; per-account schedule behavior still needs verification." },
  other: { posture: "generic", label: "Another MCP client · generic", note: "Use the client's documented remote MCP support and verify a real check." },
};

export function agentConnectionSummary(agent: AgentConnectionRecord, now = Date.now()): AgentConnectionSummary {
  const health = agentHealth(agent, now);
  const host = agent.platform === "grok" && isGrokBotHarness(agent.harness_name)
    ? { posture: "pilot_guided" as const, label: "Grok Bot · guided pilot path", note: "Remote HTTPS MCP and personal routines are documented; verify this account with a real Stoic inbox check." }
    : hostPosture[agent.platform];
  const auth = agent.status === "revoked"
    ? { label: "Revoked", evidence: "server_record" as const, tone: "muted" as const }
    : agent.status !== "connected"
      ? { label: "Not paired", evidence: "missing" as const, tone: "warning" as const }
      : agent.oauth_client_id
        ? { label: "OAuth paired", evidence: "server_record" as const, tone: "good" as const }
        : { label: "Stoic key paired", evidence: "server_record" as const, tone: "good" as const };
  const schedule = agent.status === "revoked"
    ? { label: "Disabled after revocation", evidence: "server_record" as const, tone: "muted" as const }
    : agent.schedule_enabled
      ? { label: "Enabled · owner-declared", evidence: "owner_declared" as const, tone: "neutral" as const }
      : { label: "On demand · owner-declared", evidence: "owner_declared" as const, tone: "neutral" as const };
  const proof = agent.last_check_at && agent.status === "connected"
    ? {
      label: health.label === "Check overdue" ? "Last check received · overdue now" : "Verified by server inbox check",
      evidence: "server_check" as const,
      tone: health.label === "Check overdue" ? "warning" as const : "good" as const,
      detail: "This is evidence that the paired installation reached Stoic; it does not prove the host schedule is still enabled.",
    }
    : {
      label: health.label,
      evidence: "none" as const,
      tone: health.tone,
      detail: "Ask this installation to call check_inbox once. Stoic cannot wake an offline host.",
    };
  const hasAccessNotes = Boolean(agent.access_notes?.trim());
  return {
    auth,
    transport: { label: "Streamable HTTP MCP", evidence: "product_config" },
    host,
    schedule,
    proof,
    access: hasAccessNotes
      ? { label: "Owner notes provided", evidence: "owner_declared", tone: "neutral" }
      : { label: "No owner notes yet", evidence: "missing", tone: "warning" },
  };
}
