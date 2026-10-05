import type { Platform } from "@/lib/config";

export const AGENT_HARNESSES = [
  { id: "claude", label: "Claude", platform: "other" },
  { id: "codex", label: "Codex", platform: "codex" },
  { id: "hermes", label: "Hermes", platform: "hermes" },
  { id: "openclaw", label: "OpenClaw", platform: "openclaw" },
  { id: "grok", label: "Grok Bot", platform: "grok" },
  { id: "muse", label: "Muse", platform: "muse" },
  { id: "chatgpt", label: "ChatGPT", platform: "other" },
  { id: "gemini", label: "Gemini", platform: "other" },
  { id: "other", label: "Other / custom", platform: "other" },
] as const satisfies readonly { id: string; label: string; platform: Platform }[];

export type AgentHarnessId = typeof AGENT_HARNESSES[number]["id"];

const HARNESS_ALIASES: Record<string, AgentHarnessId> = {
  "claude code": "claude",
  "claude cowork": "claude",
  "claude desktop": "claude",
  "claude web": "claude",
  "gemini cli": "gemini",
  "grok web": "grok",
};

export function resolveAgentHarnessId(harnessName: string | null | undefined, platform: Platform): AgentHarnessId {
  const normalized = harnessName?.trim().toLowerCase().replace(/\s+/g, " ") || "";
  const alias = HARNESS_ALIASES[normalized];
  if (alias) return alias;

  const namedHarness = AGENT_HARNESSES.find((harness) =>
    harness.id === normalized || harness.label.toLowerCase() === normalized,
  );
  if (namedHarness) return namedHarness.id;

  return platform === "other" ? "other" : platform;
}

export function isGrokBotHarness(harnessName: string | null | undefined) {
  return harnessName?.trim().toLowerCase() === "grok bot";
}

export function harnessHasDocumentedScheduler(harnessName: string | null | undefined, platform: Platform) {
  if (["codex", "hermes", "openclaw"].includes(platform)) return true;
  const harness = resolveAgentHarnessId(harnessName, platform);
  if (["claude", "chatgpt"].includes(harness)) return true;
  return platform === "grok" && isGrokBotHarness(harnessName);
}

export function harnessSupports90MinuteCadence(harnessName: string | null | undefined, platform: Platform) {
  return ["codex", "hermes", "openclaw", "chatgpt"].includes(resolveAgentHarnessId(harnessName, platform));
}

export function agentScheduleSetupLabel(harnessName: string | null | undefined, platform: Platform) {
  if (platform === "grok" && !isGrokBotHarness(harnessName)) return "Grok web interactively unless this account visibly offers a native schedule";
  switch (resolveAgentHarnessId(harnessName, platform)) {
    case "codex": return "a Codex automation, if this surface supports one";
    case "hermes": return "a Hermes cron job";
    case "openclaw": return "an OpenClaw recurring automation";
    case "claude": return "Claude Cowork Scheduled tasks or a Claude Code Routine, if available";
    case "chatgpt": return "a ChatGPT Scheduled task only if Stoic is available in its tools";
    case "grok": return "a Grok Bot routine in this account";
    case "muse": return "Muse's own recurring browser task, if this account visibly offers one";
    default: return "a native schedule only if this harness visibly supports one";
  }
}

export function resolveAgentHarness(id: AgentHarnessId, customName?: string) {
  const choice = AGENT_HARNESSES.find((harness) => harness.id === id);
  if (!choice) throw new Error("Choose a supported harness option");
  return {
    platform: choice.platform,
    harnessName: id === "other" ? customName?.trim() || choice.label : choice.label,
  };
}

export function agentHarnessLabel(agent: { harness_name?: string | null; platform: Platform }) {
  return agent.harness_name?.trim() || ({
    codex: "Codex",
    hermes: "Hermes",
    openclaw: "OpenClaw",
    grok: "Grok web",
    muse: "Muse",
    other: "Another MCP client",
  } satisfies Record<Platform, string>)[agent.platform];
}
