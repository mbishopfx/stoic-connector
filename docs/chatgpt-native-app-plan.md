# Stoic in ChatGPT: native app plan and pilot

> Historical pilot plan. Current access and hosting are described in [README.md](../README.md); paid subscriptions are no longer part of the app.

**Updated:** September 30, 2026

**Product:** Stoic Connector
**Current state:** Native extension metadata and an uploadable package are prepared locally. Supabase OAuth Server is enabled, with dynamic client registration disabled. The audience-hook migration is applied; the predefined “ChatGPT — Stoic Connector” OAuth client is registered and mapped; and the custom access-token hook is enabled. The OpenAI Platform draft has the production MCP URL and predefined OAuth configuration saved, Stoic's product domain is verified, and a successful MCP tool scan discovered `draft_handoff`. The existing **Open Stoic** app is pinned in the ChatGPT desktop app. The owner pilot has not verified the refreshed embedded view or a complete ChatGPT handoff. This is not submitted, reviewed, or published.

## Product direction

Position Stoic as the shared workspace that keeps an owner's agent team organized. ChatGPT is one place to open that workspace and coordinate work in conversation; it does not become a new agent or a proxy to provider APIs. Stoic stores briefs, handoffs, progress, approval requests, and files. Connected agents do their own work with their own provider accounts and retrieve assignments on their own successful schedule.

The opportunity in the platform announcement is distribution inside a conversation workflow: people can discover the Stoic workspace while discussing agent coordination, open it from ChatGPT's sidebar, and keep a workspace panel next to a conversation. The 1.2B weekly-user figure is a claim in the referenced post, not Stoic's reachable audience estimate. OpenAI's current guidance says plugins with strong real-world utility and user satisfaction may be eligible for enhanced placement or proactive suggestions, but few receive it at launch and developers cannot request it. Plan for directory search, direct listing links, and repeat usage; treat extra placement as upside.

## Native ChatGPT experience

### Sidebar workspace

The global entrypoint opens Stoic as a full-screen workspace. It gives the owner a place to review connected agents, handoffs, project discussion, and shared context, then act within the paired profile's existing permissions.

### Conversation workflow

The same app can open beside a conversation or inline when the user asks to inspect the workspace. A focused onboarding skill guides the model through reading the brief, checking an inbox, creating a bounded assignment only on explicit request, and reporting the returned status accurately.

### Calm handoff lifecycle

1. Read the current brief and confirm the project, assignee, expected result, and constraints.
2. Create one handoff when the owner asks to delegate.
3. The worker sees it at its next successful native inbox check; Stoic does not wake an offline agent.
4. The worker claims the task, posts progress or a blocker, and submits a result.
5. The boss reviews the result, accepts it, or asks for changes. Consequential external actions remain approval-gated.

### Account and subscription boundary

The plugin connects an existing Stoic account. Keep account signup, checkout, plan descriptions, and subscription promotion on Stoic's website. The ChatGPT plugin must not display the $5 subscription offer, link to checkout, or initiate an upgrade. If an existing account lacks an entitlement, explain the limitation without creating a transaction flow.

### Domain and deployment rules

- Keep `https://stoic.bishoptech.dev` as Stoic's canonical app URL, including its dashboard, MCP endpoint, OAuth resource, privacy/terms pages, and OpenAI domain-challenge endpoint.
- Use `https://bishoptech.dev` for BishopTech's company/developer identity and root-domain ownership when a platform explicitly requires the base domain. The root website may link to Stoic, but it must not redirect or replace the Stoic app URL.
- If verification must be served from the root domain, coordinate only the exact required DNS record, static verification file, or route with the separate `bishoptech-website` project. Inspect its current checkout first and preserve unrelated work; do not add a proxy or move the MCP server unless the platform requires that exact architecture.
- Keep the plugin's company website and Stoic product homepage distinct in metadata: BishopTech may identify the developer at the base domain while Stoic's homepage and MCP URL remain on the subdomain. Change the listing website field only if the platform's verified requirement calls for the base domain.

## Work completed in this checkout

