import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildKnowledgeGraph,
  parseKnowledgeNote,
  serializeKnowledgeNote,
  type KnowledgeNote,
} from "../src/lib/knowledge";

const projectId = "00000000-0000-4000-8000-000000000001";
const otherProjectId = "00000000-0000-4000-8000-000000000099";
const createdAt = "2026-09-28T13:00:00.000Z";
const updatedAt = "2026-09-28T14:00:00.000Z";

function note(overrides: Partial<KnowledgeNote> = {}): KnowledgeNote {
  return {
    contract_version: 1,
    id: "project-brief",
    project_id: projectId,
    kind: "brief",
    title: "Current project brief",
    status: "active",
    created_at: createdAt,
    updated_at: updatedAt,
    confidence: "verified",
    source_agent: "agent-1",
    source_user: "user-1",
    source_handoff: "handoff-1",
    supersedes: [],
    related: [],
    evidence: ["brief:version-3"],
    body: "The approved project direction is recorded here.",
    ...overrides,
  };
}

function markdown(overrides: Partial<KnowledgeNote> = {}) {
  return serializeKnowledgeNote(note(overrides));
}

describe("Markdown knowledge note contract", () => {
  it("round-trips stable metadata, provenance, arrays, and Markdown links", () => {
    const source = note({
      id: "decision-auth-boundary",
      kind: "decision",
      title: "Authentication boundary",
      related: ["project-brief"],
      supersedes: ["decision-auth-old"],
      evidence: ["handoff:handoff-1", "artifact:artifact-1"],
      body: "Keep provider credentials outside Stoic. See [[project-brief|the brief]].",
    });
    const parsed = parseKnowledgeNote(serializeKnowledgeNote(source), "decisions/auth.md");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.note).toEqual(source);
    expect(parsed.normalizedMarkdown).toBe(serializeKnowledgeNote(source));
  });

  it("rejects duplicate keys and unknown metadata instead of guessing", () => {
    const duplicate = markdown({ id: "safe-note" }).replace('id: "safe-note"', 'id: "safe-note"\nid: "safe-note-again"');
    const duplicateResult = parseKnowledgeNote(duplicate, "duplicate.md");
    expect(duplicateResult.ok).toBe(false);
    if (!duplicateResult.ok) expect(duplicateResult.errors.map((error) => error.code)).toContain("duplicate_front_matter_key");

    const unknown = markdown({ id: "safe-note" }).replace("---\n\nThe approved", 'unknown_field: "not accepted"\n---\n\nThe approved');
    const unknownResult = parseKnowledgeNote(unknown, "unknown.md");
    expect(unknownResult.ok).toBe(false);
    if (!unknownResult.ok) expect(unknownResult.errors.map((error) => error.code)).toContain("invalid_note_metadata");
  });

  it("requires provenance for non-index notes and rejects unbounded unsafe content", () => {
    const withoutProvenance = markdown().replace(/\nsource_(?:agent|user|handoff): "[^"]+"/g, "");
    const missingProvenance = parseKnowledgeNote(withoutProvenance, "no-source.md");
    expect(missingProvenance.ok).toBe(false);
    if (!missingProvenance.ok) expect(missingProvenance.errors.map((error) => error.code)).toContain("missing_provenance");

    const credential = parseKnowledgeNote(markdown().replace("The approved project direction is recorded here.", "Do not persist api_key: test-only-placeholder-value."), "credential.md");
    expect(credential.ok).toBe(false);
    if (!credential.ok) expect(credential.errors.map((error) => error.code)).toContain("credential_assignment");

    const transcript = parseKnowledgeNote(markdown().replace("The approved project direction is recorded here.", "User: one\nAssistant: two\nUser: three\nAssistant: four"), "transcript.md");
    expect(transcript.ok).toBe(false);
    if (!transcript.ok) expect(transcript.errors.map((error) => error.code)).toContain("transcript_like_content");
  });

  it("accepts an index without a source principal but keeps the body bounded", () => {
    const parsed = parseKnowledgeNote(markdown({ id: "index", kind: "index", source_agent: undefined, source_user: undefined, source_handoff: undefined, body: "Index links are derived from validated notes." }), "index.md");
    expect(parsed.ok).toBe(true);
  });
});

