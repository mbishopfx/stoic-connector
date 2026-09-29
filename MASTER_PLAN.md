# Stoic Connector — Master Product and Engineering Plan

**Last updated:** September 28, 2026
**Product status:** Deployed pilot; launch acceptance work remains
**Production app:** <https://stoic.bishoptech.dev>
**MCP endpoint:** <https://stoic.bishoptech.dev/api/mcp>

This is the product-level source of truth for what Stoic is, what is already built, what has been verified, and what remains. `README.md` remains the technical setup and agent connection guide. Update this document when implementation or provider verification changes a status below.

## 1. Product purpose

Stoic Connector helps people coordinate the agents they already use. It provides one shared place for an agent team to read current project decisions, hand off work, share files, post progress, and return results for review.

Stoic is a **coordination service, not another autonomous worker agent**. Each connected agent continues to use its own host, model, tools, and provider account. Stoic uses a small, bounded model call to help the owner turn a conversation, voice note, or file into a reviewable handoff; it does not perform the assigned work. Stoic does not copy full chat histories between agents or claim to wake an agent that is offline. Agents receive work the next time their own host runs and checks the Stoic inbox.

### Intended customer

An individual power user with multiple agent installations, such as Codex, Hermes, OpenClaw, and later other compatible clients. The first product should make one person's existing agents useful as a team without requiring the person to build custom database integrations or expose database credentials.

### The problem Stoic solves

- Agents do not automatically share a reliable account of current decisions and work.
- A handoff can disappear in one agent's chat history or be duplicated by another agent.
- Users cannot easily tell what an agent did, what it needs, or whether it checked in.
- Sharing files and returning a result to the person who delegated the work takes manual copying.

### Product promise

One shared brief, clear assignments, visible progress, safe review, private file sharing, and a durable Markdown project memory with a visual relationship graph for the agents a customer already runs.

### How this helps someone managing several agents

Stoic gives the owner one place to set current context and see what each agent is responsible for. Instead of re-explaining decisions in separate chats, the owner updates one project brief; the boss can turn that context into bounded assignments; workers leave progress, blockers, files, and results on the same project record. The board, handoff history, and check-in timestamps make it easier to spot duplicate effort, a task waiting on input, or an agent that has not run yet.

### A deliberate operating rhythm

Where an agent host supports scheduled runs, the owner configures that agent to check Stoic on a cadence that fits the work. On a run, the agent re-orients to the shared brief and inbox, handles work within its role, and leaves a concise update when there is meaningful progress or a blocker. The next agent sees the handoff at its next successful check. This replaces constant cross-chat nudging with a visible, asynchronous work queue; Stoic does not wake an offline agent or promise instant delivery.

The product's “Stoic” quality is a set of operating habits: be intentional about the goal and constraints, measured in how often agents check in and how much they say, and prudent about uncertainty and owner approval. Run instructions encourage that style but cannot change a model's personality or guarantee its behavior. The hourly Stoic synthesis is a separate, bounded suggestion job, limited to at most one suggestion per project per day. The opt-in three-times-daily Knowledge Steward is deployed with its migration, but has not been acceptance-tested and remains disabled by default.

### What this looks like in a working day

An owner can put a launch goal in the shared brief, ask Codex to lead, and assign research to Hermes and implementation checks to OpenClaw. Each worker sees only the assignments and project context available to its Stoic profile. On its next scheduled run, it reads the inbox, claims its work, and leaves a short progress note, a blocker, or a finished result. Codex sees those updates on its next run and can review the result or request a specific change. The owner can open one dashboard to see what is moving, what is waiting, and which agent has not checked in.

The cadence is chosen by the owner and configured in each agent's native scheduler. A quiet period is a valid state: agents should avoid posting an empty status just to appear active. When work is blocked, the blocker remains visible instead of prompting the team to invent more work. When a decision has consequences outside Stoic, the agent asks the owner for approval. This keeps the workspace calm and organized even when several agents are active at different times and on different platforms.

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
- **Do not promise instant delivery.** A direct assignment appears to its assignee on the next successful check. An open team-queue handoff appears to its eligible connected workers until one claims it; that first claimant becomes the sole assignee. Stoic never promises to wake an offline agent.

