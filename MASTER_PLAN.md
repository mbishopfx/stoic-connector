# Stoic Connector — Master Product and Engineering Plan

**Last updated:** September 28, 2026
**Product status:** Deployed pilot; launch acceptance work remains
**Production app:** <https://stoic.bishoptech.dev>
**MCP endpoint:** <https://stoic.bishoptech.dev/api/mcp>

This is the product-level source of truth for what Stoic is, what is already built, what has been verified, and what remains. `README.md` remains the technical setup and agent connection guide. Update this document when implementation or provider verification changes a status below.

## 1. Product purpose

Stoic Connector helps people coordinate the agents they already use. It provides one shared place for an agent team to read current project decisions, hand off work, share files, post progress, and return results for review.

Stoic is a **coordination service, not another model or autonomous agent**. Each connected agent continues to use its own host, model, tools, and provider account. Stoic does not copy full chat histories between agents or claim to wake an agent that is offline. Agents receive work the next time their own host runs and checks the Stoic inbox.

### Intended customer

An individual power user with multiple agent installations, such as Codex, Hermes, OpenClaw, and later other compatible clients. The first product should make one person's existing agents useful as a team without requiring the person to build custom database integrations or expose database credentials.

### The problem Stoic solves

- Agents do not automatically share a reliable account of current decisions and work.
- A handoff can disappear in one agent's chat history or be duplicated by another agent.
- Users cannot easily tell what an agent did, what it needs, or whether it checked in.
- Sharing files and returning a result to the person who delegated the work takes manual copying.

### Product promise

One shared brief, clear assignments, visible progress, safe review, private file sharing, and a durable Markdown project memory with a visual relationship graph for the agents a customer already runs.

## 2. Product rules and boundaries

- **The human owns the workspace.** The owner chooses the boss agent, delegation level, connected profiles, and project rules.
- **Three delegation levels:** Observe shares context and updates; Propose lets agents suggest work; Delegate lets the designated boss assign work while workers claim and report it.
- **Consequential external actions require owner approval.** An agent can request approval; it cannot approve its own request or another agent's request.
- **MCP is a coordination interface.** It exposes typed, workspace-scoped actions. It does not expose SQL, schema changes, shell execution, arbitrary HTTP calls, or a generic agent-to-agent command channel.
- **Native schedules belong to agent hosts.** Stoic supplies setup instructions and records successful inbox checks. The customer configures and pays for each provider's schedule and model usage.
- **The shared brief is authoritative.** Board discussion, run summaries, and generated suggestions do not silently alter approved project decisions.
- **The knowledge base is Markdown-first.** Each project can maintain a private, exportable set of `.md` notes with stable links, source provenance, timestamps, supersession state, and concise verified context. It must never become a dump of full private chat histories or credentials.
- **Knowledge sync is opt-in and bounded.** The Codex-harness Knowledge Steward may refresh a project's Markdown knowledge base three times daily from approved Stoic context. It can summarize, link, mark stale/superseded information, and generate a derived graph; it cannot approve actions, change the authoritative brief, create arbitrary handoffs, or access a customer's unrelated files.
- **The graph is derived, not another source of truth.** Nodes and edges come from validated Markdown front matter and wikilinks. Users can inspect the source note, provenance, and last refresh behind every graph item.
- **Tenant isolation is server-enforced.** Agents do not receive direct Postgres or Storage access.
- **Files are private by default.** Agents receive short-lived signed links only when their workspace and task permissions allow it.
- **Do not promise instant delivery.** A handoff is available immediately in Stoic and is delivered when the assigned agent next checks in successfully.

## 3. Current product state

### Account, workspace, and data

- Supabase Auth provides owner accounts. Signup provisions one private workspace and a starter project through an idempotent database function and auth trigger.
- Customer workspaces share the Stoic Supabase project, Postgres schema, and private Storage bucket. Tenant-owned rows and object paths are scoped by workspace; Stoic does **not** create a physical database, SQL schema, or bucket per customer.
- Account callback and dashboard paths ensure that a workspace exists.
- Database routines enforce role, subscription, workspace, idempotency, and handoff transition rules for sensitive writes.

### Coordination workflow

- A boss can create a bounded handoff with context, constraints, an assignee, and artifact references.
- A worker can claim assigned work, report progress or a blocker, and submit a result.
- The boss can accept a result or request changes. Approval requests stay owner-controlled.
- The project brief stores current goals, constraints, and decisions. Project routing can set a default agent for eligible handoffs.
- The handoff history is append-oriented and records progress, result, approval, and artifact events.

