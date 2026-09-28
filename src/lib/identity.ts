import { AppError, adminDb, authClient } from "@/lib/supabase";
import { hash, workspaceForOwner } from "@/lib/account";

export interface AgentIdentity {
  agentId: string;
  workspaceId: string;
  ownerId: string;
  isBoss: boolean;
}

export interface VerifiedToken {
  token: string;
  clientId: string;
  scopes: string[];
  expiresAt?: number;
}

export async function verifyAgentToken(token?: string): Promise<VerifiedToken | undefined> {
  if (!token) return undefined;
  const db = adminDb();
  if (token.startsWith("stoic_")) {
    const { data: agent } = await db.from("agents").select("id,workspace_id,status").eq("credential_hash", hash(token)).maybeSingle();
    if (!agent || agent.status !== "connected") return undefined;
    return { token, clientId: agent.id, scopes: ["relay"] };
  }
  const { data, error } = await authClient().auth.getClaims(token);
  const ownerId = data?.claims?.sub;
  const oauthClientId = data?.claims?.client_id;
  if (error || typeof ownerId !== "string" || typeof oauthClientId !== "string") return undefined;
  const workspace = await workspaceForOwner(ownerId);
  if (!workspace) return undefined;
  const { data: agent } = await db.from("agents").select("id,status").eq("workspace_id", workspace.id).eq("oauth_client_id", oauthClientId).maybeSingle();
  return {
    token,
    clientId: agent?.status === "connected" ? agent.id : oauthClientId,
    scopes: agent?.status === "connected" ? ["relay"] : ["pair"],
    expiresAt: typeof data?.claims?.exp === "number" ? data.claims.exp : undefined,
  };
}

export async function identityFromVerified(auth: VerifiedToken | undefined): Promise<AgentIdentity> {
  if (!auth?.scopes.includes("relay")) throw new AppError("This installation is not paired with an agent", 403);
  const db = adminDb();
  const { data: agent } = await db.from("agents").select("id,workspace_id,status").eq("id", auth.clientId).maybeSingle();
  if (!agent || agent.status !== "connected") throw new AppError("Agent credential was revoked", 403);
  const { data: workspace } = await db.from("workspaces").select("id,owner_id,boss_agent_id,plan").eq("id", agent.workspace_id).maybeSingle();
  if (!workspace) throw new AppError("Workspace not found", 404);
  if (workspace.plan !== "pro") throw new AppError("An active Stoic subscription is required to use agent coordination.", 402);
  return { agentId: agent.id, workspaceId: workspace.id, ownerId: workspace.owner_id, isBoss: workspace.boss_agent_id === agent.id };
}

export async function pairingIdentity(auth: VerifiedToken | undefined) {
  if (!auth?.scopes.includes("pair")) throw new AppError("OAuth pairing is not available for this connection", 403);
  const { data, error } = await authClient().auth.getClaims(auth.token);
  const ownerId = data?.claims?.sub;
  const clientId = data?.claims?.client_id;
  if (error || typeof ownerId !== "string" || typeof clientId !== "string") throw new AppError("Invalid OAuth session", 401);
  return { ownerId, clientId };
}
