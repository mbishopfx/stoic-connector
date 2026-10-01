import { createHash } from "node:crypto";
import { z } from "zod";
import { AppError, adminDb } from "@/lib/supabase";
import { requireActiveWorkspace } from "@/lib/account";
import type { AgentIdentity } from "@/lib/identity";
import { canReadScopedHandoff } from "@/lib/handoff-access";
import { MAX_CONTACT_CSV_BYTES, mapContactCsvColumns, mapContactCsvRows, parseContactCsv } from "@/lib/contact-csv";

type ContactActor = { agent: AgentIdentity; userId?: never } | { agent?: never; userId: string };
const BUCKET = "stoic-artifacts";
const IMPORT_RETRY_AGE_MS = 15 * 60_000;

export const contactInputSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  email: z.string().trim().max(254).nullable().optional(),
  phone: z.string().trim().max(60).nullable().optional(),
  company: z.string().trim().max(160).nullable().optional(),
  jobTitle: z.string().trim().max(160).nullable().optional(),
  projectId: z.uuid().nullable().optional(),
  sourceLabel: z.string().trim().min(2).max(180),
  sourceUrl: z.string().trim().max(2000).nullable().optional(),
  notes: z.string().trim().max(5000).default(""),
  idempotencyKey: z.string().min(8).max(128),
});

export const contactImportInputSchema = z.object({
  artifactId: z.uuid(),
  sourceLabel: z.string().trim().min(2).max(180).optional(),
  idempotencyKey: z.string().min(8).max(128),
});

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

async function actorWorkspace(actor: ContactActor) {
  if (!actor.agent) return (await requireActiveWorkspace(actor.userId)).id;
  const { data, error } = await adminDb().from("workspaces").select("plan").eq("id", actor.agent.workspaceId).maybeSingle();
  if (error) throw error;
  if (!data || data.plan !== "pro") throw new AppError("An active Stoic subscription is required to use agent coordination.", 402);
  return actor.agent.workspaceId;
}

function safeUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!(url.protocol === "https:" || url.protocol === "http:") || url.username || url.password) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/(?:token|secret|password|passwd|auth|api.?key|session|credential)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString().slice(0, 2000);
  } catch {
    return null;
  }
}

async function callUpsert(actor: ContactActor, workspaceId: string, projectId: string | null, artifactId: string | null, contacts: unknown[]) {
  const { data, error } = await adminDb().rpc("stoic_upsert_contacts", {
    p_workspace_id: workspaceId,
    p_actor_agent_id: actor.agent?.agentId || null,
    p_actor_user_id: actor.userId || null,
    p_project_id: projectId,
    p_artifact_id: artifactId,
    p_contacts: contacts,
  });
  if (error) {
    const status = error.message.includes("subscription_required") ? 402 : error.message.includes("forbidden") ? 403 : error.message.includes("project_not_found") ? 404 : 400;
    throw new AppError(error.message.replaceAll("_", " "), status);
  }
  return data as { created: number; updated: number; skipped: number; processed: number };
}

export async function createContact(actor: ContactActor, input: unknown) {
  const parsed = contactInputSchema.parse(input);
  const workspaceId = await actorWorkspace(actor);
  const actorKey = actor.agent ? `agent:${actor.agent.agentId}` : `user:${actor.userId}`;
  const sourceKey = `${actorKey}:entry:${parsed.idempotencyKey}`;
  return callUpsert(actor, workspaceId, parsed.projectId || null, null, [{
    full_name: parsed.fullName,
    email: parsed.email || null,
    phone: parsed.phone || null,
    company: parsed.company || null,
    job_title: parsed.jobTitle || null,
    notes: parsed.notes,
    source_label: parsed.sourceLabel,
    source_url: safeUrl(parsed.sourceUrl),
    source_key: sourceKey,
  }]);
}