- Added `global` and `thread` entrypoints to `open_stoic_dashboard`.
- Declared the production widget origin, resource CSP, inline/fullscreen display modes, and a concise widget description.
- Added structured dashboard output with the workspace name, paired role, connected-agent count, and project count.
- Expanded the widget's maximum width and responsive breakpoint for a fuller native workspace.
- Prepared `openai-plugin/` with the portable Agent Plugins manifest, remote Streamable HTTP MCP config, onboarding skill dependency, Stoic icon, and five positive plus three negative review cases.
- Added `npm run package:openai-plugin` to validate the package and create `dist/stoic-connector-openai-plugin.zip`.
- Applied the production audience-hook migration and registered the predefined public ChatGPT OAuth client. The client registry and enabled hook were verified in the Supabase project; dynamic client registration remains disabled.
- Set the production OpenAI domain-challenge variable, deployed `dpl_9cE8hmixRWcMJKTngoFW6NUhQHwe`, verified the challenge response against the portal token, and confirmed “Domain verified” in OpenAI Platform. The token is not recorded in repository files.
- Saved the hosted MCP endpoint, OAuth mode, callback, client ID, and discovered Supabase authorization/resource URLs in the OpenAI Platform draft. An earlier owner-consent attempt reached the ChatGPT callback, but Chrome blocked that callback. A later MCP scan succeeded and discovered `draft_handoff`; signed-in ChatGPT token exchange and profile pairing remain unverified.
- Updated the embedded Stoic chat interface with project selection, session-only conversation context, file and voice input, and a reviewable handoff proposal that creates work only after the owner chooses to add it to the queue.
- Scoped the widget's light and dark color variables to Stoic's own root so the host app theme cannot override the selected palette. Production deployment `dpl_BVYK3iDxau2D5fnrAVdufxJ6sYs5` is Ready and aliased to `https://stoic.bishoptech.dev`; the live `ui://stoic/dashboard.html` resource contains both scoped palette rules.
- Created and read-back-verified the synthetic project `ChatGPT Pilot — Synthetic 2026-09-29` with explicit data and action boundaries. It is isolated at the project level inside the owner workspace, not a separate reviewer tenant; no synthetic handoff has been created yet.
- Verified the existing Codex boss MCP connection with live context, inbox, and check-history calls. An older Hermes handoff in the original project records claim, blocker update, and submission, but no completed result; it was left unchanged.

The package intentionally has no `.app.json` or `apps` mapping. Current OpenAI submission guidance says plugin ZIPs with those app references cannot currently be submitted; use `mcp.json` for the remote MCP server and finish its connection in the dashboard.

## 7-day owner pilot

Use a separate Stoic workspace with synthetic projects and files. Test the production endpoint through ChatGPT developer mode after OAuth is ready. The week is for validating a real product, not for submitting a trial/demo plugin; OpenAI's review guidance says trial or demo plugins are not accepted.

| Day | Exercise | Evidence to record |
| --- | --- | --- |
| 0 | Prepare synthetic owner, boss, and worker profiles; connect ChatGPT; open Stoic from the sidebar and a conversation. | OAuth completes without a code or MFA step the reviewer cannot access; both entrypoints render; note elapsed setup time. |
| 1 | Ask for team roles, check history, and project brief. | Tool choice is relevant; role and timestamps match the workspace; no claims that a schedule is running just because a check was recorded. |
| 2 | Create one constrained boss-to-worker handoff. | Correct project and worker; the handoff remains pending until claimed; duplicate or ambiguous requests are handled carefully. |
| 3 | Check from the worker, claim, post progress, and submit a result. | Each transition and event is visible; worker cannot accept its own result; boss sees it for review. |
| 4 | Review the result, request a change, then accept the revised result. | The full history remains visible; boss-only operations reject worker credentials. |
| 5 | Share and retrieve a synthetic file; separately test an expired signed link and an offline worker. | Only authorized profiles can fetch the artifact; the link expires; offline work is reported as waiting for the next check. |
| 6 | Run the three negative prompts and repeat the normal flow after reconnecting. | No calendar, arbitrary shell, or email behavior; worker cannot replace the authoritative brief; revoked or disconnected credentials fail closed. |
| 7 | Review notes and repeat any failed case from a clean synthetic state. | Record pass/fail by case, connection time, confusing copy, tool-selection mistakes, false status claims, and defects. Decide whether another pilot is needed. |

### Pilot exit criteria

