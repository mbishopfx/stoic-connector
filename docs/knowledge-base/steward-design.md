# Knowledge Steward design

Status: the server-owned settings and append-only refresh-run schema are implemented locally, but no scheduled worker or production refresh is enabled. Candidate generation and refresh execution remain a later gate.

## Purpose

The opt-in Codex-harness Knowledge Steward keeps one project's bounded, owner-approved context available to connected agents without merging private agent memories. It refreshes Markdown notes and a derived graph index; it does not become a second boss, a general-purpose worker, or an approval mechanism.

## Default cadence

- 08:00 local time
- 13:00 local time
- 18:00 local time

The owner controls enable/disable, timezone, cadence, source scopes, retention, pinned decisions, stale/conflict review, manual rebuild, export, and refresh-history visibility. A future scheduler must read those settings from server-owned state; model text cannot change them.

## Bounded inputs

Allowed by explicit project scope:

- current project brief and version;
- approved decision records;
- concise board/run-report excerpts selected by server policy;
- handoff summaries, result metadata, and artifact metadata;
- agent profile and check-in metadata needed for provenance;
- prior validated knowledge notes needed for supersession/conflict detection.

Not allowed:

- full chat histories or raw logs;
- credentials, access tokens, private keys, authentication headers, or secrets;
- unrelated projects, workspaces, repositories, devices, or personal files;
- arbitrary URLs, shell commands, SQL, or model-selected callbacks;
- silent changes to the authoritative brief, routing, approvals, billing, or retention policy.

## Refresh state

A refresh record in `knowledge_refresh_runs` includes a stable ID, workspace/project IDs, scheduled slot, started/completed timestamps, source-scope revision, input fingerprint, note IDs created/updated/marked stale, conflict IDs, unresolved references, safety findings, bounded output counts, and final status (`completed`, `partial`, `failed`, `cancelled`). The table is append-oriented and keeps the raw model response out of it.

The refresh table is unique on `(workspace_id, project_id, scheduled_slot, source_scope_revision, input_fingerprint)`. A future runner must use that key so a retry does not duplicate a run record. The server owns the request fingerprint, note paths, graph output path, and retention decisions.

## Steward sequence

1. Load the enabled project configuration and verify the workspace/project boundary.
2. Snapshot only approved sources and compute bounded fingerprints.
3. Generate candidate summaries using a dedicated low-privilege Steward profile.
4. Validate every candidate as a Markdown note with the local contract and safety checks.
5. Compare IDs, provenance, timestamps, supersession, conflicts, and project IDs against the existing set.
6. Write only accepted bounded notes and an append-only provenance record.
7. Rebuild the deterministic graph index from validated Markdown, never from model output alone.
8. Publish counts and diagnostics to owner-visible refresh history; require owner review for conflicts and proposed decisions.

A failed refresh leaves the last valid note set and graph available. It does not delete notes or rewrite the authoritative brief.

## Acceptance gates

- Disabled projects produce no refresh mutation.
- Source scopes are server-owned and cannot be expanded by a note, prompt, or tool result.
- A note from another workspace/project is rejected before storage or graph indexing.
- A secret-like value or transcript-like body is rejected and recorded only as a redacted safety finding.
- Re-running against the same source fingerprint produces the same note bytes, graph bytes, IDs, and edge ordering.
- Stale, conflicted, and superseded notes remain inspectable and carry provenance.
- Owner export contains Markdown plus graph/provenance metadata without raw credentials or full chats.

## Implemented server boundary

- `POST /api/knowledge` with `action: "upsert_note"` validates and stores one bounded Markdown note for the authenticated owner. It rejects cross-project IDs, unsafe paths, credential-like values, and transcript-like bodies before persistence.
- `POST /api/knowledge` with `action: "update_settings"` changes only the owner-controlled enabled flag, timezone, slots, source scopes, retention, and pinned note IDs. Model or note text cannot expand these fields.
- `GET /api/knowledge?projectId=...` returns the validated note summaries, deterministic graph projection, settings, and the latest bounded refresh records for the owner.
- The MCP endpoint exposes read-only list/search/read/evidence/graph tools. Evidence resolution retains the existing worker handoff and artifact access boundary; unknown references remain unresolved.
- The workspace NDJSON export includes knowledge notes, settings, and refresh records. It does not export credential hashes, Storage paths, full chats, or model responses.
