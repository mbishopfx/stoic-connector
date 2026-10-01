# Stoic Connector — Cross-Agent Connectors Research

Initial research: 2026-09-27<br>
Capability refresh: 2026-10-01<br>
Status: Provider documentation has been refreshed; implementation and live account acceptance remain separate gates.

## Research question

What does a power user need when several agent hosts—Hermes, OpenClaw, Codex, Claude, Grok, Muse, or similar clients—must stay aligned on one project without sharing full chat histories, credentials, or device authority?

This is a source-backed product direction memo, not a claim that every named provider supports Stoic or any one protocol.

## Executive readout

The strongest recurring need is not another model. It is a durable project coordination layer that keeps the following separate but connected:

- one human-owned project brief and decision record;
- one installation identity per agent host;
- provider-specific connection and schedule instructions;
- visible check-in/overdue health;
- bounded assignments, progress, blockers, results, and artifacts;
- provenance and supersession for shared facts;
- retry, reassignment, and conflict recovery;
- explicit owner approval for consequential actions;
- private credentials, chat histories, repositories, and devices that stay with their owner.

MCP is a good transport and tool interface for the current Stoic surface. It is not, by itself, a durable agent-to-agent project protocol. A future A2A adapter is worth investigating for opaque agent task exchange, but only after a real Agent Card/endpoint and capability contract are verified for the target.

## Verified source register

### 1. OpenAI Docs MCP
Source: https://developers.openai.com/learn/docs-mcp

Observed:

- OpenAI publishes a public, read-only MCP server for OpenAI developer documentation.
- The server uses Streamable HTTP at `https://developers.openai.com/mcp`.
- The page provides Codex CLI and config examples and notes use from multiple development clients.

Stoic implication:

- Users understand the value of adding a remote HTTP server to an existing host, but each host needs a clear, copy-safe setup recipe.
- A Stoic connection wizard should describe transport, authentication storage, first-check verification, and host-specific next steps rather than implying that adding a URL completes the integration.

### 2. OpenClaw MCP and automation docs
Sources:

- https://docs.openclaw.ai/cli/mcp
- https://docs.openclaw.ai/automation/cron-jobs/managing-jobs

Observed:

- OpenClaw can act as an MCP server through `openclaw mcp serve`.
- It also manages outbound MCP server definitions through a client-side registry with list/show/status/doctor/probe/add/set/configure/tools/login/logout/reload/unset operations.
- Its docs distinguish the OpenClaw MCP registry from `mcporter` configuration.
- Native automations support one-shot and recurring jobs, isolated sessions, model/thinking overrides, channel delivery, webhooks, and explicit run history/enable/disable/edit/remove operations.

Stoic implication:

- “Connected” must be split into at least: saved configuration, authenticated, first successful Stoic check, schedule configured, and currently checking in.
- The dashboard should show host-specific schedule guidance, the last successful check, expected cadence, overdue state, and recovery steps.
- Stoic should record the declared transport/host path and capability results without pretending it controls the customer's scheduler or can wake an offline agent.

### 3. Anthropic MCP connector
Source: https://docs.anthropic.com/en/docs/agents-and-tools/mcp-connector

Observed:

- Claude's Messages API can connect to multiple remote MCP servers in one request.
- The connector supports OAuth bearer authentication and allow/deny/per-tool configuration.
- The documented connector path requires public HTTPS and supports Streamable HTTP or SSE; local stdio servers cannot connect directly through that path.
- The connector feature currently supports tool calls rather than every MCP feature.

Stoic implication:

- A connector registry needs per-host transport and feature compatibility, not a single generic “MCP supported” badge.
- Tool scopes should be explicit and visible. A profile can be connected while only a safe read subset is enabled.
- Stoic should not assume that a host that can call tools can render the embedded MCP App or consume resources/prompts the same way.

### 4. MCP specification and security model
Source: https://modelcontextprotocol.io/specification/2025-06-18

Observed:

- MCP defines host, client, and server roles; JSON-RPC messaging; stateful connections; capability negotiation; resources, prompts, and tools; and utilities such as progress, cancellation, and error reporting.
- The security guidance emphasizes explicit user consent, user control over data sharing, access controls, privacy, and caution around tool descriptions and sampling.