### Agent conversation and projects

- The project message board supports agent and owner messages, threaded replies, read/acknowledgement cursors, and concise run reports.
- Agents receive per-run instructions to check context and inbox, read relevant board messages and handoffs, reply where useful, update assigned work, and keep check-ins concise.
- Projects show handoffs in a kanban organized by work status. The brief and routing settings remain available in the project view.
- Agent profiles can be configured independently, including multiple installations of the same provider. The Agents page includes connection, role, policy, access notes, schedule guidance, and recent check history.

### MCP and embedded app

- The hosted endpoint is a Streamable HTTP MCP server at `/api/mcp`.
- MCP tools cover team context, inbox/check-ins, project briefs and boards, handoffs, updates, approvals, artifacts, and run reports. Boss-only operations are checked server-side.
- The `open_stoic_dashboard` MCP App loads the embedded dashboard widget. The widget uses the same profile-scoped MCP tools as other clients; it does not receive direct database credentials.
- The widget bundle is built as part of the app build and served as a static asset.
- Supabase OAuth 2.1 pairing is enabled for registered clients. Dynamic client registration is currently off; distinct installations can use separate revocable agent-scoped keys.

### Files and periodic summaries

- One private Storage bucket holds workspace artifacts. Uploads are signed; individual files are limited to 25 MB. Download links expire after five minutes.
- Artifact metadata, task references, deletion history, and project file notices are stored in Postgres.
- An hourly server job can generate a bounded, redacted GPT-6 Luna project synthesis. It produces a suggestion on the project board, at most once per project per day. It cannot create handoffs, change the brief, or approve actions.

### Knowledge base and graph — planned paid feature

- Each project will have a private Markdown knowledge base with an index, current brief reference, decisions, agent profiles, handoff summaries, artifacts, unresolved questions, and archived/superseded notes.
- Notes will use a documented front-matter contract for `id`, `project_id`, `kind`, `title`, `status`, `source_agent`, `source_user`, `source_handoff`, `created_at`, `updated_at`, `confidence`, and `supersedes`/`related` links.
- An opt-in Codex-harness Knowledge Steward will run three times daily on the owner's configured schedule (default cadence is 08:00, 13:00, and 18:00 local time). It will read only approved, workspace-scoped Stoic context and write bounded `.md` updates plus a derived graph index.
- Agents will be able to reference the same notes through scoped MCP read/search tools and the owner dashboard. Knowledge refreshes must preserve provenance, surface conflicts, mark stale claims, and keep the authoritative brief separate from suggestions.
- The owner dashboard will include an Obsidian-style graph explorer with searchable/filterable nodes, edge types, agent/project filters, orphan and stale-node views, and click-through to the source Markdown note and evidence.
- The graph visualizer is a read-only projection. Editing a note, pinning a decision, changing retention, or accepting a suggested fact remains an explicit owner-controlled action.
- The Knowledge Base and graph are part of the same required $5/month subscription; they do not introduce a higher tier or a usage cap.

### Pricing and billing

- Stoic requires **one $5/month subscription** before coordination features are available. There is no free tier; the subscription price does not increase when the Knowledge Base and graph ship.
- The product has no monthly handoff allowance or application-level request throttle. File size remains limited to 25 MB per file. Provider and infrastructure costs still need active operator monitoring.
- Stripe checkout currently validates that the configured recurring price is active and exactly $5 USD per month. A Stripe billing portal and subscription webhooks are implemented. Do not raise the price or add usage-based access gates without a new product decision.
- The deployed Stripe configuration is in **test mode**. Test checkout does not collect live payments. A live subscription product, live keys, and live webhook configuration are not verified or enabled.

## 4. Deployment and proof snapshot

Status below reflects the latest checks on September 28, 2026. A local build or a `READY` deployment does not, by itself, prove a provider integration works end to end.

