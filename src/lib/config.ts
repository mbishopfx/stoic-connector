export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function appOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export function mcpResourceUri(): string {
  return new URL("/api/mcp", appOrigin()).toString();
}

export function supabaseIssuer(): string {
  return new URL("/auth/v1", requiredEnv("NEXT_PUBLIC_SUPABASE_URL")).toString().replace(/\/$/, "");
}

export type Plan = "free" | "pro";
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
