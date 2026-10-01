# Stoic ChatGPT pilot log

Use a dedicated synthetic Stoic workspace. Do not record passwords, OAuth tokens, pairing codes, signed URLs, or real customer data here. Keep the credentials in the approved account manager and delete any temporary links after testing.

## Setup record

- Pilot start date:
- Pilot end date:
- Stoic deployment URL:
- ChatGPT client/surface tested:
- Synthetic workspace label:
- Synthetic boss profile label:
- Synthetic worker profile label:
- OAuth client/audience verified by:
- Setup time from starting connection to first successful handoff:

## Preflight — 2026-09-29

The owner pilot has not started. This is setup evidence, not a completed ChatGPT MCP connection or acceptance result.

- Supabase production OAuth Server is enabled; dynamic OAuth app registration is disabled.
- Production migration `20260929233533_stoic_oauth_audience_hook.sql` is applied and recorded in the local migration history.
- The predefined public OAuth app “ChatGPT — Stoic Connector” is registered with callback `https://chatgpt.com/connector/oauth/xdtQfMhK2XPX` and token endpoint authentication method `none`.
- The approved client is enabled in `stoic_private.mcp_oauth_clients`; the `stoic_private.custom_access_token_hook` Auth Hook is enabled. The hook changes the audience only for enabled registered clients.
- Vercel production variable `OPENAI_APP_VERIFICATION_CHALLENGE` is configured. Deployment `dpl_9cE8hmixRWcMJKTngoFW6NUhQHwe` is Ready on `https://stoic.bishoptech.dev`; the challenge endpoint returns HTTP 200, `text/plain`, `no-store`, and the exact token from the OpenAI portal. The portal confirms the Stoic domain is verified. The token is intentionally not recorded here.
- OpenAI Platform’s Stoic draft has `https://stoic.bishoptech.dev/api/mcp`, OAuth authentication, the predefined client ID, and discovered Supabase endpoints/resource saved. After owner consent, the browser redirected to the ChatGPT OAuth callback, but Chrome blocked that callback with `ERR_BLOCKED_BY_CLIENT`. The scan remains required; no successful ChatGPT MCP token exchange or tool scan is claimed.
- Local verification passed before this portal setup: SQL integration suite, 134 unit tests, lint, typecheck, and production build. The local migration suite was rerun after aligning the migration filename to the production version.
- The owner pilot has not started. Next gates: resolve the blocked ChatGPT callback, complete the tool scan, verify the real token audience/profile pairing, and run a synthetic two-agent handoff.

## Recheck — 2026-09-29

- The currently open Hermes dashboard session shows zero configured MCP servers.
- The Stoic owner dashboard lists a Hermes profile with an active credential, a successful inbox check about 10 hours earlier, and completed setup progress. This confirms a Hermes installation reached Stoic, but does not establish that the currently open Hermes dashboard is that installation.
- Stoic warns that creating or replacing this profile's key will revoke the current key and disconnect its installation. Confirm the target before rotating it.
- The current Stoic project already contains an active handoff, so it should not be reused as a pilot fixture. Use a dedicated synthetic project/workspace for the owner pilot.
- Created `ChatGPT Pilot — Synthetic 2026-09-29` and set/read back its synthetic-only brief. It is a separate project inside the existing owner workspace, not a separately isolated reviewer workspace. No handoff has been created in it yet.
- The connected Codex boss passed live `get_team_context`, `check_inbox`, and `get_team_check_history` calls. The check was recorded in production. Its inbox surfaced an existing Hermes assignment in the original project; the timeline shows claim, blocker update, and blocked-result submission, with no artifact and no owner acceptance. This is partial lifecycle evidence, not a completed pilot case, and the existing handoff was left unchanged.
- The live Hermes profile has recent successful Stoic checks, but the currently open Hermes dashboard reports zero configured MCP servers. A key replacement would revoke the existing credential; owner confirmation is pending before connecting that specific installation.

## Corrected Hermes installation follow-up — 2026-09-29

