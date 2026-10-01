import { createHash } from "node:crypto";
import OpenAI from "openai";
import { AppError, adminDb } from "@/lib/supabase";
import { requireActiveWorkspace } from "@/lib/account";
import { redactSensitiveText } from "@/lib/model-input";
import { getOwnerKnowledgeSettings } from "@/lib/knowledge-store";
import { dueKnowledgeSlots, localKnowledgeClock } from "./knowledge-schedule";
import {
  buildKnowledgeStewardInput,
  knowledgeStewardOutputSchema,
  knowledgeStewardReply,
  KNOWLEDGE_STEWARD_INSTRUCTIONS,
  hasAllowedStewardEvidence,
  type StewardContext,
} from "./knowledge-steward-boundary";
import { KNOWLEDGE_CONTRACT_VERSION, parseKnowledgeNote, serializeKnowledgeNote, type KnowledgeNote } from "./knowledge";

const STEWARD_AGENT_ID = "stoic-knowledge-steward";
const MAX_STORED_NOTES = 1000;
const STALE_CLAIM_AGE_MS = 15 * 60_000;

type StewardSettings = {
  enabled: boolean;
  timezone: string;
  schedule_slots: string[];
  source_scopes: StewardContext["scopes"];
  retention_days: number;
  pinned_note_ids: string[];
  settings_revision: number;
};
type ProjectRow = { id: string; workspace_id: string; name: string; brief: string; brief_version: number };
type StoredNoteRow = { id: string; kind: string; title: string; status: string; body: string; markdown: string; note_updated_at: string; source_agent: string | null };
type ModelEvent = { type: string; item_id?: string; content_index?: number; text?: string; turn?: { subagent_id?: string | null } };

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function projectRow(workspaceId: string, projectId: string): Promise<ProjectRow> {
  const { data, error } = await adminDb().from("projects").select("id,workspace_id,name,brief,brief_version")
    .eq("workspace_id", workspaceId).eq("id", projectId).is("archived_at", null).maybeSingle();
  if (error || !data) throw new AppError("Project not found", 404);
  return data as ProjectRow;
}

async function projectSettings(workspaceId: string, projectId: string): Promise<StewardSettings> {
  const { data, error } = await adminDb().from("knowledge_settings").select("enabled,timezone,schedule_slots,source_scopes,retention_days,pinned_note_ids,settings_revision")
    .eq("workspace_id", workspaceId).eq("project_id", projectId).maybeSingle();
  if (error) throw error;
  if (!data) return {
    enabled: false,
    timezone: "UTC",
    schedule_slots: ["08:00", "13:00", "18:00"],
    source_scopes: ["brief", "decisions", "board", "handoffs", "artifacts", "agents"],
    retention_days: 365,
    pinned_note_ids: [],
    settings_revision: 1,
  };
  return data as StewardSettings;
}

async function collectContext(workspaceId: string, projectId: string, project: ProjectRow, settings: StewardSettings) {
  const db = adminDb();
  const [notesResult, messagesResult, handoffsResult, artifactsResult, agentsResult] = await Promise.all([
    db.from("knowledge_notes").select("id,kind,title,status,body,markdown,note_updated_at,source_agent", { count: "exact" })
      .eq("workspace_id", workspaceId).eq("project_id", projectId).order("note_updated_at", { ascending: false }).limit(MAX_STORED_NOTES),
    db.from("board_messages").select("id,author_key,kind,body,created_at")
      .eq("workspace_id", workspaceId).eq("project_id", projectId).neq("kind", "suggestion").order("created_at", { ascending: false }).limit(40),
    db.from("handoffs").select("id,title,goal,constraints,status,updated_at")
      .eq("workspace_id", workspaceId).eq("project_id", projectId).order("updated_at", { ascending: false }).limit(30),
    db.from("artifacts").select("id,name,mime_type,size_bytes,handoff_id,created_at")
      .eq("workspace_id", workspaceId).eq("project_id", projectId).eq("status", "ready").order("created_at", { ascending: false }).limit(60),
    db.from("agents").select("id,name,platform,status,schedule_enabled,last_check_at")
      .eq("workspace_id", workspaceId).neq("status", "revoked").order("created_at", { ascending: true }).limit(40),
  ]);
  const queryError = notesResult.error || messagesResult.error || handoffsResult.error || artifactsResult.error || agentsResult.error;
  if (queryError) throw queryError;
  if ((notesResult.count || 0) > MAX_STORED_NOTES) throw new AppError("Knowledge notes exceed the Steward's safe review limit", 409);

  const handoffs = (handoffsResult.data || []) as StewardContext["handoffs"];
  const handoffIds = handoffs.map((handoff) => handoff.id);
  const eventsResult = handoffIds.length
    ? await db.from("task_events").select("id,handoff_id,event_type,body,created_at").eq("workspace_id", workspaceId)
      .in("handoff_id", handoffIds).order("created_at", { ascending: false }).limit(60)
    : { data: [], error: null };
  if (eventsResult.error) throw eventsResult.error;

  const rows = (notesResult.data || []) as StoredNoteRow[];
  const context: StewardContext = {
    scopes: settings.source_scopes,
    pinnedNoteIds: settings.pinned_note_ids,
    project: { id: project.id, name: project.name, brief: project.brief, brief_version: project.brief_version },
    notes: rows.map((row) => ({ id: row.id, kind: row.kind, title: row.title, status: row.status, body: row.body, updated_at: row.note_updated_at })),
    messages: (messagesResult.data || []) as StewardContext["messages"],
    handoffs,
    events: (eventsResult.data || []) as StewardContext["events"],
    artifacts: (artifactsResult.data || []) as StewardContext["artifacts"],
    agents: (agentsResult.data || []) as StewardContext["agents"],
  };
  return { context, noteRows: rows };
}