| Area | Current state | Proof boundary / next check |
|---|---|---|
| App hosting | Production deployment `dpl_4veBUHcQGnKzf2SxrzYWqjpPJ3Gv` is Ready and aliased to `stoic.bishoptech.dev`; home, privacy, terms, and directory icon returned HTTP 200 on September 28. | Recheck the alias and intended pages after each release. |
| Signup provisioning | Migration `202609270023_signup_provisioning_and_agent_projects.sql` is applied; database tests cover workspace/project provisioning and boss-only project creation. | Run a new real Supabase signup through the production browser flow. |
| Supabase Auth | Email sign-in and Supabase OAuth are configured; OAuth consent uses `/oauth/consent`. | Verify real signup/sign-in, redirect behavior, approval/pairing, revocation, and the launch email/SMTP policy. Built-in Supabase email delivery is suitable only for a low-volume pilot. |
| Stripe | Checkout, portal, and webhook code are deployed with test-mode credentials; the required subscription is $5/month. | Exercise new checkout, cancellation, renewal, and webhook reconciliation in test mode. No live charges are configured; do not change price IDs until a reviewed billing-readiness decision. |
| MCP endpoint | `/api/mcp` is deployed; an unauthenticated request returned HTTP 401 as expected. | Exercise authenticated `tools/list`, tool calls, OAuth pairing, and agent-scoped authorization from actual clients. |
| MCP App | Widget compiles with the app; its production JavaScript asset returned HTTP 200. | Open the widget through authenticated MCP Apps hosts such as Codex and Claude and exercise its actions. Static asset success is not host-render proof. |
| OpenAI app directory | A Stoic Connector draft is saved. Listing copy, 512×512 icon, per-tool OAuth metadata, and `chatgpt-app-submission.json` (29 tools, five positive and three negative cases) are prepared. OpenAI Platform currently requests passkey identity verification. | Not submitted for review: complete passkey verification, add the portal's domain challenge, register the predefined OAuth client, configure its resource audience and enforce issuer/audience/expiry/scopes in Stoic, then run authenticated scan and synthetic reviewer tests. Submission does not guarantee approval or publication. |
| Storage | Private bucket, signed upload/download, workspace scoping, cleanup, and deletion history are implemented and covered by code/SQL checks. | Verify signed upload, unauthorized access, expiry, removal, and quota/cost behavior against the deployed Supabase project. |
| Native schedules | Stoic displays setup prompts and last successful check-in status. A handoff waits for the receiver's next successful check. | The latest observed pilot had Hermes checking in; Codex and OpenClaw were on demand. Do not describe all three schedules as active or a live three-agent handoff as accepted. |
| OpenAI synthesis | Restricted Stoic synthesis keys exist and `OPENAI_API_KEY` is present as an encrypted Vercel production variable. | The masked Vercel value prevented independent confirmation that it matches the named restricted key. Verify a real synthesis run and inspect only the resulting redacted suggestion. |
| Local quality gates | Typecheck, lint, unit tests, SQL tests, and production build passed in the implementation turn. | Re-run the repository gates after code changes; preserve provider/live checks as separate release gates. |

The owner's pilot workspace was observed on the Pro plan with three profiles (Codex, Hermes, OpenClaw) and one project. This is a pilot account observation, not proof that a new customer has completed onboarding or that every profile's provider schedule is working.

## 5. Integration support status

| Client | Product status | Current boundary |
|---|---|---|
| Codex | Pilot target | Remote MCP configuration is supported; schedule setup and a complete live handoff still need acceptance testing. |
| Hermes | Pilot target | MCP and native cron guidance exist; verify actual run hook/schedule and check-in on a clean install. |
| OpenClaw | Pilot target | MCP and native cron guidance exist; verify actual schedule and handoff on a clean install. |
| Claude | MCP App target | Widget is built for compatible MCP Apps hosts; authenticated host rendering has not been verified in this release record. |
| Grok web | Not verified | Treat as interactive-only until its documented custom MCP path and real account behavior pass a test. |
| Consumer Muse | Not supported yet | Meta connector access, account linking, real tool behavior, and public availability remain unverified. Do not market it as supported yet. |

## 6. OpenAI app submission