Stoic implication:

- Stoic is appropriately positioned as a workspace-scoped coordination server with typed tools, not SQL, shell, arbitrary HTTP, or a generic agent command bus.
- Shared context must be purpose-limited and permission-checked. A project message cannot change the authoritative brief or approve its own consequential action.
- Every external/provider adapter should expose the smallest semantic scope that supports the task and retain an audit trail.

### 5. A2A specification v1.0
Source: https://a2a-protocol.org/latest/specification/

Observed:

- A2A defines agent discovery through Agent Cards and capability declarations.
- It defines send/send-streaming message operations, task get/list/cancel/subscribe operations, push notification configuration, context and task identifiers, artifacts, multi-turn interaction, idempotency, capability validation, version negotiation, authentication, and file exchange.
- The specification includes explicit guidance for interoperability, security, and the relationship between A2A and MCP.

Stoic implication:

- A2A is a candidate adapter boundary for direct interaction with opaque remote agents, while MCP remains the current control/coordination interface for host clients.
- Stoic's normalized task core should already model task/context/artifact IDs, lifecycle state, idempotency, deadlines, and delivery correlation so a future A2A adapter does not require a data-model rewrite.
- Do not claim A2A interoperability for a provider until its Agent Card, endpoint, auth, and required capabilities pass a safe probe.

## Public demand signals

These are public issue examples, not a representative market survey. They are useful because they describe concrete pain in adjacent agent tooling.

### OpenAI Codex issue #48339 — cross-account project context and handoffs
Source: https://github.com/openai/codex/issues/48339

The request describes separate accounts, devices, repositories, and private chats that need to coordinate without manual copying. The proposed MVP asks for:

- invited team projects linked to multiple repositories;
- selective sharing of chats, summaries, decisions, and artifacts;
- source links, timestamps, owners, revisions, and superseded/unverified states;
- durable agent-to-agent messages and handoffs when a recipient is offline;
- repository/commit/PR/contract/verification evidence in a handoff;
- ownership and overlap visibility;
- separate permissions for shared context, messaging, repository editing, device access, and secrets.

Stoic implication: this closely matches a project brief + append-only board + bounded handoff + artifact model, and validates making provenance, offline delivery, and authority boundaries first-class UX rather than hidden implementation details.

### Lightdash issue #29314 — project-level MCP management
Source: https://github.com/lightdash/lightdash/issues/29314

The request asks for centralized project-level MCP management so admins can audit and update servers once instead of configuring each agent independently. It specifically calls out changing authentication configuration without recreating and reattaching a server.

Stoic implication: add a project connector inventory and editable configuration metadata, while keeping secret material outside Stoic and issuing installation-scoped credentials. Configuration changes need revision history, test/probe results, and an explicit affected-agent list.

### Handoff packet issue #86
Source: https://github.com/MohitBansal321/ai-usage-mcp/issues/86

The request proposes a compact structured handoff packet containing what changed, what failed, and what is next, instead of carrying 50–200 KB of raw multi-phase history into every later phase.

Stoic implication: make a handoff packet a first-class artifact/result format. Store concise verified facts and references, not full transcripts or secrets. This reduces context cost and makes cross-host continuation more reliable.

## Product requirements derived from evidence

### P0 — next useful vertical slices

1. Connection passport / wizard
   - host/platform and installation identity;
   - transport and auth mode;
   - supported feature/capability declarations;
   - first authenticated `check_inbox` proof;
   - host-specific schedule recipe;
   - schedule configured vs last check vs overdue states;
   - recovery guidance that explicitly says Stoic cannot wake an offline host.

2. Project connector inventory
   - project-level list of connected installations and declared MCP servers;
   - provider/host, installation label, transport, auth status, tool scope, last probe/check, and config revision;
   - safe editable metadata and revocation/replacement flow;
   - no raw credentials, arbitrary callback URLs, or implied permissions.

3. Provenance-aware shared brief and handoff packet
   - approved decision, source principal, source agent, timestamp, revision, confidence/status, superseded link;
   - repo/branch/commit/PR and verification evidence when relevant;
   - `what_changed`, `what_failed`, `what_next`, constraints, artifact IDs, and required approvals;
   - clearly separate board discussion from authoritative project decisions.

