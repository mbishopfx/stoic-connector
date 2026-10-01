export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function appOrigin(): string {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configuredOrigin && configuredOrigin !== '""' && configuredOrigin !== "''") {
    return publicOrigin(configuredOrigin);
  }

  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.VERCEL_URL?.trim();
  if (vercelUrl) return publicOrigin(vercelUrl);

  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_APP_URL must be configured for production");
  }
  return "http://localhost:3000";
}

function publicOrigin(value: string): string {
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(candidate);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("App URL must use HTTP or HTTPS");
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new Error("App URL must use HTTPS in production");
  return url.origin;
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