async function generateNotes(input: string) {
  const key = process.env.OPENAI_INTAKE_API_KEY;
  if (!key) throw new AppError("Knowledge Steward is not configured on this deployment", 503);
  const client = new OpenAI({ apiKey: key, timeout: 55_000, maxRetries: 0 });
  let sessionId: string | null = null;
  let completed = false;
  const parts = new Map<string, string>();
  try {
    const events = await client.beta.agents.sessions.create({
      agent: {
        model: "gpt-6-luna",
        instructions: KNOWLEDGE_STEWARD_INSTRUCTIONS,
        reasoning: { effort: "low" },
        text: { format: { type: "json_schema", schema: knowledgeStewardOutputSchema }, verbosity: "low" },
        multi_agent: { enabled: false },
        tools: [],
      },
      environment: { type: "none" },
      input: [{ role: "user", content: [{ type: "input_text", text: input }] }],
      metadata: { product: "stoic-knowledge-steward" },
      stream: true,
    });
    try {
      for await (const event of events) {
        if ("session_id" in event && typeof event.session_id === "string") sessionId = event.session_id;
        const typed = event as ModelEvent;
        if (typed.type === "agent.session.turn.output_text.done" && typeof typed.text === "string") {
          parts.set(`${typed.item_id}:${typed.content_index}`, typed.text);
        }
        if (typed.type === "agent.session.turn.failed" && typed.turn?.subagent_id == null) throw new Error("The Knowledge Steward model could not finish this run");
        if (typed.type === "agent.session.turn.cancelled" && typed.turn?.subagent_id == null) throw new Error("The Knowledge Steward model run was cancelled");
        if (["agent.session.failed", "agent.session.environment.failed", "error"].includes(typed.type)) throw new Error("The Knowledge Steward model is unavailable");
        if (typed.type === "agent.session.turn.completed" && typed.turn?.subagent_id == null) { completed = true; break; }
      }
    } finally { events.controller.abort(); }
    if (!completed) throw new Error("The Knowledge Steward response ended before completion");
    return knowledgeStewardReply.parse(JSON.parse([...parts.values()].join("\n").trim()));
  } finally {
    if (sessionId) await client.beta.agents.sessions.delete(sessionId).catch(() => {});
  }
}

type RunIdentity = { localDate: string; slot: string; trigger: "scheduled" | "manual" };
type ClaimResult = { id: string; claimed: boolean; reason: "claimed" | "already_run" | "in_progress" };

