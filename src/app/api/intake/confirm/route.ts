import { z } from "zod";
import { adminDb, AppError, assertSameOrigin, currentUser, responseError } from "@/lib/supabase";
import { requireActiveWorkspace } from "@/lib/account";
import { createHandoff } from "@/lib/coordination";
import { uuid } from "@/lib/validation";

export const runtime = "nodejs";

const inputSchema = z.object({ turnId: uuid, action: z.enum(["create", "dismiss"]) });
const proposalSchema = z.object({ title: z.string().min(3).max(160), goal: z.string().min(10).max(10000), constraints: z.string().max(10000) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const raw = await request.text();
    if (raw.length > 1000) throw new AppError("Request too large", 413);
    const input = inputSchema.parse(JSON.parse(raw));
    const user = await currentUser();
    const workspace = await requireActiveWorkspace(user.id);
    const db = adminDb();
    const turnResult = await db.from("intake_turns")
      .select("id,thread_id,artifact_ids,proposal,proposal_status,handoff_id,status")
      .eq("workspace_id", workspace.id).eq("id", input.turnId).maybeSingle();
    if (turnResult.error) throw turnResult.error;
    const turn = turnResult.data;
    if (!turn || turn.status !== "completed") throw new AppError("Handoff draft not found", 404);
    if (turn.proposal_status === "created") return Response.json({ handoffId: turn.handoff_id, status: "created" });
    if (input.action === "dismiss") {
      if (turn.proposal_status !== "pending") throw new AppError("This handoff draft is no longer pending", 409);
      const dismissed = await db.from("intake_turns").update({ proposal_status: "dismissed", updated_at: new Date().toISOString() })
        .eq("workspace_id", workspace.id).eq("id", turn.id).eq("proposal_status", "pending").select("id").maybeSingle();
      if (dismissed.error) throw dismissed.error;
      if (!dismissed.data) throw new AppError("This draft changed. Refresh and try again.", 409);
      return Response.json({ status: "dismissed" });
    }
    if (turn.proposal_status !== "pending" && turn.proposal_status !== "creating") throw new AppError("This handoff draft is no longer pending", 409);
    const proposal = proposalSchema.parse(turn.proposal);
    const thread = await db.from("intake_threads").select("project_id")
      .eq("workspace_id", workspace.id).eq("id", turn.thread_id).maybeSingle();
    if (thread.error) throw thread.error;
    if (!thread.data) throw new AppError("Conversation not found", 404);
    const workers = await db.from("agents").select("id")
      .eq("workspace_id", workspace.id).eq("status", "connected").limit(100);
    if (workers.error) throw workers.error;
    if (!(workers.data || []).some((agent) => agent.id !== workspace.boss_agent_id)) throw new AppError("Connect a worker before adding this handoff to the team queue", 409);
    const fileRows = turn.artifact_ids.length ? await db.from("artifacts").select("id,name")
      .eq("workspace_id", workspace.id).eq("project_id", thread.data.project_id).eq("status", "ready").in("id", turn.artifact_ids)
      : { data: [], error: null };
    if (fileRows.error) throw fileRows.error;
    if ((fileRows.data || []).length !== turn.artifact_ids.length) throw new AppError("One or more attached files are unavailable", 409);
    const fileLine = (fileRows.data || []).map((file) => `${file.name} (artifact ${file.id})`).join("; ");
    const constraints = [proposal.constraints, "Before spending, publishing, deleting, contacting third parties, or changing external services, request owner approval.", fileLine && `Relevant project files: ${fileLine}. Read them through Stoic only when needed.`]
      .filter(Boolean).join("\n\n");
    if (turn.proposal_status === "pending") {
      const claimed = await db.from("intake_turns").update({ proposal_status: "creating", updated_at: new Date().toISOString() })
        .eq("workspace_id", workspace.id).eq("id", turn.id).eq("proposal_status", "pending").select("id").maybeSingle();
      if (claimed.error) throw claimed.error;
      if (!claimed.data) throw new AppError("This draft changed. Refresh and try again.", 409);
    }
    const handoff = await createHandoff({ userId: user.id }, {
      projectId: thread.data.project_id, teamQueue: true,
      title: proposal.title, goal: proposal.goal, constraints: constraints.slice(0, 10000),
      idempotencyKey: turn.id,
    }) as { id: string };
    if (turn.artifact_ids.length) {
      const attached = await db.rpc("stoic_attach_intake_artifacts_to_handoff", {
        p_workspace_id: workspace.id,
        p_owner_id: user.id,
        p_project_id: thread.data.project_id,
        p_handoff_id: handoff.id,
        p_artifact_ids: turn.artifact_ids,
      });
      if (attached.error) throw attached.error;
    }
    const saved = await db.from("intake_turns").update({ proposal_status: "created", handoff_id: handoff.id, updated_at: new Date().toISOString() })
      .eq("workspace_id", workspace.id).eq("id", turn.id).eq("proposal_status", "creating").select("id,handoff_id").maybeSingle();
    if (saved.error) throw saved.error;
    return Response.json({ handoffId: saved.data?.handoff_id || handoff.id, status: "created" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return responseError(error); }
}
