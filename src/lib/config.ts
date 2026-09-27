export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function appOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export const LIMITS = {
  free: { agents: 5, projects: 1, handoffs: 50, bytes: 100 * 1024 * 1024, historyDays: 30 },
  pro: { agents: 20, projects: 10, handoffs: 1000, bytes: 2 * 1024 * 1024 * 1024, historyDays: 365 },
} as const;

export type Plan = keyof typeof LIMITS;
export type DelegationLevel = "observe" | "propose" | "delegate";
export type Platform = "codex" | "hermes" | "openclaw" | "grok" | "muse" | "other";

export const PLATFORM_LABELS: Record<Platform, string> = {
  codex: "Codex",
  hermes: "Hermes",
  openclaw: "OpenClaw",
  grok: "Grok web",
  muse: "Consumer Muse",
  other: "Another MCP client",
};