async function claimRun(input: {
  workspaceId: string;
  projectId: string;
  settingsRevision: number;
  identity: RunIdentity;
  fingerprint: string;
}) : Promise<ClaimResult> {
  const db = adminDb();
  const now = new Date().toISOString();
  const row = {
    workspace_id: input.workspaceId,
    project_id: input.projectId,
    scheduled_local_date: input.identity.localDate,
    scheduled_slot: input.identity.slot,
    trigger_kind: input.identity.trigger,
    source_scope_revision: input.settingsRevision,
    input_fingerprint: input.fingerprint,
    status: "running",
    started_at: now,
  };
  const inserted = await db.from("knowledge_refresh_runs").insert(row).select("id").maybeSingle();
  if (!inserted.error && inserted.data) return { id: inserted.data.id as string, claimed: true, reason: "claimed" };
  if (input.identity.trigger === "manual" || inserted.error?.code !== "23505") {
    if (inserted.error) throw inserted.error;
    throw new Error("Knowledge refresh run was not created");
  }

  const existing = await db.from("knowledge_refresh_runs").select("id,status,started_at")
    .eq("workspace_id", input.workspaceId).eq("project_id", input.projectId)
    .eq("scheduled_local_date", input.identity.localDate).eq("scheduled_slot", input.identity.slot)
    .eq("trigger_kind", "scheduled").maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) throw new Error("Scheduled Knowledge Steward slot could not be recovered");
  const current = existing.data as { id: string; status: string; started_at: string };
  if (current.status === "running" && Date.parse(current.started_at) > Date.now() - STALE_CLAIM_AGE_MS) {
    return { id: current.id, claimed: false, reason: "in_progress" };
  }
  if (!["failed", "running"].includes(current.status)) return { id: current.id, claimed: false, reason: "already_run" };

  let update = db.from("knowledge_refresh_runs").update({
    source_scope_revision: input.settingsRevision,
    input_fingerprint: input.fingerprint,
    status: "running",
    started_at: now,
    completed_at: null,
    error_code: null,
    error_message: null,
    note_ids_created: [],
    note_ids_updated: [],
    note_ids_stale: [],
    conflict_ids: [],
    unresolved_references: [],
    safety_findings: [],
    output_counts: {},
  }).eq("id", current.id);
  update = update.eq("status", current.status);
  if (current.status === "running") update = update.lt("started_at", new Date(Date.now() - STALE_CLAIM_AGE_MS).toISOString());
  const reclaimed = await update.select("id").maybeSingle();
  if (reclaimed.error) throw reclaimed.error;
  return reclaimed.data
    ? { id: current.id, claimed: true, reason: "claimed" }
    : { id: current.id, claimed: false, reason: "in_progress" };
}

function noteRow(workspaceId: string, projectId: string, note: KnowledgeNote, path: string) {
  return {
    workspace_id: workspaceId,
    project_id: projectId,
    id: note.id,
    path,
    kind: note.kind,
    title: note.title,
    status: note.status,
    confidence: note.confidence,
    note_created_at: note.created_at,
    note_updated_at: note.updated_at,
    source_agent: note.source_agent || null,
    source_user: null,
    source_handoff: null,
    supersedes: note.supersedes,
    related: note.related,
    evidence: note.evidence,
    metadata: Object.fromEntries(Object.entries(note).filter(([key]) => key !== "body")),
    body: note.body,
    markdown: serializeKnowledgeNote(note),
    updated_by_user_id: null,
  };
}

function normalizedContent(title: string, body: string, evidence: string[]) {
  return `${title.trim().toLocaleLowerCase()}\n${body.replace(/\s+/g, " ").trim().toLocaleLowerCase()}\n${[...evidence].sort().join("|")}`;
}

async function archiveExpiredStewardNotes(
  workspaceId: string,
  projectId: string,
  rows: StoredNoteRow[],
  settings: StewardSettings,
  now: string,
) {
  const cutoff = Date.now() - settings.retention_days * 86_400_000;
  const pinned = new Set(settings.pinned_note_ids);
  const archived: string[] = [];
  for (const row of rows) {
    if (archived.length >= 200) break;
    if (row.source_agent !== STEWARD_AGENT_ID || pinned.has(row.id) || ["archived", "superseded", "conflicted"].includes(row.status)) continue;
    if (Date.parse(row.note_updated_at) >= cutoff) continue;
    const parsed = parseKnowledgeNote(row.markdown);
    if (!parsed.ok) continue;
    const note: KnowledgeNote = { ...parsed.note, status: "archived", updated_at: now };
    const { error } = await adminDb().from("knowledge_notes").update({
      status: note.status,
      note_updated_at: note.updated_at,
      metadata: Object.fromEntries(Object.entries(note).filter(([key]) => key !== "body")),
      markdown: serializeKnowledgeNote(note),
    }).eq("workspace_id", workspaceId).eq("project_id", projectId).eq("id", row.id);
    if (error) throw error;
    archived.push(row.id);
  }
  return archived;
}

