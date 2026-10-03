import { z } from "zod";
import { AppError, assertSameOrigin, currentUser, responseError } from "@/lib/supabase";
import { requireWorkspace } from "@/lib/account";
import { agentInput, artifactInput, handoffActionInput, handoffInput, projectInput, uuid, workspaceInput } from "@/lib/validation";
import { addAgent, createPairingCode, createProject, createWorkspace, issueAgentKey, revokeAgent, setAgentAccessNotes, setSchedule, setWorkspacePolicy, setProjectRouting, updateBrief } from "@/lib/account";
import { createHandoff, handoffAction, decideApproval } from "@/lib/coordination";
import { reserveArtifact, completeArtifact, artifactDownload, deleteArtifact } from "@/lib/artifacts";
import { createCheckout, createBillingPortal } from "@/lib/billing";
import { boardPostInput, postBoardMessage } from "@/lib/board";
import { acceptIdea, archiveIdea, setIdeasTimezone } from "@/lib/ideas";
import { contactInputSchema, contactLinkInputSchema, createContact, linkContact, updateContact } from "@/lib/contacts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (Number(request.headers.get("content-length") || 0) > 50_000) throw new AppError("Request too large", 413);
    const user = await currentUser();
    const raw = await request.text();
    if (raw.length > 50_000) throw new AppError("Request too large", 413);
    const body = JSON.parse(raw) as Record<string, unknown>;
    const action = z.string().parse(body.action);
    const accountActions = new Set(["create_workspace", "checkout", "billing_portal", "revoke_agent", "delete_artifact"]);
    const turningScheduleOff = action === "set_schedule" && body.enabled === false;
    if (!accountActions.has(action) && !turningScheduleOff) {
      const workspace = await requireWorkspace(user.id);
      if (workspace.plan !== "pro") throw new AppError("An active Stoic subscription is required to use agent coordination.", 402);
    }
    let data: unknown;
    switch (action) {
      case "create_workspace": {
        const { name } = workspaceInput.parse(body);
        data = await createWorkspace(user.id, name);
        break;
      }
      case "add_agent": {
        const { name, platform, harnessName } = agentInput.parse(body);
        data = await addAgent(user.id, name, platform, harnessName);
        break;
      }
      case "create_project": {
        const { name } = projectInput.parse(body);
        data = await createProject(user.id, name);
        break;
      }
      case "set_project_routing": {
        const parsed = z.object({ projectId: uuid, agentId: uuid.nullable() }).parse(body);
        data = await setProjectRouting(user.id, parsed.projectId, parsed.agentId);
        break;
      }
      case "set_policy": {
        const parsed = z.object({ bossAgentId: uuid.nullable(), delegationLevel: z.enum(["observe", "propose", "delegate"]) }).parse(body);
        data = await setWorkspacePolicy(user.id, parsed.bossAgentId, parsed.delegationLevel);
        break;
      }
      case "update_brief": {
        const parsed = z.object({ projectId: uuid, brief: z.string().max(20000), expectedVersion: z.number().int().positive() }).parse(body);
        data = await updateBrief(user.id, parsed.projectId, parsed.brief, parsed.expectedVersion);
        break;
      }
      case "set_schedule": {
        const parsed = z.object({ agentId: uuid, enabled: z.boolean(), cadenceMinutes: z.number().int().min(15).max(1440) }).parse(body);
        data = await setSchedule(user.id, parsed.agentId, parsed.enabled, parsed.cadenceMinutes);
        break;
      }
      case "set_agent_access": {
        const parsed = z.object({ agentId: uuid, accessNotes: z.string().max(2000) }).parse(body);
        data = await setAgentAccessNotes(user.id, parsed.agentId, parsed.accessNotes);
        break;
      }
      case "pair_code": {
        data = await createPairingCode(user.id, uuid.parse(body.agentId));
        break;
      }
      case "issue_key": {
        data = await issueAgentKey(user.id, uuid.parse(body.agentId));
        break;
      }
      case "revoke_agent": {
        data = await revokeAgent(user.id, uuid.parse(body.agentId));
        break;
      }
      case "create_handoff": {
        data = await createHandoff({ userId: user.id }, handoffInput.parse(body));
        break;
      }
      case "post_board_message": {
        data = await postBoardMessage({ userId: user.id }, boardPostInput.parse(body));
        break;
      }
      case "task_action": {
        data = await handoffAction({ userId: user.id }, handoffActionInput.parse(body));
        break;
      }
      case "decide_approval": {
        const parsed = z.object({ approvalId: uuid, decision: z.enum(["approved", "denied"]) }).parse(body);
        data = await decideApproval(user.id, parsed.approvalId, parsed.decision);
        break;
      }
      case "accept_idea": {
        data = await acceptIdea(user.id, uuid.parse(body.ideaId));
        break;
      }
      case "archive_idea": {
        data = await archiveIdea(user.id, uuid.parse(body.ideaId));
        break;
      }
      case "set_ideas_timezone": {
        data = await setIdeasTimezone(user.id, z.string().trim().min(1).max(100).parse(body.timezone));
        break;
      }
      case "create_contact": {
        data = await createContact({ userId: user.id }, contactInputSchema.parse(body));
        break;
      }
      case "link_contact": {
        data = await linkContact({ userId: user.id }, contactLinkInputSchema.parse(body));
        break;
      }
      case "update_contact": {
        data = await updateContact(user.id, body);
        break;
      }
      case "reserve_artifact": {
        data = await reserveArtifact({ userId: user.id }, artifactInput.parse(body));
        break;
      }
      case "complete_artifact": {
        data = await completeArtifact({ userId: user.id }, uuid.parse(body.artifactId));
        break;
      }
      case "artifact_download": {
        data = await artifactDownload({ userId: user.id }, uuid.parse(body.artifactId));
        break;
      }
      case "delete_artifact": {
        data = await deleteArtifact(user.id, uuid.parse(body.artifactId));
        break;
      }
      case "checkout": {
        data = await createCheckout(user.id);
        break;
      }
      case "billing_portal": {
        data = await createBillingPortal(user.id);
        break;
      }
      default:
        throw new AppError("Unknown action", 404);
    }
    return Response.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return responseError(error);
  }
}