- All five positive and all three negative cases pass on the hosted MCP server with the synthetic account.
- No cross-workspace reads, worker-to-boss permission escalation, or artifact access after link expiry.
- No assistant claim that Stoic woke a worker or that an unverified native schedule is active.
- The user can connect two agents and complete a boss-to-worker-to-boss handoff in under ten minutes.
- Sidebar launch, conversation-panel launch, login recovery, and an offline worker state are understandable without developer intervention.
- No open blocker affects authentication, data isolation, subscription entitlements, or reviewer access.

Keep a dated pilot log with the prompt, tools called, expected result, actual result, timing, screenshot or request ID, and whether it passed. Use synthetic data only.

## Submission and distribution sequence

1. Preserve the domain split: company ownership/support may use `bishoptech.dev`; the Stoic app, OAuth resource, and MCP server remain at `stoic.bishoptech.dev`. If the portal requires a base-domain proof, add only its exact required proof to the root website project and re-test both domains.
2. Verify the real OpenAI token claims and profile-pairing flow against the registered client and enabled audience hook. The authenticated MCP tool scan is complete; a successful signed-in ChatGPT handoff remains unverified.
3. Domain verification is complete for `stoic.bishoptech.dev`; preserve the production challenge variable and avoid recording its token in source control.
4. Inspect the completed scan's tool schemas, annotations, and UI metadata; resolve findings. Test with a dedicated reviewer account containing synthetic sample data and the entitlements used by the cases.
5. Complete the 7-day pilot. Record the required demo walkthrough only after the flows work reliably. Do not submit with example credentials or an invented video URL.
6. Build a new ZIP from `openai-plugin/`, upload it to the verified BishopTech identity, complete review details, and submit only after reviewing the exact listing and any legal attestations.
7. After approval, choose **Publish** in the portal. Approval alone does not make the listing public. Track whether users find Stoic by direct URL or directory search; do not assume it appears on a front page.

## Distribution and learning loop

- Make the public listing explain the job in plain language: shared brief, handoff, progress, result review. Keep the three default prompts close to real user requests and within the actual tool permissions.
- Record one short walkthrough after the pilot: open Stoic from the sidebar, create a constrained assignment in a conversation, show the worker claiming it on its next scheduled check, and accept or return the submitted result. Use synthetic project data.
- Publish setup instructions and the walkthrough on Stoic's website. Share a direct directory link when the listing is published; do not announce a listing while it is still a draft or under review.
- Measure the path from listing visit to account connection, first successful inbox check, first completed handoff, and return use. Track disconnects, wrong tool selection, incomplete schedules, and review time as well as installs.
- Use pilot conversations to refine the listing, default prompts, setup help, and error messages. Do not tune metadata to trigger on unrelated requests or claim that OpenAI will proactively surface the app.
- For subscription revenue, keep billing on Stoic's own website. In ChatGPT, let an existing account use features included in its entitlement, with clear status messages and no checkout path.

## Review risks to resolve

- **Unofficial-connector policy:** OpenAI's current guidelines reject plugins whose primary function is an unofficial connector or pass-through layer for third-party services. Keep Stoic's product experience centered on its independent shared workspace and durable handoff history. It should not relay prompts to other providers, impersonate their products, or bypass their APIs or access controls. Seek clarification through review if the platform classifies cross-agent handoffs as an unofficial connector.
- **Reviewer access:** Review must use a dedicated synthetic account, not the owner's real account or production work. Keep that tenant, credentials, and paid entitlement usable for later review.
- **No in-plugin digital commerce:** Existing paid users may sign in, but the plugin must not advertise the $5 plan or start checkout/upgrade.
- **Platform reach:** Strong usage can make a plugin eligible for enhanced placement; selection is discretionary. The user count in the announcement is not a distribution commitment.
- **Surface availability:** OpenAI currently notes that some plugin extensions are rolling out to web Free/Go users and composer mentions are desktop-only. Verify actual surfaces available to Stoic's reviewer and customers instead of promising universal availability.

## Official references

- [Plugin extensions: sidebar and conversation entrypoints](https://developers.openai.com/plugins/build/extensions)
- [Package your plugin](https://developers.openai.com/plugins/build/plugins)
- [Build skills](https://developers.openai.com/plugins/build/skills)
- [Submission flow and review details](https://developers.openai.com/plugins/deploy/submission)
- [Remote MCP review and distribution](https://developers.openai.com/plugins/deploy/app-review)
- [Plugin guidelines](https://developers.openai.com/plugins/app-guidelines)
