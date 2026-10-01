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
