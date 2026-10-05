import { createHash } from "node:crypto";
import { z } from "zod";
import { AppError, adminDb } from "@/lib/supabase";
import { requireActiveWorkspace } from "@/lib/account";
import type { AgentIdentity } from "@/lib/identity";
import { canReadScopedHandoff } from "@/lib/handoff-access";
import { MAX_CONTACT_CSV_BYTES, mapContactCsvColumns, mapContactCsvRows, parseContactCsv } from "@/lib/contact-csv";
import { contactSearchSchema, literalIlikePattern, recentContactCutoff, type ContactSearchFilters, type ContactSearchInput } from "@/lib/contact-filters";

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
  artifactId: z.uuid().nullable().optional(),
  sourceLabel: z.string().trim().min(2).max(180),
  sourceUrl: z.string().trim().max(2000).nullable().optional(),
  notes: z.string().trim().max(5000).default(""),
  idempotencyKey: z.string().min(8).max(128),
});

export const contactLinkInputSchema = z.object({
  contactId: z.uuid(),
  sourceLabel: z.string().trim().min(2).max(180),
  sourceUrl: z.string().trim().max(2000).nullable().optional(),
  notes: z.string().trim().max(5000).default(""),
  artifactId: z.uuid().nullable().optional(),
  email: z.email().max(254).nullable().optional(),
  phone: z.string().trim().max(60).nullable().optional(),
  company: z.string().trim().max(160).nullable().optional(),
  jobTitle: z.string().trim().max(160).nullable().optional(),
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

async function assertContactArtifactAccess(actor: ContactActor, workspaceId: string, artifactId: string, projectId?: string | null) {
  const db = adminDb();
  const { data: artifact, error } = await db.from("artifacts")
    .select("id,handoff_id,project_id,status")
    .eq("workspace_id", workspaceId).eq("id", artifactId).eq("status", "ready").maybeSingle();
  if (error) throw error;
  if (!artifact || (projectId && artifact.project_id !== projectId)) throw new AppError("Contact artifact not found", 404);
  if (actor.agent && artifact.handoff_id) {
    const { data: handoff, error: handoffError } = await db.from("handoffs")
      .select("id,assigned_agent_id,status").eq("workspace_id", workspaceId).eq("id", artifact.handoff_id).maybeSingle();
    if (handoffError) throw handoffError;
    if (!handoff || !await canReadScopedHandoff(actor.agent, handoff)) {
      throw new AppError("Contact artifact not found", 404);
    }
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
  if (parsed.artifactId) await assertContactArtifactAccess(actor, workspaceId, parsed.artifactId, parsed.projectId);
  const actorKey = actor.agent ? `agent:${actor.agent.agentId}` : `user:${actor.userId}`;
  const sourceKey = `${actorKey}:entry:${parsed.idempotencyKey}`;
  return callUpsert(actor, workspaceId, parsed.projectId || null, parsed.artifactId || null, [{
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

export async function linkContact(actor: ContactActor, input: unknown) {
  const parsed = contactLinkInputSchema.parse(input);
  const workspaceId = await actorWorkspace(actor);
  const db = adminDb();
  if (parsed.artifactId) await assertContactArtifactAccess(actor, workspaceId, parsed.artifactId);
  const actorKey = actor.agent ? `agent:${actor.agent.agentId}` : `user:${actor.userId}`;
  const { data, error } = await db.rpc("stoic_link_contact", {
    p_workspace_id: workspaceId,
    p_actor_agent_id: actor.agent?.agentId || null,
    p_actor_user_id: actor.userId || null,
    p_contact_id: parsed.contactId,
    p_source: {
      source_key: `${actorKey}:link:${parsed.idempotencyKey}`,
      source_label: parsed.sourceLabel,
      source_url: safeUrl(parsed.sourceUrl),
      notes: parsed.notes,
      artifact_id: parsed.artifactId || null,
      email: parsed.email || null,
      phone: parsed.phone || null,
      company: parsed.company || null,
      job_title: parsed.jobTitle || null,
    },
  });
  if (error) {
    const status = error.message.includes("subscription_required") ? 402
      : error.message.includes("forbidden") ? 403
      : error.message.includes("contact_not_found") || error.message.includes("artifact_not_found") ? 404
      : error.message.includes("contact_identity_conflict") || error.message.includes("source_key_conflict") || error.code === "23505" ? 409 : 400;
    throw new AppError(error.message.replaceAll("_", " "), status);
  }
  return data as { contactId: string; updated: boolean; alreadyLinked: boolean };
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

async function contactSearch(actor: ContactActor, input: ContactSearchFilters) {
  const workspaceId = await actorWorkspace(actor);
  const db = adminDb();
  const sourceSearch = Boolean(input.search && input.field === "source");
  const columns = "id,project_id,full_name,email,phone,company,job_title,status,notes,created_at,updated_at,last_seen_at";
  let query = db.from("contacts")
    .select(sourceSearch ? `${columns},contact_sources!inner(id)` : columns, { count: "exact" })
    .eq("workspace_id", workspaceId);
  if (input.status !== "all") query = query.eq("status", input.status);
  if (input.projectId === "unassigned") query = query.is("project_id", null);
  else if (input.projectId !== "all") query = query.eq("project_id", input.projectId);
  switch (input.contactability) {
    case "has_email": query = query.not("email", "is", null); break;
    case "missing_email": query = query.is("email", null); break;
    case "has_phone": query = query.not("phone", "is", null); break;
    case "missing_phone": query = query.is("phone", null); break;
    case "no_direct": query = query.is("email", null).is("phone", null); break;
  }
  const cutoff = recentContactCutoff(input.activity);
  if (cutoff) query = query.gte("last_seen_at", cutoff);
  if (input.search) {
    if (input.field === "all") query = query.textSearch("search_document", input.search, { type: "plain", config: "simple" });
    else {
      const column = { name: "full_name", company: "company", email: "email", phone: "phone", notes: "notes", source: "contact_sources.source_label" }[input.field];
      query = query.ilike(column, literalIlikePattern(input.search));
    }
  }
  const sort = {
    recent: { column: "updated_at", ascending: false },
    last_seen: { column: "last_seen_at", ascending: false },
    newest: { column: "created_at", ascending: false },
    oldest: { column: "created_at", ascending: true },
    name_asc: { column: "full_name", ascending: true },
    name_desc: { column: "full_name", ascending: false },
  }[input.sort];
  const { data, count, error } = await query.order(sort.column, { ascending: sort.ascending })
    .order("id", { ascending: sort.ascending }).range(input.offset, input.offset + 49);
  if (error) throw error;
  const rows = ((data || []) as unknown as Record<string, unknown>[]).map((row) => {
    const clean = { ...row };
    delete clean.contact_sources;
    return clean;
  });
  const contacts = await contactsWithSources(workspaceId, rows);
  return { contacts, total: count || 0, nextOffset: input.offset + contacts.length < (count || 0) ? input.offset + contacts.length : null };
}

export async function listContacts(ownerId: string, input: ContactSearchInput = {}) {
  return contactSearch({ userId: ownerId }, contactSearchSchema.parse(input));
}

export async function listContactSources(ownerId: string, contactId: string, offset = 0) {
  const workspace = await requireActiveWorkspace(ownerId);
  const db = adminDb();
  const { data: contact, error: contactError } = await db.from("contacts")
    .select("id").eq("workspace_id", workspace.id).eq("id", contactId).maybeSingle();
  if (contactError) throw contactError;
  if (!contact) throw new AppError("Contact not found", 404);
  const { data, count, error } = await db.from("contact_sources")
    .select("id,source_label,source_url,notes,artifact_id,created_at", { count: "exact" })
    .eq("workspace_id", workspace.id).eq("contact_id", contactId)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 49);
  if (error) throw error;
  const sources = data || [];
  return { sources, total: count || 0, nextOffset: offset + sources.length < (count || 0) ? offset + sources.length : null };
}

export async function searchContactsForAgent(agent: AgentIdentity, input: ContactSearchInput = {}) {
  return contactSearch({ agent }, contactSearchSchema.parse(input));
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