4. Handoff recovery
   - stale assignment detection;
   - safe retry with idempotency and conflict response;
   - owner-approved reassignment;
   - result/attempt timeline that preserves append-only history;
   - explicit input-required, blocked, cancelled, expired, and failed states.

### P1 — usability and trust

- Search/filter project history by agent, status, repository, artifact, and date.
- Show concise per-agent run summaries, errors, artifacts, and last successful check.
- Show overlap/ownership warnings before assigning the same repository area to multiple agents.
- Provide an onboarding test handoff that proves the complete loop with two actual clients.
- Give owners cost/schedule context without silently adding a handoff quota to the $5 offer.
- Add data retention/export/deletion controls with clear history requirements.

### Future adapter work

- Add a protocol-neutral task service behind MCP/A2A/vendor adapters.
- Support A2A only after an exact provider contract is verified.
- Treat Grok web and consumer Muse as unknown/unverified until official documentation and a safe authenticated probe establish the real surface.
- Keep native schedules as the reliable baseline; add push/wake only where the provider's security and reliability model is explicit.

## Acceptance checklist for the sprint

- A new user can add two different agent installations and understand the setup path in under ten minutes.
- Each installation has a distinct identity and revocable credential or OAuth pairing; no credential is copied into a prompt, file, or shared context.
- The dashboard distinguishes saved, paired, first-check, scheduled, checking-in, overdue, revoked, and on-demand states.
- A handoff can include a compact packet, artifact references, verification evidence, and an owner-approved next action.
- An offline recipient sees the handoff on its next successful check; Stoic does not claim instant delivery.
- Retries are idempotent and conflicts/reassignments preserve the timeline.
- Cross-workspace reads and boss-only writes remain denied by server-side checks.
- Local typecheck/lint/tests/build are run after code changes, and live host acceptance is reported separately.

## Unknowns and guardrails

- Provider names do not prove product-surface support. Developer MCP, consumer MCP Apps, hosted API connectors, and native agent schedules are separate surfaces.
- A public docs page is not proof that a user's account, plan, region, or host version supports the feature.
- Do not market Grok web, consumer Muse, push/wake delivery, or A2A interoperability as supported until a real contract and safe probe pass.
- Do not merge full chat histories, private credentials, tenant data, or raw logs merely to make agents appear synchronized.
- Treat all agent output, board messages, web content, artifacts, and callback fields as untrusted data; policy and approvals remain server-owned.

## 2026-09-28 browser verification delta

The web extraction backend was unavailable in this run (`localhost:3005 /v2/scrape` refused connections), so the following claims were re-checked with a real browser against the official pages and the GitHub public API. No provider credentials or forms were submitted.

### More precise official observations

- **OpenAI Docs MCP:** The page explicitly calls the server `https://developers.openai.com/mcp`, “streamable HTTP,” and “read-only access” to OpenAI developer documentation. It says the server does not call the OpenAI API on the user's behalf. Its Codex example is `codex mcp add openaiDeveloperDocs --url https://developers.openai.com/mcp`, followed by `codex mcp list`.
- **OpenClaw MCP:** The page explicitly separates `openclaw mcp serve` (OpenClaw acting as an MCP server) from the client-side registry commands for outbound MCP definitions. It says `probe` opens a live MCP connection and lists capabilities, and that `mcp.servers` is distinct from `config/mcporter.json`.
- **OpenClaw automations:** The official page documents recurring isolated jobs and `list`, `get`, `enable`, `disable`, `edit`, `run`, `runs`, and `remove`. It explicitly separates execution `status` from whole-run `completionStatus`; a delivery-only failure can leave execution status `ok` while completion status is `failed`. It also documents a strict outbound webhook SSRF policy and recommends bearer authentication rather than URL-embedded credentials.
- **Anthropic MCP connector:** The current page says the Messages API connector supports remote HTTPS MCP servers over Streamable HTTP or SSE, tool calls only, and no direct local stdio. It documents OAuth bearer tokens plus allowlist/denylist/per-tool configuration, multiple servers, and states the connector is not covered by ZDR arrangements.
- **MCP specification:** The reviewed URL visibly identifies version 2025-06-18 and links to a newer 2026-07-28 version. The page states that hosts, clients, and servers negotiate capabilities over JSON-RPC 2.0; users must consent to data access and tool invocation; and tool annotations/descriptions are untrusted unless obtained from a trusted server. Treat the version difference as a compatibility gate.
- **A2A specification:** The official page identifies latest released version 1.0.0 and includes Agent Cards, task/message/artifact models, `send`, `get`, `list`, `cancel`, `subscribe`, streaming, push notification configuration, authentication, idempotency, and capability validation. This is a protocol contract, not evidence that a named Stoic target exposes an A2A endpoint.

