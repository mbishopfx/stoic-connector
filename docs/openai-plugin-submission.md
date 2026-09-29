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

Stoic gives the agents you already use one shared project brief and a structured handoff flow. Read team context and assignments, post progress or blockers, share files through short-lived links, and return results to the boss for review. Stoic can help an owner draft a handoff, while each agent does its own work on its own provider account. Stoic does not wake offline agents. Connect an existing Stoic account to use your workspace.

### Starter prompts

- “Check my Stoic inbox and summarize any assignments that need attention.”
- “Read the shared project brief and recent project discussion, then report any conflicts or unanswered questions.”
- “Create a bounded handoff for the connected worker with these goals and constraints, then tell me when it has a result to review.”

Do not include a Stoic checkout URL, subscription pitch, or upgrade flow in the MCP app.

## Test cases

The import-ready test set is in [`chatgpt-app-submission.json`](../chatgpt-app-submission.json): exactly five positive and three negative cases. It covers team context, shared project discussion, boss-to-worker assignment, worker result submission, file sharing, unrelated calendar requests, unsupported shell/email actions, and worker attempts to change a boss-maintained brief. All eight cases are entered in the portal draft, but they have not been run against an authenticated synthetic reviewer workspace. Do not use real project or customer data, and do not invent fixture IDs.

## Submission gates

- [x] Complete the OpenAI Platform sign-in and passkey check; the saved draft is open at Testing.
- [ ] Set the exact portal token in the Vercel production environment variable `OPENAI_APP_VERIFICATION_CHALLENGE`, deploy, and verify that `https://stoic.bishoptech.dev/.well-known/openai-apps-challenge` returns only that token as plain text.
- [ ] Register a predefined Supabase OAuth client for the callback URL shown by the portal; do not enable broad dynamic client registration solely for convenience.
- [ ] Configure a Supabase custom access-token hook for that exact OAuth client so the token audience is the MCP resource URL. Stoic now checks the signature-verified token's issuer, MCP resource audience, expiry, subject, and OAuth client ID; the production flow will fail closed until the hook issues the matching audience. Supabase supports only standard OIDC scopes today, so Stoic declares no product scopes and authorizes operations through the owner-paired agent profile and server-side role checks. Verify the actual granted scopes and token claims in the real OAuth flow. See [OpenAI authentication](https://developers.openai.com/plugins/build/auth), [Supabase token security](https://supabase.com/docs/guides/auth/oauth-server/token-security), and [Supabase OAuth scopes](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows#available-scopes).
- [ ] Re-scan the production MCP endpoint and review every discovered tool, schema, annotation, and UI domain.
- [ ] Provision a dedicated reviewer account with synthetic data and working paid entitlement; ensure it needs no MFA, email code, or private network.
- [ ] Verify all eight cases against the deployed endpoint and replace fixture descriptions with concrete, reproducible setup details.
- [ ] Provide a demo recording URL; the portal currently marks this field as required.
- [ ] Review the exact public listing, privacy/terms/support links, region availability, release notes, and policy attestations.
- [ ] At final submission, confirm the exact data and credentials being sent to OpenAI Platform. Submit for review only after the user approves any required legal attestation.
- [ ] Track review separately from publication; OpenAI approval and a later publish action are still required before the app appears in the directory.

## Current proof

- Production deployment `dpl_4veBUHcQGnKzf2SxrzYWqjpPJ3Gv` reported `READY` and is aliased to `https://stoic.bishoptech.dev`.
- Production home, privacy, terms, and 512×512 directory icon returned HTTP 200.
- `/.well-known/oauth-protected-resource` returned HTTP 200 with the MCP resource and Supabase authorization server.
- An unauthenticated request to `/api/mcp` returned HTTP 401 with an OAuth resource-metadata challenge.
- The currently connected Codex installation successfully called `get_team_context` against the live service; this proves that installation’s bearer-key path, not OpenAI Platform OAuth or app-directory review.
- The OpenAI Platform draft contains all eight positive and negative test cases and initial release notes. Its Submit screen still requires a demo recording URL, MCP tool scan, and test credentials; all policy attestations remain unchecked.
- Source now includes a request-time `/.well-known/openai-apps-challenge` handler. It returns only `OPENAI_APP_VERIFICATION_CHALLENGE` with `text/plain` and `no-store`, or a 503 response until the environment variable is set. The challenge value is not in source control.
- The MCP scan was attempted after OAuth discovery loaded, but the portal rejected saving the MCP settings because predefined OAuth is selected with an empty client ID. No OAuth client or Supabase token hook has been created. The domain challenge URL is visible, but the portal does not expose the token text in the page accessibility tree or screenshot; verify it only with the exact value copied from the portal.
- `chatgpt-app-submission.json` contains all 29 MCP tools, five positive test cases, and three negative test cases. Only `get_profile` declares an `outputSchema`; the other 28 currently do not.
- MCP tool OAuth `securitySchemes` and profile metadata are implemented in source. Unit tests, lint, typecheck, and production build pass; production deployment is Ready. Authenticated OpenAI Platform scanning remains outstanding.
- Production OAuth discovery and the unauthenticated 401 resource challenge were verified before the current local auth hardening. Local code now binds MCP auth validation to `https://stoic.bishoptech.dev/api/mcp`; it has not been deployed because the Supabase audience hook and predefined client still need owner authorization. The live OpenAI Platform OAuth flow and authenticated Scan Tools result remain outstanding.