async function finishRun(runId: string, fields: Record<string, unknown>) {
  const { error } = await adminDb().from("knowledge_refresh_runs").update({ ...fields, completed_at: new Date().toISOString() }).eq("id", runId);
  if (error) throw error;
}

async function appendRunAudit(workspaceId: string, projectId: string, runId: string, identity: RunIdentity, status: string, details: Record<string, unknown>) {
  const { error } = await adminDb().from("audit_events").insert({
    workspace_id: workspaceId,
    actor_key: `system:${STEWARD_AGENT_ID}`,
    action: `knowledge.refresh_${status}`,
    object_id: projectId,
    details: { runId, trigger: identity.trigger, slot: identity.slot, localDate: identity.localDate, ...details },
  });
  if (error) console.error("Knowledge Steward audit event could not be appended", error.code || "database_error");
}

async function refreshProject(workspaceId: string, projectId: string, identity: RunIdentity) {
  if (identity.trigger === "scheduled") {
    const { data: workspace, error: workspaceError } = await adminDb().from("workspaces").select("plan").eq("id", workspaceId).maybeSingle();
    if (workspaceError) throw workspaceError;
    if (!workspace || workspace.plan !== "pro") return { status: "subscription_inactive" as const, created: 0 };
  }
  const settings = await projectSettings(workspaceId, projectId);
  if (identity.trigger === "scheduled" && !settings.enabled) return { status: "disabled" as const, created: 0 };
  const project = await projectRow(workspaceId, projectId);
  const { context, noteRows } = await collectContext(workspaceId, projectId, project, settings);
  const stewardInput = buildKnowledgeStewardInput(context);
  const fingerprint = sha256(JSON.stringify({ revision: settings.settings_revision, input: stewardInput.input }));
  const claim = await claimRun({ workspaceId, projectId, settingsRevision: settings.settings_revision, identity, fingerprint });
  if (!claim.claimed) return { status: claim.reason, created: 0 };

  try {
    const now = new Date().toISOString();
    const hasSources = stewardInput.evidenceReferences.size > 0;
    if (!hasSources) {
      const archivedIds = await archiveExpiredStewardNotes(workspaceId, projectId, noteRows, settings, now);
      const status = archivedIds.length ? "completed" : "skipped";
      await finishRun(claim.id, {
        status,
        error_code: status === "skipped" ? "no_sources" : null,
        note_ids_updated: archivedIds,
        output_counts: { generated: 0, created: 0, archived: archivedIds.length, duplicates: 0, rejected: 0 },
      });
      await appendRunAudit(workspaceId, projectId, claim.id, identity, status, { reason: "no_sources", archivedCount: archivedIds.length });
      return { status, created: 0, archived: archivedIds.length };
    }

    const reply = await generateNotes(stewardInput.input);
    const knownContent = new Set(noteRows.map((row) => normalizedContent(row.title, row.body, [])));
    const existingIds = new Set(noteRows.map((row) => row.id));
    const createdIds: string[] = [];
    let duplicateCount = 0;
    let rejectedCount = 0;

    for (const [index, candidate] of reply.notes.entries()) {
      const evidence = [...new Set(candidate.evidence)];
      if (!hasAllowedStewardEvidence(candidate.evidence, stewardInput.evidenceReferences)) {
        rejectedCount += 1;
        continue;
      }
      const body = redactSensitiveText(candidate.body).trim();
      const id = `steward-${sha256(normalizedContent(candidate.title, body, evidence)).slice(0, 32)}`;
      const note: KnowledgeNote = {
        contract_version: KNOWLEDGE_CONTRACT_VERSION,
        id,
        project_id: projectId,
        kind: candidate.kind,
        title: redactSensitiveText(candidate.title).trim(),
        status: "proposed",
        created_at: now,
        updated_at: now,
        confidence: "uncertain",
        source_agent: STEWARD_AGENT_ID,
        supersedes: [],
        related: [],
        evidence,
        body,
      };
      const parsed = parseKnowledgeNote(serializeKnowledgeNote(note), `steward/${id}.md`);
      if (!parsed.ok) {
        rejectedCount += 1;
        continue;
      }
      const dedupeKey = normalizedContent(note.title, note.body, []);
      if (knownContent.has(dedupeKey) || existingIds.has(id)) {
        duplicateCount += 1;
        continue;
      }
      const inserted = await adminDb().from("knowledge_notes").insert(noteRow(workspaceId, projectId, note, `steward/${id}.md`));
      if (inserted.error?.code === "23505") { duplicateCount += 1; continue; }
      if (inserted.error) throw inserted.error;
      knownContent.add(dedupeKey);
      existingIds.add(id);
      createdIds.push(id);
      if (createdIds.length >= 5 || index >= 4) break;
    }

    const archivedIds = await archiveExpiredStewardNotes(workspaceId, projectId, noteRows, settings, now);
    const finalStatus = rejectedCount ? "partial" : createdIds.length || archivedIds.length ? "completed" : "skipped";
    await finishRun(claim.id, {
      status: finalStatus,
      error_code: finalStatus === "skipped" ? "no_new_notes" : null,
      error_message: null,
      note_ids_created: createdIds,
      note_ids_updated: archivedIds,
      output_counts: { generated: reply.notes.length, created: createdIds.length, archived: archivedIds.length, duplicates: duplicateCount, rejected: rejectedCount },
      safety_findings: rejectedCount ? [{ code: "unverifiable_or_unsafe_note", count: rejectedCount }] : [],
    });
    await appendRunAudit(workspaceId, projectId, claim.id, identity, finalStatus, { createdCount: createdIds.length, archivedCount: archivedIds.length, rejectedCount });
    return { status: finalStatus, created: createdIds.length, archived: archivedIds.length };
  } catch (error) {
    await finishRun(claim.id, {
      status: "failed",
      error_code: "refresh_failed",
      error_message: "The Knowledge Steward could not complete this run. A scheduled run can retry it.",
      output_counts: {},
    }).catch(() => {});
    await appendRunAudit(workspaceId, projectId, claim.id, identity, "failed", { errorCode: "refresh_failed" });
    if (error instanceof AppError) throw error;
    throw new AppError("The Knowledge Steward could not complete this refresh. A scheduled run can retry it.", 503);
  }
}

