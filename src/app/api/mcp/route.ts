import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { verifyAgentToken, identityFromVerified, pairingIdentity } from "@/lib/identity";
import { pairOAuthAgent } from "@/lib/account";
import { projectBrief, listInbox, handoffDetails, createHandoff, handoffAction, agentUpdateBrief, requestApproval } from "@/lib/coordination";
import { reserveArtifact, completeArtifact, artifactDownload, uploadTextArtifact } from "@/lib/artifacts";
import { appOrigin } from "@/lib/config";
import { rateLimit } from "@/lib/rate-limit";
import { responseError } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 30;

type ToolContext = { http?: { authInfo?: { token: string; clientId: string; scopes: string[]; expiresAt?: number } } };

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

async function run(ctx: ToolContext, fn: (agent: Awaited<ReturnType<typeof identityFromVerified>>) => Promise<unknown>) {
  try {
    const agent = await identityFromVerified(ctx.http?.authInfo);
    return result(await fn(agent));
  } catch (error) {
    return { ...result({ error: error instanceof Error ? error.message : "Request failed" }), isError: true };
  }
}

const handler = createMcpHandler((server) => {
  server.registerTool("pair_agent", {
    title: "Pair this installation",
    description: "Use the one-time code shown in the owner's dashboard after OAuth sign-in. This binds this MCP installation to one agent profile.",
    inputSchema: z.object({ code: z.string().min(10).max(60) }),
  }, async ({ code }, ctx) => {
    try {
      const identity = await pairingIdentity(ctx.http?.authInfo);
      return result(await pairOAuthAgent(identity.ownerId, identity.clientId, code));
    } catch (error) {
      return { ...result({ error: error instanceof Error ? error.message : "Pairing failed" }), isError: true };
    }
  });

  server.registerTool("get_project_brief", {
    title: "Read the shared project brief",
    description: "Get the current owner and boss-maintained decisions and constraints for a project.",
    inputSchema: z.object({ projectId: z.uuid() }),
    annotations: { readOnlyHint: true },
  }, async ({ projectId }, ctx) => run(ctx, (agent) => projectBrief(agent, projectId)));

  server.registerTool("check_inbox", {
    title: "Check assignments",
    description: "List pending and active handoffs for this agent. Call during scheduled inbox checks; an empty result needs no user notification.",
    inputSchema: z.object({ offset: z.number().int().min(0).max(10000).default(0) }),
    annotations: { readOnlyHint: true },
  }, async ({ offset }, ctx) => run(ctx, (agent) => listInbox(agent, offset)));

  server.registerTool("get_handoff", {
    title: "Read handoff and history",
    description: "Read a handoff, its progress events, approval requests, and artifact metadata.",
    inputSchema: z.object({ handoffId: z.uuid() }),
    annotations: { readOnlyHint: true },
  }, async ({ handoffId }, ctx) => run(ctx, (agent) => handoffDetails(agent, handoffId)));

  server.registerTool("create_handoff", {
    title: "Assign a handoff",
    description: "Boss only. Create a bounded task for one connected agent. In propose mode it waits for owner approval. Reuse the same idempotency key on retries.",
    inputSchema: z.object({
      projectId: z.uuid(), assignedAgentId: z.uuid().optional(), title: z.string().min(3).max(160),
      goal: z.string().min(10).max(10000), constraints: z.string().max(10000).default(""),
      idempotencyKey: z.string().min(8).max(128),
    }),
  }, async (args, ctx) => run(ctx, (agent) => createHandoff({ agent }, args)));

  const taskActions = [
    ["claim_handoff", "claim", "Claim a handoff assigned to this agent."],
    ["post_update", "update", "Post progress or a question to the handoff timeline."],
    ["mark_blocked", "block", "Mark a claimed handoff blocked and explain why."],
    ["submit_result", "submit", "Submit a result for boss review, with artifact references in the text."],
    ["accept_result", "accept", "Boss only. Accept a submitted result."],
    ["request_changes", "request_changes", "Boss only. Send a submitted result back to the worker."],
  ] as const;
  for (const [name, action, description] of taskActions) {
    server.registerTool(name, {
      title: name.replaceAll("_", " "),
      description,
      inputSchema: z.object({ handoffId: z.uuid(), body: z.string().max(20000).default(""), idempotencyKey: z.string().min(8).max(128) }),
    }, async (args, ctx) => run(ctx, (agent) => handoffAction({ agent }, { ...args, action })));
  }

  server.registerTool("request_approval", {
    title: "Ask the owner to approve an action",
    description: "Record a specific consequential external action for human review. Approval is a record, not permission to bypass the other app's controls.",
    inputSchema: z.object({ handoffId: z.uuid(), actionSummary: z.string().min(10).max(2000), idempotencyKey: z.string().min(8).max(128) }),
  }, async ({ handoffId, actionSummary, idempotencyKey }, ctx) => run(ctx, (agent) => requestApproval(agent, handoffId, actionSummary, idempotencyKey)));

  server.registerTool("update_project_brief", {
    title: "Update the shared project brief",
    description: "Boss only. Replace the shared brief using its expected version so concurrent decisions are not overwritten.",
    inputSchema: z.object({ projectId: z.uuid(), brief: z.string().max(20000), expectedVersion: z.number().int().positive() }),
  }, async ({ projectId, brief, expectedVersion }, ctx) => run(ctx, (agent) => agentUpdateBrief(agent, projectId, brief, expectedVersion)));

  server.registerTool("create_artifact_upload", {
    title: "Prepare a file handoff",
    description: "Reserve storage and return a signed PUT URL for a file up to 25 MB. Finish with complete_artifact_upload.",
    inputSchema: z.object({ projectId: z.uuid(), handoffId: z.uuid().optional(), name: z.string().min(1).max(180), mimeType: z.string().min(3).max(120), sizeBytes: z.number().int().min(1).max(25 * 1024 * 1024) }),
  }, async (args, ctx) => run(ctx, (agent) => reserveArtifact({ agent }, args)));

  server.registerTool("complete_artifact_upload", {
    title: "Finish a file handoff",
    description: "Verify the uploaded file's size and type before making it available to other agents.",
    inputSchema: z.object({ artifactId: z.uuid() }),
  }, async ({ artifactId }, ctx) => run(ctx, (agent) => completeArtifact({ agent }, artifactId)));

  server.registerTool("upload_text_artifact", {
    title: "Share a text file",
    description: "Upload a UTF-8 text artifact up to 256 KB without a separate HTTP upload step.",
    inputSchema: z.object({ projectId: z.uuid(), handoffId: z.uuid().optional(), name: z.string().min(1).max(180), text: z.string().min(1).max(256 * 1024) }),
  }, async (args, ctx) => run(ctx, (agent) => uploadTextArtifact(agent, args)));

  server.registerTool("get_artifact", {
    title: "Download a shared file",
    description: "Return a five-minute signed download URL for an artifact in this workspace.",
    inputSchema: z.object({ artifactId: z.uuid() }),
    annotations: { readOnlyHint: true },
  }, async ({ artifactId }, ctx) => run(ctx, (agent) => artifactDownload({ agent }, artifactId)));
}, { serverInfo: { name: "BishopTech Relay", version: "0.1.0" }, maxSubscriptions: 0 });

const secured = withMcpAuth(handler, async (_request, token) => verifyAgentToken(token), {
  required: true,
  resourceUrl: appOrigin(),
});

async function guarded(request: Request) {
  try {
    const header = request.headers.get("authorization") || "";
    if (header.toLowerCase().startsWith("bearer ")) await rateLimit(`mcp:${header.slice(7)}`, 120);
    return await secured(request);
  } catch (error) { return responseError(error); }
}

export { guarded as GET, guarded as POST };