- The owner supplied the corrected Hermes dashboard at `127.0.0.1:9119/mcp?profile=default`. It shows an enabled `stoic-hermes` bearer connection to `https://stoic.bishoptech.dev/api/mcp`.
- Hermes's **Test connection** action completed MCP initialization and displayed Stoic's 34 tools, including `get_profile`, `check_inbox`, handoff lifecycle tools, and artifact tools. This verifies the current dashboard can authenticate and discover Stoic tools. It does not by itself verify a new inbox write or a complete handoff.
- The current Hermes profile also contains a saved scheduled session named “Stoic Hermes inbox” from Sep 29 at 08:02. Its visible trace includes `get_team_context` and `check_inbox`, followed by work on an existing handoff. The run ended with a blocked result after public-source research was unavailable or challenged; it is not a successful handoff and was not treated as a new check-in.
- A fresh read-only request from the corrected dashboard successfully called `get_profile` and `check_inbox`. Stoic returned the paired `Hermes · worker` profile and one existing submitted handoff; no new project-board messages were waiting. No handoff was created or changed by this check.
- No credential replacement was made. The corrected dashboard already has an enabled connection and successfully loads tools, so replacing the key would needlessly revoke the connection that is working here.
- Created one synthetic assignment from the paired Codex boss profile to this Hermes worker in `ChatGPT Pilot — Synthetic 2026-09-29`. The assignment was claimed by the manually triggered “Stoic Hermes inbox” scheduled job; Hermes posted progress, uploaded a Markdown artifact, and submitted it for review. This confirms the receiving agent can process work on its next run; it does not establish an immediate wake.
- Boss review requested a concrete safety correction: keep a fictional vendor response as an unsent draft until explicit owner approval. Hermes claimed the revision, posted progress, uploaded a replacement artifact, and resubmitted it. The revised artifact was fetched through its temporary signed URL and inspected; it states that sending remains blocked until explicit owner approval. The boss accepted the revised result. Handoff `ea599a00-9e11-4bbf-b10b-6f79e2e53877` ended `accepted`; final artifact `1e571b37-08a9-4399-87c8-227194258d88` (`synthetic-worker-handoff-guide.md`, 1,945 bytes).
- The existing daily inbox job remains enabled for 08:00 local time. A manual **Trigger now** run completed at approximately 19:37 local on Sep 29 and processed the handoff revision. This is evidence that the configured job can run when triggered; the next unattended 08:00 run has not yet been observed.
- Scope of this pass: one paired Hermes worker, one Codex boss, one synthetic project, handoff lifecycle, revision loop, and artifact retrieval. Cross-workspace isolation, revocation, natural unattended schedule execution, and the OpenAI ChatGPT tool scan remain separate proof gates. No external action was taken.

## ChatGPT app pin and widget UX deployment — 2026-09-29

- The owner supplied a screenshot of the ChatGPT app's More menu with the existing **Open Stoic** app pinned. This confirms the app is already present in the ChatGPT app; do not create a duplicate from the separate web plugin directory.
- The OpenAI Platform draft reports a successful MCP tool scan for `https://stoic.bishoptech.dev/api/mcp`, including Stoic's tool metadata. This confirms draft endpoint discovery, not public listing, app approval, or a completed ChatGPT handoff pilot.
- Production deployment `dpl_4L5Wbz3rmzf6wQ9Cabm2Qmqj1M3n` is Ready and aliased to `https://stoic.bishoptech.dev`. The local and production `public/stoic-mcp-widget.js` SHA-256 values match: `0d2bb1abc1bb92610312798c01ee03366c0cbf7935d04a347ee1e7c4cee1cee7`.
- The updated widget implements the Stoic light theme and compact icon-only navigation. An unauthenticated request to `/api/mcp` returns HTTP 401, confirming the MCP endpoint still requires authentication. This does not test a signed-in ChatGPT session.
- The screenshot confirms the pinned app location, but the refreshed widget's appearance inside the native ChatGPT app has not been visually verified from this session. Reopen or refresh the existing **Open Stoic** pin and confirm its light theme, icon-only rail, and current workspace view before treating embedded UI acceptance as complete.
- Local build, typecheck, targeted lint, and 134 tests passed for this deployment. The current browser verification does not cover ChatGPT's live OAuth session or native app rendering.

## Theme correction and draft scan recheck — 2026-09-30

