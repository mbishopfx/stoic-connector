import { z } from "zod";
import { adminDb, AppError } from "@/lib/supabase";
import type { AgentIdentity } from "@/lib/identity";
import { hasReadableIntakeInput, readIntakeFiles } from "@/lib/intake-files";
import { interpretIntake } from "@/lib/intake-model";

export const intakeDraftInputSchema = z.object({
  projectId: z.uuid(),
  prompt: z.string().trim().max(12_000),
  artifactIds: z.array(z.uuid()).max(5).refine((items) => new Set(items).size === items.length).default([]),
  recent: z.array(z.object({
    prompt: z.string().trim().max(700),
    response: z.string().trim().max(700),
  }).strict()).max(2).default([]),
}).strict().refine((value) => value.prompt.length > 0 || value.artifactIds.length > 0, "Add a message or file");

export const intakeDraftOutputSchema = z.object({
  reply: z.string().max(12_000),
  proposal: z.object({
    title: z.string().max(160),
    goal: z.string().max(10_000),
    constraints: z.string().max(10_000),
  }).strict().nullable(),
  transcript: z.string().max(12_000),
  warnings: z.array(z.string()),
  workerCount: z.number().int().nonnegative(),
  artifactIds: z.array(z.uuid()),
});

export type IntakeDraftInput = z.infer<typeof intakeDraftInputSchema>;

export async function draftIntakeForAgent(agent: AgentIdentity, rawInput: unknown) {
  const input = intakeDraftInputSchema.parse(rawInput);
  if (!agent.isBoss) throw new AppError("Only the designated boss can prepare a handoff", 403);

  const db = adminDb();
  const [projectResult, workspaceResult, agentsResult] = await Promise.all([
    db.from("projects").select("id,name,brief,default_agent_id")
      .eq("workspace_id", agent.workspaceId).eq("id", input.projectId).is("archived_at", null).maybeSingle(),
    db.from("workspaces").select("boss_agent_id,delegation_level").eq("id", agent.workspaceId).maybeSingle(),
    db.from("agents").select("id,name,platform,harness_name,access_notes,status")
      .eq("workspace_id", agent.workspaceId).neq("status", "revoked").limit(100),
  ]);
  for (const result of [projectResult, workspaceResult, agentsResult]) {
    if (result.error) throw result.error;
  }
  if (!projectResult.data) throw new AppError("Project not found", 404);
  const workspace = workspaceResult.data;
  if (!workspace || workspace.boss_agent_id !== agent.agentId) {
    throw new AppError("Only the designated boss can prepare a handoff", 403);
  }
  if (workspace.delegation_level === "observe") {
    throw new AppError("Switch this workspace to propose or delegate mode before preparing a handoff", 403);
  }

  const agents = (agentsResult.data || []).map((item) => ({
    id: item.id,
    name: item.name,
    platform: item.platform,
    harness_name: item.harness_name,
    access_notes: item.access_notes || "",
    status: item.status,
  }));
  const workerCount = agents.filter((item) => item.status === "connected" && item.id !== agent.agentId && item.platform !== "muse").length;
  if (!workerCount) {
    return intakeDraftOutputSchema.parse({
      reply: "There is no connected worker to receive an assignment yet. Connect a worker and have it complete a successful Stoic inbox check; then I can prepare a handoff for your review. No handoff was created.",
      proposal: null,
      transcript: "",
      warnings: [],
      workerCount,
      artifactIds: input.artifactIds,
    });
  }

  const files = await readIntakeFiles(agent.workspaceId, input.projectId, input.artifactIds);
  if (!hasReadableIntakeInput(input.prompt, files)) {
    const detail = files.warnings.length ? files.warnings.join(" ") : "Stoic could not preview this file type.";
    return intakeDraftOutputSchema.parse({
      reply: `I saved the file with your project, but I need a short text instruction or a readable file preview before I can prepare a handoff. ${detail} No handoff was created.`,
      proposal: null,
      transcript: files.transcript,
      warnings: files.warnings,
      workerCount,
      artifactIds: input.artifactIds,
    });
  }

  const prompt = [input.prompt, files.transcript && `Voice transcript: ${files.transcript}`].filter(Boolean).join("\n\n");
  const reply = await interpretIntake({
    project: projectResult.data,
    bossAgentId: workspace.boss_agent_id,
    agents,
    recent: input.recent,
    prompt,
    fileNotes: files.notes,
    images: files.images,
  });
  return intakeDraftOutputSchema.parse({
    reply: [reply.reply, ...files.warnings].filter(Boolean).join("\n\n").slice(0, 12_000),
    proposal: reply.proposal.ready ? {
      title: reply.proposal.title,
      goal: reply.proposal.goal,
      constraints: reply.proposal.constraints,
    } : null,
    transcript: files.transcript,
    warnings: files.warnings,
    workerCount,
    artifactIds: input.artifactIds,
  });
}