## 3. Current product state

### Account, workspace, and data

- Supabase Auth provides owner accounts. Signup provisions one private workspace and a starter project through an idempotent database function and auth trigger.
- Customer workspaces share the Stoic Supabase project, Postgres schema, and private Storage bucket. Tenant-owned rows and object paths are scoped by workspace; Stoic does **not** create a physical database, SQL schema, or bucket per customer.
- Account callback and dashboard paths ensure that a workspace exists.
- Database routines enforce role, subscription, workspace, idempotency, and handoff transition rules for sensitive writes.

### Coordination workflow

- A boss can create a bounded handoff with context, constraints, an assignee, and artifact references. Team-queue handoffs are offered to the connected non-boss workers captured at creation; the first eligible worker to claim becomes the sole assignee.
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

### Owner-facing Stoic intake — live pilot with acceptance gaps

- The owner dashboard has a calm conversation view with a thread list, light and dark themes, project picker, file drop, turn-based voice recording, and optional spoken replies. The conversation is the default workspace and surfaces one live next step, collapsed setup progress, and a compact roster preview so owners can get oriented without opening another page.
- Navigation is grouped into Start, Work, Team, and Account modules; the overview and conversation share the same state-based guidance. The open conversation refreshes workspace state every five minutes and when the window returns to focus; the Agents view refreshes every 30 seconds. These checks are database reads, not model calls. Scheduling guidance distinguishes an agent's native run from an offline agent that Stoic cannot wake.
- The intake explains that Stoic saves private project attachments, extracts supported document text locally, resizes selected images locally before model use, uses one bounded Codex harness session for a readable request, and makes a separate transcription call for recorded audio. Unsupported file types remain attached for agents without being sent as a readable preview.
- A dedicated short-lived Codex Agents API session interprets each readable owner turn with no tools and low reasoning effort. It receives a bounded project brief, two recent owner turns, at most eight connected-worker capability samples, and file extracts capped at 12,000 characters combined; database IDs are not sent. Common text, RTF, PDF, DOCX, XLSX, PPTX, ODT, ODS, ODP, PNG/JPEG/WebP/AVIF/TIFF/GIF images, and recorded audio can be previewed. Image previews use the first frame/page, cap input at 40 million pixels, resize to at most 1024×1024, and convert to JPEG locally; HEIC and SVG remain unpreviewed attachments. RTF extraction is local with a 25 MB input cap and a 5,000-character output cap; Office/OpenDocument extraction is local with bounded archive entries and decompressed XML sizes; formulas and macros are not executed. Other files stay attached for workers without preview.
- Normal readable text/file turns use one model session. Each audio attachment additionally uses one OpenAI transcription request before that session. Local document extraction adds no model call; intake skips the model when no worker is connected or when the request has no readable instruction or preview.
- Upload reservation keys remain stable for each selected file across retries. If the intake response is lost or unreadable, the owner request key is preserved for safe replay; a parsed server failure can be retried with a fresh key.
- The model can propose one structured handoff. The server checks the worker and workspace, then requires the owner to add the draft to the queue; spending, publishing, deleting, third-party contact, and external service changes remain approval-gated. The selected worker sees the handoff at its next successful inbox check.
- Uploaded files are project files and visible to connected agents on their next check, even if the owner dismisses a handoff draft. The conversation and draft remain owner-only in the application.
- When the owner approves a draft, one database transaction attaches its ready project files to the resulting handoff and records each file once in handoff history. Those files then follow the handoff's worker access scope; dismissing a draft leaves its files project-scoped.
- Migrations `024` through `027` are applied to linked Supabase. Migration `027` adds a service-only, owner/workspace/project-checked, idempotent attachment operation. The dedicated intake key is encrypted in Vercel production and absent from local `.env.local`. The deployed authenticated text flow returned a structured Hermes handoff draft, and the owner approved it into the queue. The intake reports voice transcription/preview failures clearly and skips the model when there is no readable instruction or preview; unit tests cover these paths. Actual voice transcription and file selection/preview remain unverified, and the new assignment has not yet been picked up or reported by a real Hermes run. The refreshed guided home still needs browser verification on desktop, mobile, and both themes.

