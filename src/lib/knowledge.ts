import { z } from "zod";

export const KNOWLEDGE_CONTRACT_VERSION = 1 as const;
export const MAX_KNOWLEDGE_BODY_LENGTH = 24_000;

export const KNOWLEDGE_KINDS = [
  "index",
  "brief",
  "decision",
  "agent_profile",
  "handoff",
  "artifact",
  "question",
  "note",
  "steward_audit",
  "agent_diary",
] as const;

export const KNOWLEDGE_STATUSES = ["active", "proposed", "stale", "superseded", "archived", "conflicted"] as const;
export const KNOWLEDGE_CONFIDENCE = ["verified", "likely", "uncertain"] as const;

export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];
export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];
export type KnowledgeConfidence = (typeof KNOWLEDGE_CONFIDENCE)[number];

const noteIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const sourceIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/;
const notePathPattern = /^(?!\/)(?![A-Za-z]:\/)(?!.*(?:^|\/)\.\.(?:\/|$)).+\.md$/i;

const isoTimestamp = z.string().min(1).refine((value) => Number.isFinite(Date.parse(value)), "must be an ISO-8601 timestamp");
const noteReference = z.string().regex(noteIdPattern, "must be a stable note ID");
const sourceReference = z.string().regex(sourceIdPattern, "must be a bounded provenance ID");
const evidenceReference = z.string().trim().min(1).max(300).refine((value) => !/[\r\n]/.test(value), "cannot contain a newline");

const knowledgeMetadataSchema = z.object({
  contract_version: z.literal(KNOWLEDGE_CONTRACT_VERSION),
  id: noteReference,
  project_id: z.uuid(),
  kind: z.enum(KNOWLEDGE_KINDS),
  title: z.string().trim().min(1).max(160),
  status: z.enum(KNOWLEDGE_STATUSES),
  created_at: isoTimestamp,
  updated_at: isoTimestamp,
  confidence: z.enum(KNOWLEDGE_CONFIDENCE),
  source_agent: sourceReference.optional(),
  source_user: sourceReference.optional(),
  source_handoff: sourceReference.optional(),
  supersedes: z.array(noteReference).max(50),
  related: z.array(noteReference).max(50),
  evidence: z.array(evidenceReference).max(50),
}).strict();

export type KnowledgeFrontMatter = z.infer<typeof knowledgeMetadataSchema>;
export type KnowledgeNote = KnowledgeFrontMatter & { body: string };

export type KnowledgeDiagnostic = {
  code: string;
  message: string;
  severity: "error" | "warning";
  path?: string;
  line?: number;
  noteId?: string;
};

export type KnowledgeSafetyFinding = {
  code: "secret_like_value" | "credential_assignment" | "bearer_credential" | "transcript_like_content";
  message: string;
};

export type KnowledgeParseResult =
  | { ok: true; note: KnowledgeNote; normalizedMarkdown: string }
  | { ok: false; errors: KnowledgeDiagnostic[] };

export type KnowledgeFile = { path: string; markdown: string };

export type KnowledgeGraphNode = {
  id: string;
  project_id: string;
  kind: KnowledgeKind;
  title: string;
  status: KnowledgeStatus;
  confidence: KnowledgeConfidence;
  updated_at: string;
  source_path: string;
  source_agent?: string;
  source_user?: string;
  source_handoff?: string;
  evidence: string[];
  stale: boolean;
  orphan: boolean;
};

export type KnowledgeGraphEdgeType = "supersedes" | "related" | "wikilink";

export type KnowledgeGraphEdge = {
  id: string;
  source: string;
  target: string;
  type: KnowledgeGraphEdgeType;
  target_exists: boolean;
};

export type KnowledgeGraphIndex = {
  contract_version: typeof KNOWLEDGE_CONTRACT_VERSION;
  project_id: string;
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
};

export type KnowledgeGraphBuildResult = {
  graph: KnowledgeGraphIndex;
  errors: KnowledgeDiagnostic[];
  warnings: KnowledgeDiagnostic[];
};

type ParsedFrontMatter = {
  fields: Record<string, unknown>;
  body: string;
  errors: KnowledgeDiagnostic[];
};

function diagnostic(code: string, message: string, severity: "error" | "warning", extra: Partial<KnowledgeDiagnostic> = {}): KnowledgeDiagnostic {
  return { code, message, severity, ...extra };
}