describe("deterministic knowledge graph projection", () => {
  it("sorts nodes and edges independently of input order and marks stale/orphan state", () => {
    const brief = markdown({ id: "project-brief", body: "The current direction is linked from [[decision-auth]]." });
    const decision = markdown({ id: "decision-auth", kind: "decision", title: "Auth decision", status: "active", related: ["project-brief"], body: "The decision supersedes [[decision-old]]." });
    const oldDecision = markdown({ id: "decision-old", kind: "decision", title: "Old auth decision", status: "superseded", supersedes: [], body: "Historical decision kept for review." });
    const orphan = markdown({ id: "open-question", kind: "question", title: "Open question", status: "stale", body: "This has no relationship yet." });
    const files = [
      { path: "brief.md", markdown: brief },
      { path: "decisions/old.md", markdown: oldDecision },
      { path: "decisions/current.md", markdown: decision },
      { path: "questions/open.md", markdown: orphan },
    ];
    const first = buildKnowledgeGraph(projectId, files);
    const second = buildKnowledgeGraph(projectId, [...files].reverse());
    expect(first.errors).toEqual([]);
    expect(first.warnings).toEqual([]);
    expect(JSON.stringify(first.graph)).toBe(JSON.stringify(second.graph));
    expect(first.graph.nodes.map((node) => node.id)).toEqual(["decision-auth", "decision-old", "open-question", "project-brief"]);
    expect(first.graph.nodes.find((node) => node.id === "decision-old")).toMatchObject({ stale: true, orphan: false });
    expect(first.graph.nodes.find((node) => node.id === "open-question")).toMatchObject({ stale: true, orphan: true });
    expect(first.graph.nodes.find((node) => node.id === "project-brief")).toMatchObject({ source_agent: "agent-1", source_user: "user-1", source_handoff: "handoff-1", evidence: ["brief:version-3"] });
    expect(first.graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "decision-auth", target: "project-brief", type: "related", target_exists: true }),
      expect.objectContaining({ source: "decision-auth", target: "decision-old", type: "wikilink", target_exists: true }),
      expect.objectContaining({ source: "project-brief", target: "decision-auth", type: "wikilink", target_exists: true }),
    ]));
  });

  it("reports unresolved references without fabricating a readable node", () => {
    const result = buildKnowledgeGraph(projectId, [{ path: "brief.md", markdown: markdown({ body: "See [[missing-note]]." }) }]);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([expect.objectContaining({ code: "unresolved_reference", noteId: "project-brief" })]);
    expect(result.graph.nodes).toHaveLength(1);
    expect(result.graph.edges).toEqual([expect.objectContaining({ target: "missing-note", target_exists: false })]);
    expect(result.graph.nodes[0].orphan).toBe(true);
  });

  it("fails closed on cross-project notes, duplicate IDs, and unsafe paths", () => {
    const crossProject = markdown({ id: "foreign", project_id: otherProjectId });
    const duplicate = markdown({ id: "project-brief" });
    const result = buildKnowledgeGraph(projectId, [
      { path: "brief.md", markdown: markdown() },
      { path: "foreign.md", markdown: crossProject },
      { path: "duplicate.md", markdown: duplicate },
      { path: "../escape.md", markdown: markdown({ id: "escape" }) },
    ]);
    expect(result.graph.nodes.map((node) => node.id)).toEqual(["project-brief"]);
    expect(result.errors.map((error) => error.code)).toEqual(expect.arrayContaining(["cross_project_note", "duplicate_note_id", "invalid_note_path"]));
  });
});

describe("machine-readable knowledge artifacts", () => {
  it("keeps the note and graph schemas valid JSON", () => {
    const noteSchema = JSON.parse(readFileSync(resolve(process.cwd(), "docs/knowledge-base/knowledge-note.schema.json"), "utf8")) as { properties: Record<string, unknown> };
    const graphSchema = JSON.parse(readFileSync(resolve(process.cwd(), "docs/knowledge-base/graph-index.schema.json"), "utf8")) as { properties: Record<string, unknown> };
    expect(noteSchema.properties.contract_version).toBeTruthy();
    expect(noteSchema.properties.project_id).toBeTruthy();
    expect(graphSchema.properties.nodes).toBeTruthy();
    expect(graphSchema.properties.edges).toBeTruthy();
  });
});