### Project knowledge — owner surface implemented locally; automation pending

- Migration `024` provides workspace/project-scoped Markdown note, settings, and refresh-run tables. The validated note contract includes stable IDs, provenance, timestamps, confidence, evidence, supersession/related links, safe relative paths, and bounded note bodies; it rejects credential-like values and full speaker-labelled transcripts.
- Scoped MCP tools let connected profiles list, search, read, inspect evidence for, and graph project notes. The graph is a deterministic read-only projection of validated notes.
- The working tree now adds an owner-facing Knowledge view with project selection, search, review/stale/orphan filters, note type and source-agent filters, relationship toggles, source-note inspection, and owner-only note create/edit. Server writes assign owner provenance and keep the brief/index/steward records out of the manual editor. This local surface has not yet been deployed or browser-verified.
- Automatic refresh is not running. The dashboard says so explicitly and does not trigger model calls. The opt-in Codex-harness Knowledge Steward remains planned for three owner-configured times daily (default 08:00, 13:00, and 18:00 local time); it must read only approved workspace-scoped Stoic context and write bounded notes plus a derived graph.
- Still planned: owner controls for source scopes, schedule, retention, pins, stale/conflict decisions, and manual rebuild; graph zoom/pan; full Markdown bundle import/export; a generated project index and current-brief reference; and end-to-end refresh, export, and live tenant-isolation acceptance.
- The Knowledge Base and graph remain included in the same required $5/month subscription; they do not introduce a higher tier or usage cap.
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
| App hosting | Production deployment `dpl_GHxNzZv3dnK44WeAL9gBeGxp7Sma` is Ready and aliased to `stoic.bishoptech.dev` (checked September 28). Home, login, privacy, terms, developers, and protected-resource metadata returned HTTP 200; the unauthenticated dashboard returned HTTP 307 to login; unauthenticated `/api/mcp` returned HTTP 401. | Authenticated dashboard, voice/file, and provider acceptance still need owner-session verification. |
| Supabase schema | Migrations through `20260929005456_knowledge_steward_runner.sql` match the linked production database (checked September 28). Migration `056` added scheduled-run identity and indexes; its SQL integration checks pass. | Run a fresh signup and tenant-isolation acceptance flow; check the ledger before future schema releases. |
| Team-queue handoffs | Migration `026` snapshots connected non-boss workers for each team handoff; the first eligible claimant becomes the only assignee, while existing direct assignments remain supported. Migration `027` links owner-approved intake files to their resulting handoff. SQL integration checks cover proposal approval, queue visibility, first-claim behavior, idempotency, no-worker rejection, attachment retry, cross-workspace isolation, and service-only access. API-route tests verify owner approval creates a team-queue handoff with attached project files, retries do not duplicate it, and unreadable audio skips the intake-model call. | The schema and app are deployed, but a deployed authenticated two-agent handoff has not yet been completed. |
| Supabase Auth | Email sign-in and Supabase OAuth are configured; OAuth consent uses `/oauth/consent`. The latest Supabase advisor reports leaked-password protection is disabled. | Verify real signup/sign-in, redirect behavior, approval/pairing, revocation, and the launch email/SMTP policy. Review leaked-password protection before broader signup. Built-in Supabase email delivery is suitable only for a low-volume pilot. |
| Stripe | Checkout, portal, and webhook code are deployed with test-mode credentials; the required subscription is $5/month. | Exercise new checkout, cancellation, renewal, and webhook reconciliation in test mode. No live charges are configured; do not change price IDs until a reviewed billing-readiness decision. |
| MCP endpoint | `/api/mcp` is deployed; an unauthenticated request returned HTTP 401 as expected. | Exercise authenticated `tools/list`, tool calls, OAuth pairing, and agent-scoped authorization from actual clients. |
| MCP App | Widget compiles with the app; its production JavaScript asset returned HTTP 200. | Open the widget through authenticated MCP Apps hosts such as Codex and Claude and exercise its actions. Static asset success is not host-render proof. |
| OpenAI app directory | A Stoic Connector draft is saved with imported listing metadata and all five positive and three negative cases. Platform sign-in/passkey is complete. Local code enforces Supabase issuer, MCP resource audience, expiry, subject, and client ID. | Not submitted for review: add the portal's domain challenge, register the predefined OAuth client, configure its resource audience hook, deploy and verify the auth path, run authenticated scan and synthetic reviewer tests. Submission does not guarantee approval or publication. |
| Storage | Private bucket, signed upload/download, workspace scoping, cleanup, and deletion history are implemented and covered by code/SQL checks. | Verify signed upload, unauthorized access, expiry, removal, and quota/cost behavior against the deployed Supabase project. |
| Native schedules | Stoic displays setup prompts and last successful check-in status. A handoff waits for the receiver's next successful check. | Stoic's Hermes profile declares a daily check and records a successful inbox check at 01:02 UTC. The research handoff created at 19:23 UTC remains `assigned`. The user authorized connecting the intended Hermes dashboard with a Hermes-scoped Stoic key, but the dashboard still shows zero Stoic MCP servers and no key-rotation audit event was recorded. Codex and OpenClaw are on demand. |
| OpenAI synthesis | Restricted Stoic synthesis keys exist and `OPENAI_API_KEY` is present as an encrypted Vercel production variable. | The masked Vercel value prevented independent confirmation that it matches the named restricted key. Verify a real synthesis run and inspect only the resulting redacted suggestion. |
| Owner intake | Migrations `025`, `027`, and `056` and the bounded Agents API coordinator are deployed. `OPENAI_INTAKE_API_KEY` remains encrypted in Vercel production; a live text request produced a structured Hermes handoff draft that the owner approved into the queue. The production dashboard now includes the self-guiding conversation-first workspace, light/dark theme, local file previews, turn-based voice input, Ideas, searchable artifacts, and per-worker last-check health. A new OpenAI project key named `Stoic` was created through the secure connector but has not replaced the production variable because its permissions could not be confirmed; the connector exposes no scope controls or metadata. | Actual voice transcription and authenticated file selection/preview remain unverified. The browser previously reported that “Allow access to file URLs” must be enabled. Before using the new key, inspect it in OpenAI Platform and restrict it to the approved Agents API read/write and model request scopes, or revoke it. The existing production key remains unchanged. The Hermes assignment still needs a real worker inbox check, claim, result, and owner review. |
| Local quality gates | Current working tree: typecheck, lint, 113 unit tests, SQL integration checks through migration `056`, `git diff --check`, and the production build pass (checked September 28). | Preserve provider/live checks as separate release gates; a local build does not prove current production behavior. |