- The owner clarified that **Open Stoic** is already pinned in the ChatGPT desktop app. No duplicate app was created.
- The MCP widget's palette now lives on `#stoic-app[data-theme="light"]` and `#stoic-app[data-theme="dark"]`, preventing the host's theme attribute from overriding Stoic's palette.
- Production deployment `dpl_BVYK3iDxau2D5fnrAVdufxJ6sYs5` is Ready and aliased to `https://stoic.bishoptech.dev`. Reading the connected `ui://stoic/dashboard.html` resource confirms that both scoped palette rules are live.
- The OpenAI Platform draft's discovered tool catalog includes `draft_handoff`. The app remains a draft; no submission or publication was made.
- The screenshot supplied by the owner confirms the existing app is pinned, but it does not show the app opened. The already-open Codex MCP preview still renders dark, so the refreshed light theme inside the native ChatGPT app has not been visually verified from this session. Reopen the existing **Open Stoic** pin and confirm the light theme, icon-only rail, and workspace view before treating embedded UI acceptance as complete.

## Daily observations

| Date | Exercise | Pass/fail | Time | Confusion or defect | Evidence reference |
| --- | --- | --- | --- | --- | --- |
| 2026-09-29 | Corrected Hermes connection, scheduled-job trigger, two-way handoff, revision, artifact retrieval, and boss acceptance | Pass for this synthetic workflow | ~21 min from assignment creation to acceptance; initial connection setup was not timed | Existing bearer connection was already valid, so no key rotation was needed. The run was manually triggered; unattended execution at the next daily schedule is not yet proven. | Hermes MCP page showed 34 Stoic tools; fresh `get_profile`/`check_inbox`; handoff `ea599a00-9e11-4bbf-b10b-6f79e2e53877` accepted; final artifact `1e571b37-08a9-4399-87c8-227194258d88` |
|  | Connect account and pair profiles |  |  |  |  |
|  | Open the global sidebar app |  |  |  |  |
|  | Open the app from a conversation |  |  |  |  |
|  | Read team roles and recent check-ins |  |  |  |  |
|  | Create and claim a bounded handoff |  |  |  |  |
|  | Post progress and submit a result |  |  |  |  |
|  | Boss accepts or requests changes |  |  |  |  |
|  | Share and retrieve a synthetic file |  |  |  |  |
|  | Test expired file URL and offline agent |  |  |  |  |
|  | Repeat after disconnect or credential revocation |  |  |  |  |

## OpenAI review test set

Record what ChatGPT actually called and returned. Mark a case passed only after the hosted MCP result matches the expected behavior and no permission boundary is crossed.

| Case | Result | Actual tools called | Expected result matched? | Evidence reference / notes |
| --- | --- | --- | --- | --- |
| P1 — Team roles and check history |  |  |  |  |
| P2 — Brief and discussion |  |  |  |  |
| P3 — Create bounded handoff |  |  |  |  |
| P4 — Worker completes a result |  |  |  |  |
| P5 — Temporary file link |  |  |  |  |
| N1 — Calendar request stays out of Stoic |  |  |  |  |
| N2 — Shell/email request stays out of Stoic |  |  |  |  |
| N3 — Worker cannot rewrite the brief |  |  |  |  |

## Safety and reliability checks

- [ ] Another workspace's records never appear in reads, search results, or files.
- [ ] A worker cannot invoke a boss-only operation or accept its own result.
- [ ] A revoked credential stops working on the next request.
- [ ] Retrying a write with the same idempotency key does not create duplicate work.
- [ ] Expired signed links fail; an unauthorized profile cannot fetch the file.
- [ ] The offline worker stays pending and no message claims it was awakened.
- [ ] The schedule indicator distinguishes an owner-declared schedule from an actual successful inbox check.
- [ ] Auth recovery works without reviewer-inaccessible MFA, emailed code, or private-network access.

## Pilot decision

- Positive cases passed (out of 5):
- Negative cases passed (out of 3):
- Setup target under ten minutes met:
- Permission or data-isolation failures:
- False wake/schedule claims:
- Highest-priority fixes:
- Ready for another pilot / review preparation:
- Decision date and owner:
