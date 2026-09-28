# Stoic project knowledge base

Status: the Markdown contract and deterministic graph-index slice are implemented locally. Storage, refresh scheduling, scoped MCP tools, owner controls, and the graph explorer remain separate delivery gates.

## Product boundary

Each Stoic project may have a private, exportable Markdown knowledge base. Markdown and its provenance are the source of truth. The graph index is a deterministic read-only projection; it is never an approval surface and it cannot change the authoritative project brief.

The knowledge layer is designed for the existing individual-owner workspace model. Every read and write must remain scoped to one authenticated workspace and project. Agent output, board messages, files, and source links are untrusted context. Credentials, raw logs, unrelated tenant data, and full chat histories never belong in the knowledge base.

## Logical project layout

```text
<project-id>/
  index.md
  brief.md
  decisions/
  agents/
  handoffs/
  artifacts/
  questions/
  archive/
```

The first implementation slice is filesystem/export compatible and does not add a database migration. A future persisted implementation can store the same Markdown files behind workspace-scoped Storage and retain only bounded metadata in Postgres.

## Contract and graph artifacts

- [`note-contract.md`](./note-contract.md) — human-readable Markdown/front-matter contract and safety rules.
- [`knowledge-note.schema.json`](./knowledge-note.schema.json) — machine-readable note metadata schema.
- [`graph-index.schema.json`](./graph-index.schema.json) — machine-readable derived graph schema.
- [`steward-design.md`](./steward-design.md) — bounded Knowledge Steward refresh design and owner controls.
- [`source-register.md`](./source-register.md) — reviewed evidence, confidence, and integration implications.
- `src/lib/knowledge.ts` — parser, validator, safety checks, serializer, and deterministic graph builder.

## Current implementation status

- [x] Stable note IDs, project IDs, kinds, status, provenance, timestamps, confidence, supersession, related links, evidence, and body contract.
- [x] Deterministic front-matter parser and serializer with strict unknown-field rejection.
- [x] Secret-like value and full-transcript safety findings before a note can enter the graph.
- [x] Deterministic graph nodes with bounded provenance/evidence, typed edges, unresolved-reference warnings, stale/superseded flags, and orphan detection.
- [x] Tenant/project boundary diagnostics for graph inputs and cross-project references.
- [x] Unit coverage for round trips, malformed metadata, safety boundaries, determinism, provenance, supersession, unknown references, and project isolation.
- [ ] Workspace-scoped note persistence and export/import route.
- [ ] Knowledge Steward execution and append-only refresh audit records.
- [ ] Scoped MCP list/search/read/evidence tools.
- [ ] Owner controls for cadence, source scopes, retention, pinned decisions, conflict review, export, and rebuild.
- [ ] Read-only Obsidian-style graph explorer.

## Safety invariants

1. A graph build receives one project ID and rejects notes for another project.
2. Unknown links are visible as unresolved diagnostics, not silently treated as trusted facts.
3. Supersession is represented as a typed edge and never deletes the earlier note.
4. The parser rejects secret-like credential values and transcript-like content; the owner can review a rejected source outside the knowledge layer.
5. The Steward may propose bounded summaries and graph updates only. It cannot approve actions, edit the authoritative brief, create arbitrary handoffs, or expand source scope through model text.
6. The default future refresh cadence is 08:00, 13:00, and 18:00 in the owner's local timezone, but no scheduler is enabled by this local contract slice.