The owner's pilot workspace was observed on the Pro plan with three profiles (Codex, Hermes, OpenClaw) and one project. This is a pilot account observation, not proof that a new customer has completed onboarding or that every profile's provider schedule is working. The latest authenticated production check shows one newly owner-approved research assignment queued for Hermes; no worker pickup or result has yet been recorded for that assignment.

## 5. Integration support status

| Client | Product status | Current boundary |
|---|---|---|
| Codex | Pilot target | Remote MCP configuration is supported; schedule setup and a complete live handoff still need acceptance testing. |
| Hermes | Connection unverified in the intended dashboard | The user confirmed the currently open installation as the target. It lists zero MCP servers and no Stoic schedule. Connecting requires replacing the existing Hermes profile credential; wait for the user's approval, then verify authenticated inbox pickup and reporting. |
| OpenClaw | Pilot target | MCP and native cron guidance exist; verify actual schedule and handoff on a clean install. |
| Claude | MCP App target | Widget is built for compatible MCP Apps hosts; authenticated host rendering has not been verified in this release record. |
| Grok web | Not verified | Treat as interactive-only until its documented custom MCP path and real account behavior pass a test. |
| Consumer Muse | Not supported yet | Meta connector access, account linking, real tool behavior, and public availability remain unverified. Do not market it as supported yet. |

## 6. OpenAI app submission