export async function runOwnerKnowledgeSteward(ownerId: string, projectId: string) {
  const workspace = await requireActiveWorkspace(ownerId);
  const { settings } = await getOwnerKnowledgeSettings(ownerId, projectId);
  const local = localKnowledgeClock(new Date(), settings.timezone);
  const dateParts = new Intl.DateTimeFormat("en-GB", { timeZone: settings.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const values = Object.fromEntries(dateParts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const slot = `${values.hour}:${values.minute}`;
  return refreshProject(workspace.id, projectId, { trigger: "manual", localDate: local.localDate, slot });
}

export async function runDueKnowledgeSteward(now = new Date()) {
  if (!process.env.OPENAI_INTAKE_API_KEY) return { enabled: false, attempted: 0, completed: 0, failed: 0 };
  const db = adminDb();
  let offset = 0;
  const pageSize = 500;
  const candidates: Array<{ workspaceId: string; projectId: string; localDate: string; slot: string }> = [];
  while (true) {
    const { data, error } = await db.from("knowledge_settings")
      .select("workspace_id,project_id,timezone,schedule_slots").eq("enabled", true)
      .order("updated_at", { ascending: true }).range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = (data || []) as Array<{ workspace_id: string; project_id: string; timezone: string; schedule_slots: string[] }>;
    for (const setting of page) {
      for (const due of dueKnowledgeSlots(now, setting.timezone, setting.schedule_slots)) {
        candidates.push({ workspaceId: setting.workspace_id, projectId: setting.project_id, localDate: due.localDate, slot: due.slot });
      }
    }
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  const outcomes = await Promise.allSettled(candidates.map((candidate) => refreshProject(candidate.workspaceId, candidate.projectId, {
    trigger: "scheduled", localDate: candidate.localDate, slot: candidate.slot,
  })));
  return {
    enabled: true,
    attempted: candidates.length,
    completed: outcomes.filter((item) => item.status === "fulfilled" && ["completed", "partial", "skipped"].includes(item.value.status)).length,
    failed: outcomes.filter((item) => item.status === "rejected").length,
    outcomes: outcomes.map((item) => item.status === "fulfilled" ? item.value : { status: "failed" }),
  };
}