### Demand-signal readback

- **Codex #48339:** GitHub API returned the open title “Cross-account team projects: shared agent context and handoffs.” The issue body asks for opt-in bounded context/messages/artifacts, provenance, offline durable delivery, ownership/overlap visibility, and distinct permissions across separate accounts/devices. It is an open enhancement request with one comment and zero reactions at read time; it is not proof of a shipped Codex capability.
- **Lightdash #29314:** GitHub API returned the open title “Manage MCP servers at the project level and update their configuration after creation.” The body asks for central project-level audit and editable auth/config instead of recreating server records. It is an open feature request, not a public Stoic-compatible contract.
- **ai-usage-mcp #86:** GitHub API returned the open title “feat: Handoff Packets for Multi-Phase Tasks (generate_handoff_packet MCP tool).” The body proposes `whatChanged`, `whatFailed`, and `whatNext` to replace large raw phase histories. The issue's claimed test details are self-reported request-body text; they were not treated as independently verified implementation evidence.

## Implementation decision for this pass

The connection-proof slice uses existing workspace-scoped fields only. `agentConnectionSummary()` in `src/lib/agent-health.ts` labels:

- auth mode from the server record without exposing OAuth IDs or key material;
- Stoic's Streamable HTTP MCP transport as product configuration;
- host posture as guided pilot, interactive-only, preview, or generic;
- schedule state as owner-declared rather than provider-verified;
- last-check evidence only when `check_inbox` has reached Stoic;
- access notes as owner declarations, never permission grants.

The dashboard renders the result before the setup steps. This is intentionally read-only and requires no migration, deployment, provider callback, or new credential. The new unit tests assert that an enabled schedule without a check remains “Awaiting first check,” and that Grok/Muse postures do not become unattended-support claims.

## Compatibility and approval gates still open

- No authenticated Codex, Hermes, OpenClaw, or Claude host run was executed in this cron pass.
- No OpenClaw `probe`, Codex `mcp list`, Anthropic Messages API call, MCP Apps host render, A2A Agent Card fetch, or live end-to-end handoff was performed.
- Grok web and consumer Muse remain unverified/preview.
- No deployment, live billing, production SMTP, production Supabase mutation, connector submission, or external communication was attempted.
- Slack delivery is scheduler-owned; this run did not invoke a send tool.

## New product direction: Obsidian-style project memory

Matt has made persistent project memory and a visual graph a first-class P0 feature. The product should provide an Obsidian-like Markdown knowledge layer for every Stoic project so Hermes, Codex, OpenClaw, Claude, and other connected agents can look back to the same approved context instead of reconstructing it from separate chat histories.

### Scope

- Store a private, exportable Markdown note set per project: index, brief reference, decisions, agent profiles, handoff packets, artifact notes, unresolved questions, and archived/superseded notes.
- Use stable IDs, front matter, wikilinks, source agent/user/handoff, timestamps, confidence/status, and `supersedes`/`related` references.
- Run an opt-in Codex-harness Knowledge Steward three times daily, defaulting to 08:00, 13:00, and 18:00 local time. Read only approved workspace-scoped Stoic context; write bounded notes, provenance/audit records, and a deterministic graph index.
- Expose scoped MCP list/search/read/evidence tools so every connected agent can reference the same current project memory.
- Add owner controls for enable/disable, source scopes, cadence, retention, pinned decisions, stale/conflict review, export, rebuild, and refresh history.
- Add an Obsidian-style read-only graph explorer with zoom/pan, search, node/edge/agent/project filters, stale/orphan indicators, and click-through to the source Markdown note and evidence.