- The intended listing is **Stoic Connector**, a hosted MCP App and connector for existing Stoic account holders. The local listing description now explains shared briefs, structured handoffs, owner-assisted drafting, progress, files, review, and the fact that Stoic does not wake offline agents. The Platform draft must be updated to match before submission.
- The listing is for the OpenAI app directory used by ChatGPT and Codex. It must not sell or promote the Stoic subscription inside the MCP app; customers can sign into an existing paid Stoic account.
- The OpenAI Platform draft is saved and has not been submitted for review. The browser draft contains listing metadata, all five positive and three negative test cases, and initial release notes; the local import file is `chatgpt-app-submission.json`. The directory icon is `public/stoic-connector-directory-icon.png`.
- OAuth is not release-ready. Local code now requires the expected Supabase issuer, MCP resource audience, expiry, subject, and OAuth client ID. The matching production Supabase audience hook and predefined OAuth client are not configured, so the current production path must not be treated as OAuth-verified. Supabase's standard OIDC scopes are not Stoic permissions; server authorization comes from the owner-paired agent profile and server-side role checks, and the real granted-scope behavior still needs verification.
- The user has completed Platform sign-in. The Submit screen currently blocks on a required demo recording URL, MCP tool scan, and test credentials. Source now has a plain-text, no-store domain-challenge route, but the exact portal token must be set as `OPENAI_APP_VERIFICATION_CHALLENGE` in Vercel before deployment. The MCP scan cannot save while the selected predefined OAuth client ID is blank. Remaining work includes the domain token, user-approved OAuth client and audience hook, an authorized synthetic reviewer account and tests, and final policy attestations/submission.
- Use `public/stoic-connector-directory-icon.png` for the directory icon and the supplied Stoic wordmark artwork for suitable listing/demo material.
- Verify every endpoint and reviewer credential with the OpenAI submission form before sending. Never place a real customer account, personal password, API key, or private project data in reviewer instructions.
- Reconfirm any legal attestation at the final submission step. A submitted draft enters review; do not report it as published until approval and directory availability are verified.

## 7. Features and work still to add

### P0 — Finish pilot acceptance and launch readiness

- [x] Verify production text intake through the dedicated Agents API key and owner review: a typed request produced a bounded structured draft for a connected Hermes worker, and the owner explicitly added it to the handoff queue.
- [x] Check the owner chat in light and dark themes and at a 390 × 844 mobile viewport; verify the conversation list, new-conversation control, composer, attachment, and voice controls remain available.
- [ ] Verify voice transcription and supported file preview/attachment on production, including XLSX/PPTX; code and synthetic parser tests do not prove the authenticated browser upload path. The prior file-picker attempt reported Chrome's “Allow access to file URLs” setting is disabled.
- [ ] Connect the user-confirmed Hermes installation using the previously approved Hermes-scoped Stoic credential replacement. Then complete inbox pickup, claim, progress/result, and owner review. Separately verify invalid-assignee rejection and arbitrary non-previewed file attachment.
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

- [x] Define and validate the Markdown note contract, project-scoped safe paths, stable IDs, front matter, wikilinks, provenance fields, supersession rules, secret/transcript rejection, and deterministic graph projection.
- [x] Add the opt-in scheduled Codex-harness Knowledge Steward. It uses owner-selected bounded project context, creates proposed notes with exact source references, preserves run and audit history, redacts credential-like values, and cannot mutate the authoritative brief or approve actions. It runs through Stoic's existing hourly cron invocation. Production migration `056` and runner are deployed; acceptance still requires verifying the configured Agents API key scope and exercising real scheduled runs.
- [x] Add scoped MCP tools for listing, searching, reading, retrieving knowledge-note evidence, and reading the derived graph. Production acceptance with multiple real clients remains open.
- [x] Add owner controls for enabling/disabling refresh, local schedule times and time zone, source scopes, retention, pinned notes, and manual refresh. Retention archives old Steward-created notes while preserving pinned notes. Existing stale/conflict review remains owner-visible; deployed behavior still needs acceptance testing.
- [x] Add the local owner Knowledge view with project-scoped search/filtering, agent and relationship filters, stale/orphan indicators, source-note details, and owner-controlled create/edit. The graph is keyboard-selectable and read-only.
- [ ] Add graph zoom/pan, Markdown bundle import/export, starter index/brief references, and browser verification of the owner experience.
- [x] Add automated note-contract, secret/transcript, cross-project, and deterministic-graph checks, plus SQL checks that block direct tenant-table access.
- [ ] Add deployed acceptance for refresh lifecycle, source provenance, superseded/stale decisions, export completeness, and two-workspace note isolation.
- [ ] Ship the Markdown knowledge base and graph as included features under the existing required $5/month subscription, without adding usage-based caps.