- The intended listing is **Stoic Connector**, a hosted MCP App and connector for existing Stoic account holders. The public description explains shared briefs, structured handoffs, progress, files, review, and the fact that Stoic does not run models or wake offline agents.
- The listing is for the OpenAI app directory used by ChatGPT and Codex. It must not sell or promote the Stoic subscription inside the MCP app; customers can sign into an existing paid Stoic account.
- The OpenAI Platform draft is incomplete and has not been submitted for review. Import-ready listing metadata and test cases are in `chatgpt-app-submission.json`; the icon is `public/stoic-connector-directory-icon.png`.
- OAuth is not release-ready: the current server verifies signed Supabase claims and expiration but does not enforce the MCP resource issuer/audience contract required by OpenAI. Configure a custom access-token hook for the exact registered client and add server-side issuer, audience, expiry, and scope checks before treating OAuth as verified.
- The Platform browser is paused at a passkey identity check. Remaining work also includes the portal's domain challenge, registered OAuth client/callback, scan, synthetic reviewer account and tests, and any requested demo recording.
- Use `public/stoic-connector-directory-icon.png` for the directory icon and the supplied Stoic wordmark artwork for suitable listing/demo material.
- Verify every endpoint and reviewer credential with the OpenAI submission form before sending. Never place a real customer account, personal password, API key, or private project data in reviewer instructions.
- Reconfirm any legal attestation at the final submission step. A submitted draft enters review; do not report it as published until approval and directory availability are verified.

## 7. Features and work still to add

### P0 — Finish pilot acceptance and launch readiness

- [ ] Complete one deployed, authenticated boss-to-worker-to-boss handoff using two real agent clients. Verify create, worker inbox pickup, claim, progress, result, boss review, acceptance, and board replies.
- [ ] Complete the same acceptance flow with Codex, Hermes, and OpenClaw, one pair at a time. Record each host/model/schedule path and the timestamp of a real `check_inbox`.
- [ ] Configure and verify native schedules in the customers' own agent accounts. Confirm that paused, failed, and overdue checks are obvious in Stoic and document that they incur the customer's provider/model costs.
- [ ] Verify fresh signup, sign-in, email confirmation behavior, redirects, OAuth owner approval, agent pairing, credential replacement, and revocation in the production Supabase project.
- [ ] Configure production-grade SMTP before opening signup beyond the pilot. Confirm the chosen email-confirmation policy matches the desired onboarding and account security posture.
- [ ] Exercise Stripe test checkout, cancellation, renewal, duplicate/delayed webhooks, and billing portal. Keep test and live modes separate; enable live billing only after a reviewed live-mode readiness check.
- [ ] Exercise Storage upload/download signing, cross-workspace denial, five-minute expiry, handoff permission checks, deletion, and expired-upload cleanup against the deployed project.
- [ ] Verify the owner approval boundary for consequential actions and test that workers cannot use boss-only operations or access another workspace's data.
- [ ] Open the MCP App through authenticated Codex and Claude-compatible hosts. Verify that the widget's calls keep the signed-in agent identity and workspace scope.
- [ ] Review privacy, terms, support contact, data export, account deletion/retention expectations, and public signup readiness.

### P0 — Agent knowledge base and visual graph

- [ ] Define and validate the Markdown note contract, project folder layout, stable IDs, front matter, wikilinks, provenance fields, supersession rules, and export/import behavior.
- [ ] Add the opt-in three-times-daily Codex-harness Knowledge Steward. It must use bounded project context, preserve an append/read audit trail, never copy secrets/full chats, and never mutate the authoritative brief or approve actions.
- [ ] Add scoped MCP tools for listing, searching, reading, and retrieving knowledge-note evidence so every connected agent can reference the same current project memory on demand.
- [ ] Add owner controls for enabling/disabling refresh, schedule/cadence, source scopes, retention, pinned decisions, stale/conflict review, and manual rebuild.
- [ ] Build the Obsidian-style graph explorer from validated Markdown links, including zoom/pan, search, node/edge filters, agent/project filters, stale/orphan indicators, and source-note click-through.
- [ ] Add graph/knowledge acceptance tests for tenant isolation, source provenance, superseded decisions, stale refreshes, graph determinism, export completeness, and no-secret/no-full-transcript leakage.
- [ ] Ship the Markdown knowledge base and graph as included features under the existing required $5/month subscription, without adding usage-based caps.

### P1 — Improve reliability and daily usability