function parseScalar(raw: string, line: number): { value?: unknown; error?: KnowledgeDiagnostic } {
  const value = raw.trim();
  if (!value) return { error: diagnostic("empty_front_matter_value", "Front-matter values cannot be empty; use [] for an empty array.", "error", { line }) };

  if (value.startsWith("[") || value.startsWith("\"")) {
    try {
      return { value: JSON.parse(value) as unknown };
    } catch {
      return { error: diagnostic("invalid_json_front_matter", "Arrays and quoted strings must be valid JSON on one line.", "error", { line }) };
    }
  }
  if (value === "true") return { value: true };
  if (value === "false") return { value: false };
  if (/^-?\d+$/.test(value)) return { value: Number(value) };
  if (value === "null") return { value: null };
  return { value };
}

function parseFrontMatter(markdown: string): ParsedFrontMatter {
  const normalized = markdown.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/.exec(normalized);
  if (!match) {
    return {
      fields: {},
      body: "",
      errors: [diagnostic("invalid_front_matter", "A knowledge note must start with a closed front-matter block.", "error")],
    };
  }

  const fields: Record<string, unknown> = {};
  const errors: KnowledgeDiagnostic[] = [];
  for (const [index, lineText] of match[1].split("\n").entries()) {
    const line = index + 2;
    const lineTextTrimmed = lineText.trim();
    if (!lineTextTrimmed) continue;
    const separator = lineText.indexOf(":");
    if (separator <= 0) {
      errors.push(diagnostic("invalid_front_matter_line", "Each front-matter entry must use key: value syntax.", "error", { line }));
      continue;
    }
    const key = lineText.slice(0, separator).trim();
    if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      errors.push(diagnostic("invalid_front_matter_key", `Unsupported front-matter key: ${key}`, "error", { line }));
      continue;
    }
    if (Object.hasOwn(fields, key)) {
      errors.push(diagnostic("duplicate_front_matter_key", `Front-matter key is repeated: ${key}`, "error", { line }));
      continue;
    }
    const parsed = parseScalar(lineText.slice(separator + 1), line);
    if (parsed.error) errors.push(parsed.error);
    else fields[key] = parsed.value;
  }

  return { fields, body: match[2].replace(/^\n/, "").trimEnd(), errors };
}

function formatFrontMatterValue(value: unknown): string {
  if (typeof value === "string" || Array.isArray(value)) return JSON.stringify(value);
  return String(value);
}

function metadataWithDefaults(fields: Record<string, unknown>): Record<string, unknown> {
  return {
    ...fields,
    supersedes: fields.supersedes ?? [],
    related: fields.related ?? [],
    evidence: fields.evidence ?? [],
  };
}

function zodDiagnostics(error: z.ZodError): KnowledgeDiagnostic[] {
  return error.issues.map((issue) => diagnostic(
    "invalid_note_metadata",
    `${issue.path.join(".") || "front matter"}: ${issue.message}`,
    "error",
  ));
}

