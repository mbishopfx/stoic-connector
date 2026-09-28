# Stoic Connector — OpenAI Plugin Submission

This checklist tracks the remote MCP app draft in OpenAI Platform. A saved draft is not a submitted, approved, or published plugin. The plugin directory is shared by ChatGPT and Codex.

## Listing

- **Name:** Stoic Connector
- **Short description:** Coordinate your AI agents
- **Website:** <https://stoic.bishoptech.dev>
- **MCP server:** <https://stoic.bishoptech.dev/api/mcp>
- **Privacy:** <https://stoic.bishoptech.dev/privacy>
- **Terms:** <https://stoic.bishoptech.dev/terms>
- **Support:** <https://bishoptech.dev/contact>
- **Icon:** `public/stoic-connector-directory-icon.png` (512×512 PNG, supplied Stoic artwork)
- **Authentication:** Supabase OAuth 2.1; link an existing Stoic account
- **Business identity:** Verified OpenAI Platform identity, BishopTech LLC

### Description

Stoic gives the agents you already use one shared project brief and a structured handoff flow. Read team context and assignments, post progress or blockers, share files through short-lived links, and return results to the boss for review. Stoic stores coordination state; it does not run models or wake agents. Scheduled checks run through each agent’s own provider account. Connect an existing Stoic account to use your workspace.

### Starter prompts

- “Check my Stoic inbox and summarize any assignments that need attention.”
- “Read the shared project brief and recent project discussion, then report any conflicts or unanswered questions.”
- “Create a bounded handoff for the connected worker with these goals and constraints, then tell me when it has a result to review.”

Do not include a Stoic checkout URL, subscription pitch, or upgrade flow in the MCP app.

## Test cases

The import-ready test set is in [`chatgpt-app-submission.json`](../chatgpt-app-submission.json): exactly five positive and three negative cases. It covers team context, shared project discussion, boss-to-worker assignment, worker result submission, file sharing, unrelated calendar requests, unsupported shell/email actions, and worker attempts to change a boss-maintained brief. Before entering the cases in the portal, use a synthetic reviewer workspace and verify each case against the deployed endpoint. Do not use real project or customer data, and do not invent fixture IDs.

## Submission gates

- [ ] Complete the OpenAI Platform passkey check in the browser, then resume the saved draft.
- [ ] Verify the public domain challenge at `https://stoic.bishoptech.dev/.well-known/openai-apps-challenge` using the exact token shown in the portal.
- [ ] Register a predefined Supabase OAuth client for the callback URL shown by the portal; do not enable broad dynamic client registration solely for convenience.
- [ ] Configure a Supabase custom access-token hook for that exact OAuth client so the token audience is the MCP resource URL, then enforce issuer, audience, expiry, and scopes in Stoic before accepting OAuth access. Current `verifyAgentToken` verifies Supabase claims but does not yet enforce the OpenAI-required issuer and resource audience checks. OpenAI requires the `resource` value to be echoed through authorization and token exchange and bound into the token audience; see [OpenAI authentication](https://developers.openai.com/plugins/build/auth) and [Supabase token security](https://supabase.com/docs/guides/auth/oauth-server/token-security).
- [ ] Re-scan the production MCP endpoint and review every discovered tool, schema, annotation, and UI domain.
- [ ] Provision a dedicated reviewer account with synthetic data and working paid entitlement; ensure it needs no MFA, email code, or private network.
- [ ] Verify all eight cases against the deployed endpoint and replace fixture descriptions with concrete, reproducible setup details.
- [ ] Add a demo recording if required by the portal.
- [ ] Review the exact public listing, privacy/terms/support links, region availability, release notes, and policy attestations.
- [ ] At final submission, confirm the exact data and credentials being sent to OpenAI Platform. Submit for review only after the user approves any required legal attestation.
- [ ] Track review separately from publication; OpenAI approval and a later publish action are still required before the app appears in the directory.

## Current proof

- Production deployment `dpl_4veBUHcQGnKzf2SxrzYWqjpPJ3Gv` reported `READY` and is aliased to `https://stoic.bishoptech.dev`.
- Production home, privacy, terms, and 512×512 directory icon returned HTTP 200.
- `/.well-known/oauth-protected-resource` returned HTTP 200 with the MCP resource and Supabase authorization server.
- An unauthenticated request to `/api/mcp` returned HTTP 401 with an OAuth resource-metadata challenge.
- The currently connected Codex installation successfully called `get_team_context` against the live service; this proves that installation’s bearer-key path, not OpenAI Platform OAuth or app-directory review.
- `chatgpt-app-submission.json` contains all 29 MCP tools, five positive test cases, and three negative test cases. Only `get_profile` declares an `outputSchema`; the other 28 currently do not.
- MCP tool OAuth `securitySchemes` and profile metadata are implemented in source. Unit tests, lint, typecheck, and production build pass; production deployment is Ready. Authenticated OpenAI Platform scanning remains outstanding.
- Production OAuth discovery and the unauthenticated 401 resource challenge were verified. The OAuth audience hook, server-side audience validation, OpenAI Platform OAuth flow, and real Scan Tools result remain outstanding.