async function claimImport(input: {
  workspaceId: string;
  actorKey: string;
  idempotencyKey: string;
  fileName: string;
  artifactId: string | null;
  contentFingerprint: string;
}) {
  const db = adminDb();
  const lookup = () => db.from("contact_imports").select("id,status,content_fingerprint,started_at,created_count,updated_count,skipped_count")
    .eq("workspace_id", input.workspaceId).eq("idempotency_key", input.idempotencyKey).maybeSingle();
  let existing = await lookup();
  if (existing.error) throw existing.error;
  if (!existing.data) {
    const inserted = await db.from("contact_imports").insert({
      workspace_id: input.workspaceId,
      idempotency_key: input.idempotencyKey,
      actor_key: input.actorKey,
      artifact_id: input.artifactId,
      file_name: input.fileName.slice(0, 180),
      content_fingerprint: input.contentFingerprint,
      status: "processing",
    }).select("id,status,content_fingerprint,started_at,created_count,updated_count,skipped_count").maybeSingle();
    if (!inserted.error && inserted.data) return { importId: inserted.data.id as string, completed: null as { created: number; updated: number; skipped: number } | null };
    if (inserted.error?.code !== "23505") throw inserted.error || new Error("Contact import could not be started");
    existing = await lookup();
    if (existing.error || !existing.data) throw existing.error || new Error("Contact import could not be recovered");
  }
  const row = existing.data;
  if (row.content_fingerprint !== input.contentFingerprint) throw new AppError("This idempotency key was already used for a different CSV file", 409);
  if (row.status === "completed") {
    return { importId: row.id as string, completed: { created: row.created_count as number, updated: row.updated_count as number, skipped: row.skipped_count as number } };
  }
  if (row.status === "processing" && Date.now() - new Date(row.started_at as string).getTime() < IMPORT_RETRY_AGE_MS) {
    throw new AppError("This contact import is already processing. Try again shortly.", 409);
  }
  const priorStatus = row.status as "failed" | "processing";
  let retry = db.from("contact_imports").update({ status: "processing", actor_key: input.actorKey, artifact_id: input.artifactId, file_name: input.fileName.slice(0, 180), started_at: new Date().toISOString(), completed_at: null, last_error: null, created_count: 0, updated_count: 0, skipped_count: 0 })
    .eq("workspace_id", input.workspaceId).eq("id", row.id).eq("status", priorStatus);
  if (priorStatus === "processing") retry = retry.lt("started_at", new Date(Date.now() - IMPORT_RETRY_AGE_MS).toISOString());
  const claimed = await retry.select("id").maybeSingle();
  if (claimed.error) throw claimed.error;
  if (!claimed.data) throw new AppError("This contact import is already processing. Try again shortly.", 409);
  return { importId: row.id as string, completed: null as { created: number; updated: number; skipped: number } | null };
}

async function finishImport(input: {
  workspaceId: string;
  importId: string;
  result: { created: number; updated: number; skipped: number };
}) {
  const { error } = await adminDb().from("contact_imports").update({
    status: "completed",
    created_count: input.result.created,
    updated_count: input.result.updated,
    skipped_count: input.result.skipped,
    completed_at: new Date().toISOString(),
    last_error: null,
  }).eq("workspace_id", input.workspaceId).eq("id", input.importId).eq("status", "processing");
  if (error) throw error;
}

async function markImportFailed(workspaceId: string, importId: string) {
  await adminDb().from("contact_imports").update({ status: "failed", last_error: "contact_import_failed" })
    .eq("workspace_id", workspaceId).eq("id", importId).eq("status", "processing");
}

export async function importContactsCsv(input: {
  actor: ContactActor;
  fileName: string;
  csvText: string;
  projectId: string | null;
  artifactId: string | null;
  sourceLabel: string;
  idempotencyKey: string;
}) {
  const bytes = new TextEncoder().encode(input.csvText);
  if (bytes.byteLength > MAX_CONTACT_CSV_BYTES) throw new AppError("Contact CSV files can be up to 4 MB", 413);
  const table = parseContactCsv(input.csvText);
  const workspaceId = await actorWorkspace(input.actor);
  const actorKey = input.actor.agent ? `agent:${input.actor.agent.agentId}` : `user:${input.actor.userId}`;
  const contentFingerprint = sha256(bytes);
  const claim = await claimImport({
    workspaceId,
    actorKey,
    idempotencyKey: input.idempotencyKey,
    fileName: input.fileName,
    artifactId: input.artifactId,
    contentFingerprint,
  });
  if (claim.completed) return { ...claim.completed, importId: claim.importId, alreadyImported: true };

  try {
    const mapping = await mapContactCsvColumns(table.headers, table.rows.slice(0, 12));
    const contacts = mapContactCsvRows({
      headers: table.headers,
      rows: table.rows,
      mapping,
      importId: claim.importId,
      fallbackSource: input.sourceLabel.trim().slice(0, 180) || "CSV import",
    });
    const validContacts = contacts.filter((contact): contact is NonNullable<typeof contact> => contact !== null);
    if (!validContacts.length) throw new AppError("No contact rows had a usable name", 400);
    const totals = { created: 0, updated: 0, skipped: contacts.length - validContacts.length };
    for (let offset = 0; offset < validContacts.length; offset += 250) {
      const result = await callUpsert(input.actor, workspaceId, input.projectId, input.artifactId, validContacts.slice(offset, offset + 250));
      totals.created += result.created;
      totals.updated += result.updated;
      totals.skipped += result.skipped;
    }
    await finishImport({ workspaceId, importId: claim.importId, result: totals });
    return { ...totals, importId: claim.importId, alreadyImported: false };
  } catch (error) {
    await markImportFailed(workspaceId, claim.importId);
    throw error;
  }
}

export async function importContactsFromArtifact(agent: AgentIdentity, raw: unknown) {
  const parsed = contactImportInputSchema.parse(raw);
  const db = adminDb();
  const { data: artifact, error } = await db.from("artifacts")
    .select("id,project_id,handoff_id,name,mime_type,size_bytes,storage_path,status")
    .eq("workspace_id", agent.workspaceId).eq("id", parsed.artifactId).eq("status", "ready").maybeSingle();
  if (error) throw error;
  if (!artifact) throw new AppError("Contact CSV file not found", 404);
  if (artifact.handoff_id) {
    const { data: handoff, error: handoffError } = await db.from("handoffs")
      .select("id,assigned_agent_id,status").eq("workspace_id", agent.workspaceId).eq("id", artifact.handoff_id).maybeSingle();
    if (handoffError) throw handoffError;
    if (!handoff || !await canReadScopedHandoff(agent, { ...handoff, id: artifact.handoff_id })) throw new AppError("Contact CSV file not found", 404);
  }
  if (!/\.csv$/i.test(artifact.name) || !["text/csv", "text/plain", "application/csv"].includes(artifact.mime_type)) {
    throw new AppError("Choose a ready CSV artifact with a .csv file name", 415);
  }
  if (artifact.size_bytes > MAX_CONTACT_CSV_BYTES) throw new AppError("Contact CSV files can be up to 4 MB", 413);
  const { data: blob, error: downloadError } = await db.storage.from(BUCKET).download(artifact.storage_path);
  if (downloadError || !blob) throw new AppError("Could not read the contact CSV artifact", 502);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let csvText: string;
  try {
    csvText = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new AppError("Contact CSV must use UTF-8 text", 400);
  }
  return importContactsCsv({
    actor: { agent },
    fileName: artifact.name,
    csvText,
    projectId: artifact.project_id,
    artifactId: artifact.id,
    sourceLabel: parsed.sourceLabel || `Agent CSV: ${artifact.name}`,
    idempotencyKey: parsed.idempotencyKey,
  });
}

async function contactsWithSources(workspaceId: string, rows: Record<string, unknown>[]) {
  const ids = rows.map((row) => row.id).filter((id): id is string => typeof id === "string");
  if (!ids.length) return [];
  const { data: sources, error } = await adminDb().from("contact_sources")
    .select("id,contact_id,source_label,source_url,notes,artifact_id,created_at")
    .eq("workspace_id", workspaceId).in("contact_id", ids).order("created_at", { ascending: false }).limit(ids.length * 5);
  if (error) throw error;
  const byContact = new Map<string, typeof sources>();
  for (const source of sources || []) byContact.set(source.contact_id, [...(byContact.get(source.contact_id) || []), source]);
  return rows.map((row) => ({ ...row, sources: byContact.get(row.id as string) || [] }));
}

async function contactSearch(actor: ContactActor, search: string, offset: number, status?: string) {
  const workspaceId = await actorWorkspace(actor);
  const db = adminDb();
  let query = db.from("contacts").select("id,project_id,full_name,email,phone,company,job_title,status,notes,created_at,updated_at,last_seen_at", { count: "exact" })
    .eq("workspace_id", workspaceId).order("updated_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 49);
  if (status) query = query.eq("status", status);
  if (search.trim()) query = query.textSearch("search_document", search.trim().slice(0, 120), { type: "plain", config: "simple" });
  const { data, count, error } = await query;
  if (error) throw error;
  const contacts = await contactsWithSources(workspaceId, (data || []) as Record<string, unknown>[]);
  return { contacts, total: count || 0, nextOffset: offset + contacts.length < (count || 0) ? offset + contacts.length : null };
}

export async function listContacts(ownerId: string, input: { search?: string; offset?: number; status?: string } = {}) {
  await requireActiveWorkspace(ownerId);
  return contactSearch({ userId: ownerId }, input.search || "", input.offset || 0, input.status);
}

export async function searchContactsForAgent(agent: AgentIdentity, search: string, offset = 0) {
  return contactSearch({ agent }, search, offset);
}

export async function updateContact(ownerId: string, raw: unknown) {
  const input = z.object({
    contactId: z.uuid(),
    status: z.enum(["new", "contacted", "qualified", "customer", "archived"]),
    notes: z.string().max(10000),
  }).parse(raw);
  const workspace = await requireActiveWorkspace(ownerId);
  const { data, error } = await adminDb().from("contacts").update({ status: input.status, notes: input.notes, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspace.id).eq("id", input.contactId)
    .select("id,full_name,status,notes,updated_at").maybeSingle();
  if (error) throw error;
  if (!data) throw new AppError("Contact not found", 404);
  await adminDb().from("audit_events").insert({ workspace_id: workspace.id, actor_key: `user:${ownerId}`, action: "contact.updated", object_id: input.contactId });
  return data;
}

export async function importOwnerContacts(ownerId: string, input: {
  fileName: string;
  csvText: string;
  sourceLabel: string;
  projectId: string | null;
  idempotencyKey: string;
}) {
  await requireActiveWorkspace(ownerId);
  return importContactsCsv({ actor: { userId: ownerId }, ...input, artifactId: null });
}
