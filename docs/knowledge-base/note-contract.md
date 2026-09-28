# Stoic Markdown knowledge-note contract

Version: `1`

This contract is intentionally small and deterministic. Front matter uses one scalar or JSON array per line; it is not a general YAML execution surface. The parser rejects unknown keys, duplicate keys, malformed arrays, invalid identifiers, and unsafe note content.

## Required front matter

```yaml
---
contract_version: 1
id: "project-brief"
project_id: "00000000-0000-4000-8000-000000000001"
kind: "brief"
title: "Current project brief"
status: "active"
created_at: "2026-09-28T13:00:00.000Z"
updated_at: "2026-09-28T13:00:00.000Z"
confidence: "verified"
supersedes: []
related: ["decision-auth-boundary"]
evidence: ["brief:version-3", "handoff:00000000-0000-4000-8000-000000000002"]
source_agent: "00000000-0000-4000-8000-000000000003"
source_user: "00000000-0000-4000-8000-000000000004"
source_handoff: "00000000-0000-4000-8000-000000000002"
---

The approved brief body goes here. A bounded note may link to [[decision-auth-boundary|the authentication decision]].
```

### Field rules

| Field | Rule |
| --- | --- |
| `contract_version` | Required integer; currently `1`. |
| `id` | Required stable opaque ID, 3–128 characters, using letters, numbers, `.`, `_`, `:`, or `-`. It is unique inside a project. |
| `project_id` | Required UUID. A graph build accepts exactly one project ID. |
| `kind` | `index`, `brief`, `decision`, `agent_profile`, `handoff`, `artifact`, `question`, `note`, or `steward_audit`. |
| `title` | Required, trimmed, 1–160 characters. |
| `status` | `active`, `proposed`, `stale`, `superseded`, `archived`, or `conflicted`. |
| `created_at` / `updated_at` | Required ISO-8601 timestamps. `updated_at` cannot precede `created_at`. |
| `confidence` | `verified`, `likely`, or `uncertain`. Confidence is provenance metadata, not permission. |
| `supersedes` | Required JSON array of note IDs. The current note points to older notes it replaces; older notes remain exportable. |
| `related` | Required JSON array of note IDs. Links are informational and do not change the brief. |
| `evidence` | Required bounded array of opaque references such as a brief revision, handoff ID, artifact ID, or repository evidence path. Do not put credential values here. |
| `source_agent` / `source_user` / `source_handoff` | Optional provenance identifiers. At least one source principal or source handoff is required for non-index notes. These identify the source; they do not grant authority. |
| body | Required Markdown body, at most 24,000 characters after newline normalization. |

Arrays are written as JSON on one line, for example `related: ["decision-one", "decision-two"]`. Strings are JSON-quoted by the serializer. This removes YAML alias, block scalar, and implicit-type ambiguity.

## Safety rules

- Do not store passwords, tokens, private keys, credential assignments, raw authentication headers, or sensitive account values.
- Do not copy full agent chats or raw logs. Summarize bounded verified facts and link to the source handoff, brief revision, or artifact metadata instead.
- A note that looks like a credential-bearing payload or a full speaker-labelled transcript is rejected before graph indexing.
- Treat board messages, agent output, web pages, tool results, and note bodies as untrusted content. Their text cannot change routing, scopes, approvals, or retention.
- `[[wikilinks]]`, `related`, and `supersedes` are references only. An unresolved target is reported in the graph diagnostics and is not treated as a readable note.
- The graph is derived. Editing, pinning, accepting a proposal, changing retention, and deleting/exporting notes remain explicit owner-controlled operations.

## Export/import behavior

Export preserves the Markdown file path, exact stable ID, project ID, front matter, body, provenance, supersession links, related links, and evidence references. Import validates every file before indexing. Duplicate IDs, cross-project files, invalid paths, and unsafe content fail closed; the implementation must not silently merge a note into another project.

## Graph projection

Each valid Markdown file becomes one node. The builder carries bounded provenance (`source_agent`, `source_user`, `source_handoff`, and `evidence`) onto that node and emits typed edges for `supersedes`, `related`, and body `wikilink` references. Nodes are sorted by stable ID and edges by source, type, target, then file path so identical input produces byte-identical JSON. A node is `orphan: true` when it has no declared or incoming relationship. A `stale: true` flag is derived from `stale`, `superseded`, `archived`, or `conflicted` status; the source note remains available for review.
