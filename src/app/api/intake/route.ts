import { z } from "zod";
import { adminDb, AppError, assertSameOrigin, currentUser, responseError } from "@/lib/supabase";
import { requireActiveWorkspace } from "@/lib/account";
import { idempotencyKey, uuid } from "@/lib/validation";
import { interpretIntake } from "@/lib/intake-model";
import { hasReadableIntakeInput, readIntakeFiles } from "@/lib/intake-files";

export const runtime = "nodejs";
export const maxDuration = 90;

const sendInput = z.object({
  threadId: uuid,
  projectId: uuid,
  text: z.string().trim().max(12000),
  artifactIds: z.array(uuid).max(5).refine((items) => new Set(items).size === items.length),
  requestKey: idempotencyKey,
}).refine((value) => value.text.length > 0 || value.artifactIds.length > 0, "Add a message or file");

export async function GET(request: Request) {
  try {
    const user = await currentUser();
    const workspace = await requireActiveWorkspace(user.id);
    const db = adminDb();
    const threadId = new URL(request.url).searchParams.get("threadId");
    const threads = await db.from("intake_threads").select("id,project_id,title,created_at,updated_at")
      .eq("workspace_id", workspace.id).order("updated_at", { ascending: false }).limit(50);
    if (threads.error) throw threads.error;
    let turns: unknown[] = [];
    let artifacts: { id: string; name: string; mime_type: string; size_bytes: number }[] = [];
    if (threadId) {
      const id = uuid.parse(threadId);
      const thread = await db.from("intake_threads").select("id")
        .eq("workspace_id", workspace.id).eq("id", id).maybeSingle();
      if (thread.error) throw thread.error;
      if (!thread.data) throw new AppError("Conversation not found", 404);
      const result = await db.from("intake_turns")
        .select("id,thread_id,prompt,artifact_ids,transcript,response,proposal,proposal_status,handoff_id,status,created_at")
        .eq("workspace_id", workspace.id).eq("thread_id", id).order("created_at").limit(100);
      if (result.error) throw result.error;
      turns = result.data || [];
      const artifactIds = [...new Set((result.data || []).flatMap((turn) => turn.artifact_ids || []))];
      if (artifactIds.length) {
        const attached = await db.from("artifacts").select("id,name,mime_type,size_bytes")
          .eq("workspace_id", workspace.id).in("id", artifactIds).eq("status", "ready");
        if (attached.error) throw attached.error;
        artifacts = attached.data || [];
      }
    }
    return Response.json({ threads: threads.data || [], turns, artifacts }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return responseError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    if (Number(request.headers.get("content-length") || 0) > 25_000) throw new AppError("Message too large", 413);
    const raw = await request.text();
    if (raw.length > 25_000) throw new AppError("Message too large", 413);
    const input = sendInput.parse(JSON.parse(raw));
    const user = await currentUser();
    const workspace = await requireActiveWorkspace(user.id);
    const db = adminDb();
    const existing = await db.from("intake_turns")
      .select("id,thread_id,prompt,artifact_ids,transcript,response,proposal,proposal_status,handoff_id,status,created_at")
      .eq("workspace_id", workspace.id).eq("request_key", input.requestKey).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) {
      if (existing.data.thread_id !== input.threadId || existing.data.prompt !== input.text || JSON.stringify(existing.data.artifact_ids) !== JSON.stringify(input.artifactIds)) throw new AppError("This retry key was used for different content", 409);
      if (existing.data.status === "failed") throw new AppError("This message failed. Please resend it.", 409);
      return Response.json({ turn: existing.data }, { status: existing.data.status === "processing" ? 202 : 200, headers: { "Cache-Control": "no-store" } });
    }
    const project = await db.from("projects").select("id,name,brief,default_agent_id")
      .eq("workspace_id", workspace.id).eq("id", input.projectId).is("archived_at", null).maybeSingle();
    if (project.error) throw project.error;
    if (!project.data) throw new AppError("Project not found", 404);
    const currentThread = await db.from("intake_threads").select("id,project_id")
      .eq("workspace_id", workspace.id).eq("id", input.threadId).maybeSingle();
    if (currentThread.error) throw currentThread.error;
    if (currentThread.data && currentThread.data.project_id !== input.projectId) throw new AppError("Conversation belongs to another project", 409);
    if (!currentThread.data) {
      const title = (input.text || "Files for the team").replace(/\s+/g, " ").slice(0, 80);
      const created = await db.from("intake_threads").insert({ id: input.threadId, workspace_id: workspace.id, project_id: input.projectId, title });
      if (created.error && created.error.code !== "23505") throw created.error;
    }
    const inserted = await db.from("intake_turns").insert({
      workspace_id: workspace.id, thread_id: input.threadId, owner_id: user.id,
      request_key: input.requestKey, prompt: input.text, artifact_ids: input.artifactIds,
    }).select("id").maybeSingle();
    if (inserted.error?.code === "23505") throw new AppError("This message is already being processed. Refresh to see its result.", 409);
    if (inserted.error || !inserted.data) throw inserted.error || new AppError("Could not save this message", 500);
    const turnId = inserted.data.id;
    try {
      const finishTurn = async (response: string, options: {
        transcript?: string;
        proposal?: { title: string; goal: string; constraints: string } | null;
        proposalStatus?: "none" | "pending";
      } = {}) => {
        const saved = await db.from("intake_turns").update({
          transcript: options.transcript || "", response, proposal: options.proposal || null,
          proposal_status: options.proposalStatus || "none", status: "completed", updated_at: new Date().toISOString(),
        }).eq("workspace_id", workspace.id).eq("id", turnId)
          .select("id,thread_id,prompt,artifact_ids,transcript,response,proposal,proposal_status,handoff_id,status,created_at").single();
        if (saved.error) throw saved.error;
        await db.from("intake_threads").update({ updated_at: new Date().toISOString() }).eq("workspace_id", workspace.id).eq("id", input.threadId);
        return Response.json({ turn: saved.data }, { headers: { "Cache-Control": "no-store" } });
      };
      const [agents, recent] = await Promise.all([
        db.from("agents").select("id,name,platform,harness_name,access_notes,status").eq("workspace_id", workspace.id).neq("status", "revoked").limit(100),
        db.from("intake_turns").select("prompt,response").eq("workspace_id", workspace.id).eq("thread_id", input.threadId).eq("status", "completed").order("created_at", { ascending: false }).limit(4),
      ]);
      if (agents.error || recent.error) throw agents.error || recent.error;
      const workers = (agents.data || []).filter((agent) => agent.status === "connected" && agent.id !== workspace.boss_agent_id && agent.platform !== "muse");
      if (!workers.length) {
        const response = "I saved this note and its files with the project, but there is no connected worker to receive an assignment yet. Connect a worker and have it complete a successful Stoic inbox check; then I can prepare a handoff for your review. No handoff was created.";
        return await finishTurn(response);
      }
      const files = await readIntakeFiles(workspace.id, input.projectId, input.artifactIds);
      if (!hasReadableIntakeInput(input.text, files)) {
        const detail = files.warnings.length
          ? files.warnings.join(" ")
          : "Stoic could not preview this file type.";
        const response = `I saved the file with your project, but I need a short text instruction or a readable file preview before I can prepare a handoff. ${detail} No handoff was created.`;
        return await finishTurn(response, { transcript: files.transcript });
      }
      const prompt = [input.text, files.transcript && `Voice transcript: ${files.transcript}`].filter(Boolean).join("\n\n");
      const reply = await interpretIntake({
        project: project.data, bossAgentId: workspace.boss_agent_id,
        agents: agents.data || [], recent: (recent.data || []).reverse(), prompt,
        fileNotes: files.notes, images: files.images,
      });
      const proposal = reply.proposal.ready && workers.length ? {
        title: reply.proposal.title, goal: reply.proposal.goal,
        constraints: reply.proposal.constraints,
      } : null;
      const response = [reply.reply, ...files.warnings].filter(Boolean).join("\n\n").slice(0, 12_000);
      return await finishTurn(response, { transcript: files.transcript, proposal, proposalStatus: proposal ? "pending" : "none" });
    } catch (error) {
      await db.from("intake_turns").update({ status: "failed", error_message: error instanceof Error ? error.message.slice(0, 300) : "Intake failed", updated_at: new Date().toISOString() })
        .eq("workspace_id", workspace.id).eq("id", turnId);
      throw error;
    }
  } catch (error) { return responseError(error); }
}