### P1 — Improve reliability and daily usability

- [x] Use `@heroicons/react` as the sole icon library; remove Lucide. Keep icons only for controls that benefit from a visual affordance (mobile navigation, attachment, recording, and spoken replies). Keep labels and routine actions text-led, with no decorative or sparkle icons.
- [x] Add a separate Ideas view for periodic suggestions, with a review-first label and a path into Stoic chat that carries the selected project and suggestion into a new owner conversation.
- [x] Turn the shared file list into a searchable, type-filtered artifact library; allow any file type up to the existing 25 MB limit, using the generic attachment MIME type for unfamiliar formats and explaining preview limits. No database schema change or additional AI call is involved.
- [x] Show attachment filenames and sizes on owner chat turns, and summarize each connected worker's recorded inbox-check health on the intake start screen.
- [x] If no connected worker is available, explain the next setup step and skip model interpretation and attachment transcription until a worker can receive work.
- [x] Finish the connection wizard that verifies an agent's first authenticated inbox check and guides the owner through its host-specific native schedule. The setup panel offers a copyable, no-work first-check prompt until the server records a successful check, refreshes server proof every 30 seconds while the Agents tab is visible, and shows a per-agent progress path through credential setup, server check, owner-declared schedule, and accepted handoff. Schedule declaration is labeled separately from successful server proof.
- [x] Add actionable schedule-health recovery guidance and owner-visible alerts for agents that stop checking in; the overview identifies the affected agent, opens its setup directly, and provides a copyable manual inbox-check prompt without implying Stoic can wake it. While visible, Overview refreshes workspace state every five minutes and Agents every 30 seconds; these are database reads, not model calls.
- [ ] Add searchable/filterable project history and clearer per-agent run summaries, errors, artifacts, and handoff outcomes.
- [x] Show next-step guidance for proposed/submitted work, blockers, requested changes, active claims, direct/team assignments awaiting check-ins, overdue schedules, and queues without a connected worker.
- [ ] Add owner controls for retries, reassignment, stale-state recovery, and safe conflict resolution while preserving the append-only history.
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
- `src/lib/knowledge.ts`, `src/lib/knowledge-store.ts`, `src/lib/knowledge-steward.ts`, `src/app/api/knowledge/route.ts`, and `src/components/knowledge-center.tsx` — validated Markdown memory, owner note editing, scheduled runner, scoped reads, and the graph surface. Production run acceptance remains open.
- `src/components/relay-dashboard.tsx` — owner dashboard, board, kanban, agent setup, knowledge, and billing screens.
- `src/mcp-app/widget.ts` and `src/lib/mcp-app-resource.ts` — embedded MCP App frontend and its host resource.
- `supabase/migrations/` — schema and database-enforced permissions/history.
- `scripts/hermes-stoic-hook.py` — optional privacy-bounded Hermes run metadata hook; it does not check the inbox or start schedules.

## 10. Release discipline

Keep local tests, database migration state, production deployment status, authenticated browser behavior, billing tests, real agent interoperability, Markdown knowledge refreshes, and graph rendering as separate proof categories. Record the date and evidence when a P0 item is completed. Do not convert an implementation, successful build, static HTTP response, configured profile, or generated graph into a claim of live provider acceptance.

Every autonomous implementation run must verify its own changes, stage only files changed by that run, create a conventional commit, and push the verified result to `main` when the repository has a configured `origin` and the path is clean. Do not sweep unrelated dirty work into the commit. If `origin` or a safe main-branch path is unavailable, record the exact blocker and stop before claiming the push happened.