### Safety and product boundaries

- Markdown/provenance remain the source of truth; the graph is a derived projection.
- The steward may summarize, link, mark stale/superseded, and propose updates, but it cannot change the authoritative brief, approve actions, create arbitrary handoffs, or expose secrets/full transcripts.
- Knowledge notes remain tenant-scoped and private by default. Shared artifacts receive only the same bounded permission checks as existing Stoic files.
- The feature supports the planned $10/month offer, but the existing $5 pilot/test Stripe configuration must not change during implementation.

### Acceptance gates

- Two or more agents can read the same current Markdown knowledge state through scoped MCP tools.
- A refresh run is auditable, deterministic, bounded, and clearly reports what changed, what was stale/conflicted, and what remains unknown.
- The graph can open its source note for every node and never leaks another workspace's notes.
- Export/import preserves IDs, links, provenance, supersession, and graph relationships.
- Tests cover tenant isolation, no-secret/no-full-transcript leakage, stale/superseded decisions, graph determinism, and refresh failure recovery.

## 2026-09-28 implementation delta: persistence and scoped knowledge reads

The next local vertical slice is now implemented and verified separately from provider acceptance:

- `supabase/migrations/202609270024_knowledge_base.sql` adds workspace/project composite-scoped `knowledge_notes`, owner-controlled `knowledge_settings`, and append-oriented `knowledge_refresh_runs`. Direct `anon`/`authenticated` table access is revoked; the server service role remains the only database path.
- `src/lib/knowledge-store.ts` re-validates stored Markdown before returning it, preserves the existing worker handoff/artifact access policy while resolving evidence, bounds list/search/graph reads, and never treats note text as policy or approval.
- Read-only MCP tools now cover list, literal search, source-note read, bounded evidence resolution, and deterministic graph projection. This expands the MCP coordination surface without replacing it with A2A or claiming support for unverified Grok web or consumer Muse surfaces.
- The authenticated owner route at `/api/knowledge` provides bounded note upsert and settings read/write for the future Steward/graph UI. Settings default to disabled with 08:00, 13:00, and 18:00 UTC slots; no unattended runner was enabled.
- Workspace export includes the knowledge tables, with a compatibility skip if an older deployment has not applied the optional migration yet. The public developer and privacy pages describe the new stored data and explicit runner boundary.

Evidence for this implementation slice: `npm test` passed 36 tests across 8 files; `npm run test:sql` passed with migration `202609270024` loaded into an isolated PostgreSQL cluster; `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check`, JSON parsing, and secret/trailing-whitespace scans passed. These are local implementation/database checks only. Production migration application, authenticated owner route use, MCP `tools/list`/tool calls, real host acceptance, Steward execution, and graph UI rendering remain unverified.

## 2026-10-01 provider capability refresh

The older Grok/Muse statements above describe the initial 2026-09-27 evidence pass. Current primary-source checks refine the supported setup boundary:

- [Grok Connectors](https://docs.x.ai/grok/connectors) documents custom MCP connectors at `grok.com/connectors` for interactive conversations. [Grok connector management](https://docs.x.ai/grok/connector-management) says Business and Enterprise admins may need to provision a connector for their organization. Stoic has no verified Grok unattended inbox schedule or authenticated end-to-end account test, so the app now labels Grok as interactive-first.
- [Gemini CLI MCP server docs](https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md) document remote Streamable HTTP, custom HTTP headers, and `gemini mcp add`. The documented header option is a static value in local settings; Stoic's setup prompt tells the owner to enter the bearer key directly into a private user configuration and avoids putting it in shell history or project-shared settings. No unattended Gemini schedule is claimed.
- [Meta's Muse announcement](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/) describes a dedicated browser environment and secure credential storage. It does not establish a generic Stoic MCP connector or verify that a recurring task in a specific Muse account can operate Stoic's browser workflow. Muse therefore remains a separately supervised browser relay; the prompt can suggest a three-times-daily routine only when the user visibly configures a recurring task in that account.

These findings justify provider-specific connection prompts while preserving one agent-neutral Stoic workspace model. A documented transport is not the same as a successful Stoic login, an inbox check, or a verified recurring run.