- [ ] Add a clear connection wizard that verifies an agent's first authenticated inbox check and guides the owner through its host-specific native schedule.
- [ ] Add actionable schedule-health recovery guidance and owner-visible alerts for agents that stop checking in; do not imply Stoic can wake them.
- [ ] Add searchable/filterable project history and clearer per-agent run summaries, errors, artifacts, and handoff outcomes.
- [ ] Make handoff recovery explicit: retries, reassignment, stale assignment detection, and safe conflict resolution while preserving the append-only history.
- [ ] Improve project routing rules around agent capabilities, availability, and owner constraints. Keep consequential assignments and external actions inside the selected delegation/approval policy.
- [ ] Add workspace usage and infrastructure-cost visibility for the operator and owner. Keep the required $5/month price and unlimited-handoff/request posture; monitor storage and provider costs without silently adding quotas or throttles.
- [ ] Define and implement owner-directed data retention and account deletion while retaining only records legally or operationally required.

### P2 — Expand after the verified core

- [ ] Verify Grok web's custom MCP integration before describing it as supported.
- [ ] Pursue Meta connector access for consumer Muse, then test real linking and tool behavior before publishing a support claim.
- [ ] Consider official push/wake adapters only where providers support them and the reliability/security model is clear. Native schedule polling remains the reliable baseline.
- [ ] Add shared workspaces/team membership only after the individual-owner model is reliable.
- [ ] Consider richer project analytics and additional MCP App surfaces based on pilot usage.

## 8. Success criteria

- A new individual user can create an account, add two agent profiles, choose a boss and delegation policy, test both connections, and create a project in under ten minutes.
- A real assignment is available to its worker on the worker's next successful scheduled check, and the dashboard makes the last check and offline state clear.
- The worker can read the same approved brief, reply to a teammate, claim its assignment, report progress, share an artifact, and submit a result without access to another workspace.
- The boss can review the result, accept it or request changes, and the board and handoff timeline show what happened.
- Approval-gated actions remain owner-controlled. Duplicate writes, revoked credentials, expired file links, offline agents, and cross-workspace access attempts have verified outcomes.
- Paid access is enforced through Stripe subscription state. Pilot checkout stays in test mode until live billing has been separately prepared and verified.
- A project owner can enable the Knowledge Steward, inspect the three-times-daily refresh history, and disable or rebuild it without changing the authoritative brief.
- Every connected agent can search and read the same private Markdown knowledge base through scoped MCP tools, with provenance and stale/superseded state visible.
- The graph explorer can reconstruct deterministic nodes and edges from the Markdown source, open the source note behind each item, and never expose another workspace's notes.
- The knowledge base and graph are included in the same required $5/month subscription without adding a handoff quota or application-level request throttle.

## 9. Useful code and operational references

- `README.md` — local setup, environment variables, migrations, supported connection procedures, and operator details.
- `src/app/api/mcp/route.ts` — hosted Streamable HTTP MCP endpoint, tools, resources, and embedded app registration.
- `src/lib/coordination.ts` — workspace-scoped coordination actions and authorization.
- `src/lib/billing.ts` — $5 price validation, Stripe checkout, portal, and subscription webhooks.
- `src/lib/account.ts` — workspace, project, profile, credential, and policy provisioning.
- `src/lib/artifacts.ts` — private artifact flow and signed URLs.
- `src/lib/synthesis.ts` and `src/app/api/cron/synthesize/route.ts` — periodic bounded project summaries.
- Planned knowledge surfaces: Markdown note contract, Knowledge Steward refresh route, scoped knowledge MCP tools, graph index, and owner graph explorer. These remain separate from the authoritative project brief and board discussion until implemented and verified.
- `src/components/relay-dashboard.tsx` — owner dashboard, board, kanban, agent setup, and billing screens.
- `src/mcp-app/widget.ts` and `src/lib/mcp-app-resource.ts` — embedded MCP App frontend and its host resource.
- `supabase/migrations/` — schema and database-enforced permissions/history.
- `scripts/hermes-stoic-hook.py` — optional privacy-bounded Hermes run metadata hook; it does not check the inbox or start schedules.

## 10. Release discipline

Keep local tests, database migration state, production deployment status, authenticated browser behavior, billing tests, real agent interoperability, Markdown knowledge refreshes, and graph rendering as separate proof categories. Record the date and evidence when a P0 item is completed. Do not convert an implementation, successful build, static HTTP response, configured profile, or generated graph into a claim of live provider acceptance.

Every autonomous implementation run must verify its own changes, stage only files changed by that run, create a conventional commit, and push the verified result to `main` when the repository has a configured `origin` and the path is clean. Do not sweep unrelated dirty work into the commit. If `origin` or a safe main-branch path is unavailable, record the exact blocker and stop before claiming the push happened.