export function inspectKnowledgeSafety(body: string): KnowledgeSafetyFinding[] {
  const findings: KnowledgeSafetyFinding[] = [];
  const secretPatterns: Array<[KnowledgeSafetyFinding["code"], RegExp, string]> = [
    ["secret_like_value", /(?:^|[\s"'`])(sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{16,}|AKIA[0-9A-Z]{16})(?=$|[\s"'`])/, "The note contains a value that resembles a provider credential."],
    ["secret_like_value", /-----BEGIN [A-Z ]*PRIVATE KEY-----/, "The note contains a private-key marker."],
    ["credential_assignment", /\b(?:api[_ -]?key|password|passphrase|client[_ -]?secret|access[_ -]?token|refresh[_ -]?token)\b\s*[:=]\s*(?!<redacted>|REDACTED\b)[^\s"'`<>]{8,}/i, "The note contains a credential-style assignment."],
    ["bearer_credential", /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/, "The note contains a bearer credential value."],
  ];
  for (const [code, pattern, message] of secretPatterns) {
    if (pattern.test(body)) findings.push({ code, message });
  }

  const speakerLabels = body.match(/^\s*(?:user|assistant|system|tool)\s*:/gim) || [];
  if (speakerLabels.length >= 4 || /\bBEGIN(?: FULL)? TRANSCRIPT\b/i.test(body)) {
    findings.push({ code: "transcript_like_content", message: "The note resembles a full speaker-labelled transcript; store a bounded summary and source reference instead." });
  }
  return findings;
}

function validateNoteMetadata(fields: Record<string, unknown>, body: string, sourcePath: string): KnowledgeParseResult {
  const parsed = knowledgeMetadataSchema.safeParse(metadataWithDefaults(fields));
  const errors = parsed.success ? [] : zodDiagnostics(parsed.error);
  if (!parsed.success) return { ok: false, errors: errors.map((item) => ({ ...item, path: sourcePath })) };

  const note = parsed.data;
  const createdAt = Date.parse(note.created_at);
  const updatedAt = Date.parse(note.updated_at);
  if (updatedAt < createdAt) errors.push(diagnostic("updated_before_created", "updated_at cannot be earlier than created_at.", "error", { path: sourcePath }));
  if (note.kind !== "index" && !note.source_agent && !note.source_user && !note.source_handoff) {
    errors.push(diagnostic("missing_provenance", "Non-index notes require source_agent, source_user, or source_handoff provenance.", "error", { path: sourcePath, noteId: note.id }));
  }
  if (!body.trim()) errors.push(diagnostic("empty_note_body", "A knowledge note must have a bounded Markdown body.", "error", { path: sourcePath, noteId: note.id }));
  if (body.length > MAX_KNOWLEDGE_BODY_LENGTH) errors.push(diagnostic("note_body_too_large", `The note body exceeds the ${MAX_KNOWLEDGE_BODY_LENGTH}-character limit.`, "error", { path: sourcePath, noteId: note.id }));
  for (const finding of [...inspectKnowledgeSafety(JSON.stringify(note)), ...inspectKnowledgeSafety(body)]) {
    errors.push(diagnostic(finding.code, finding.message, "error", { path: sourcePath, noteId: note.id }));
  }
  if (errors.length) return { ok: false, errors };

  const validNote: KnowledgeNote = { ...note, body };
  return { ok: true, note: validNote, normalizedMarkdown: serializeKnowledgeNote(validNote) };
}

export function parseKnowledgeNote(markdown: string, sourcePath = "note.md"): KnowledgeParseResult {
  const parsed = parseFrontMatter(markdown);
  if (parsed.errors.length) return { ok: false, errors: parsed.errors.map((item) => ({ ...item, path: sourcePath })) };
  return validateNoteMetadata(parsed.fields, parsed.body, sourcePath);
}

export function serializeKnowledgeNote(note: KnowledgeNote): string {
  const metadata = Object.fromEntries(Object.entries(note).filter(([key]) => key !== "body"));
  const parsed = knowledgeMetadataSchema.safeParse(metadata);
  if (!parsed.success) throw new Error(zodDiagnostics(parsed.error).map((item) => item.message).join("; "));
  if (Date.parse(note.updated_at) < Date.parse(note.created_at)) throw new Error("updated_at cannot be earlier than created_at");
  if (!note.body.trim() || note.body.length > MAX_KNOWLEDGE_BODY_LENGTH) throw new Error("Knowledge note body is outside the bounded contract");
  const safety = [...inspectKnowledgeSafety(JSON.stringify(metadata)), ...inspectKnowledgeSafety(note.body)];
  if (safety.length) throw new Error(safety.map((item) => item.message).join("; "));
  if (note.kind !== "index" && !note.source_agent && !note.source_user && !note.source_handoff) throw new Error("Non-index notes require provenance");

  const fields: Array<[string, unknown]> = [
    ["contract_version", note.contract_version],
    ["id", note.id],
    ["project_id", note.project_id],
    ["kind", note.kind],
    ["title", note.title],
    ["status", note.status],
    ["created_at", note.created_at],
    ["updated_at", note.updated_at],
    ["confidence", note.confidence],
    ["supersedes", note.supersedes],
    ["related", note.related],
    ["evidence", note.evidence],
  ];
  if (note.source_agent) fields.push(["source_agent", note.source_agent]);
  if (note.source_user) fields.push(["source_user", note.source_user]);
  if (note.source_handoff) fields.push(["source_handoff", note.source_handoff]);
  return `---\n${fields.map(([key, value]) => `${key}: ${formatFrontMatterValue(value)}`).join("\n")}\n---\n\n${note.body.replaceAll("\r\n", "\n").replaceAll("\r", "\n").trimEnd()}\n`;
}

function validKnowledgePath(path: string): boolean {
  return notePathPattern.test(path.replaceAll("\\", "/"));
}

function extractWikilinks(body: string): string[] {
  const references = new Set<string>();
  const pattern = /\[\[([A-Za-z0-9][A-Za-z0-9._:-]{2,127})(?:\|[^\]]+)?\]\]/g;
  for (const match of body.matchAll(pattern)) references.add(match[1]);
  return [...references].sort();
}

function compareDiagnostics(left: KnowledgeDiagnostic, right: KnowledgeDiagnostic): number {
  return [left.path || "", left.code, left.noteId || "", left.message].join("\u0000").localeCompare([right.path || "", right.code, right.noteId || "", right.message].join("\u0000"));
}

function compareNodes(left: KnowledgeGraphNode, right: KnowledgeGraphNode): number {
  return left.id.localeCompare(right.id) || left.source_path.localeCompare(right.source_path);
}

function compareEdges(left: KnowledgeGraphEdge, right: KnowledgeGraphEdge): number {
  return left.source.localeCompare(right.source) || left.type.localeCompare(right.type) || left.target.localeCompare(right.target) || left.id.localeCompare(right.id);
}

export function buildKnowledgeGraph(projectId: string, files: readonly KnowledgeFile[]): KnowledgeGraphBuildResult {
  const errors: KnowledgeDiagnostic[] = [];
  const warnings: KnowledgeDiagnostic[] = [];
  if (!z.uuid().safeParse(projectId).success) errors.push(diagnostic("invalid_project_id", "A graph requires a valid project UUID.", "error", { noteId: projectId }));

  const entries = [...files].sort((left, right) => left.path.replaceAll("\\", "/").localeCompare(right.path.replaceAll("\\", "/")));
  const notes = new Map<string, { path: string; note: KnowledgeNote }>();
  for (const entry of entries) {
    const path = entry.path.replaceAll("\\", "/");
    if (!validKnowledgePath(path)) {
      errors.push(diagnostic("invalid_note_path", "Knowledge files must be relative .md paths without parent traversal.", "error", { path }));
      continue;
    }
    const parsed = parseKnowledgeNote(entry.markdown, path);
    if (!parsed.ok) {
      errors.push(...parsed.errors);
      continue;
    }
    if (parsed.note.project_id !== projectId) {
      errors.push(diagnostic("cross_project_note", "The note project_id does not match the graph project boundary.", "error", { path, noteId: parsed.note.id }));
      continue;
    }
    if (notes.has(parsed.note.id)) {
      errors.push(diagnostic("duplicate_note_id", `The note ID ${parsed.note.id} appears more than once in this project.`, "error", { path, noteId: parsed.note.id }));
      continue;
    }
    notes.set(parsed.note.id, { path, note: parsed.note });
  }

  const edgeMap = new Map<string, KnowledgeGraphEdge>();
  const connected = new Set<string>();
  const addReference = (source: KnowledgeNote, target: string, type: KnowledgeGraphEdgeType, path: string) => {
    const id = `${source.id}:${type}:${target}`;
    if (source.id === target) {
      errors.push(diagnostic("self_reference", `Note ${source.id} cannot reference itself.`, "error", { path, noteId: source.id }));
      return;
    }
    const targetExists = notes.has(target);
    if (!targetExists) warnings.push(diagnostic("unresolved_reference", `Note ${source.id} references missing note ${target}.`, "warning", { path, noteId: source.id }));
    edgeMap.set(id, { id, source: source.id, target, type, target_exists: targetExists });
    if (targetExists) {
      connected.add(source.id);
      connected.add(target);
    }
  };

  for (const { path, note } of notes.values()) {
    for (const target of note.supersedes) addReference(note, target, "supersedes", path);
    for (const target of note.related) addReference(note, target, "related", path);
    for (const target of extractWikilinks(note.body)) addReference(note, target, "wikilink", path);
  }

  const nodes = [...notes.entries()].map(([id, { path, note }]) => ({
    id,
    project_id: note.project_id,
    kind: note.kind,
    title: note.title,
    status: note.status,
    confidence: note.confidence,
    updated_at: note.updated_at,
    source_path: path,
    ...(note.source_agent ? { source_agent: note.source_agent } : {}),
    ...(note.source_user ? { source_user: note.source_user } : {}),
    ...(note.source_handoff ? { source_handoff: note.source_handoff } : {}),
    evidence: note.evidence,
    stale: ["stale", "superseded", "archived", "conflicted"].includes(note.status),
    orphan: !connected.has(id),
  })).sort(compareNodes);
  const edges = [...edgeMap.values()].sort(compareEdges);
  const graph: KnowledgeGraphIndex = { contract_version: KNOWLEDGE_CONTRACT_VERSION, project_id: projectId, nodes, edges };
  return {
    graph,
    errors: errors.sort(compareDiagnostics),
    warnings: warnings.sort(compareDiagnostics),
  };
}
