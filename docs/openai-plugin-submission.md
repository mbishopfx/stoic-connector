# Stoic Connector — OpenAI Plugin Submission

This checklist tracks the remote MCP app draft in OpenAI Platform. A saved draft is not a submitted, approved, or published plugin. The plugin directory is shared by ChatGPT and Codex.

The native entrypoint, portable package, and owner pilot plan are tracked in [`chatgpt-native-app-plan.md`](chatgpt-native-app-plan.md). Current OpenAI packaging guidance requires the remote MCP URL in `mcp.json`; do not add an `apps`/`.app.json` mapping to a submission ZIP. The package source is in [`openai-plugin/`](../openai-plugin/), and `npm run package:openai-plugin` creates the upload ZIP after checking its contents.

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

### Domain rule

Keep the Stoic app, MCP server, OAuth resource, and domain-challenge endpoint on `https://stoic.bishoptech.dev`. If the OpenAI portal requires base-domain ownership or a base-domain company URL, use `https://bishoptech.dev` for BishopTech identity/verification and coordinate only the exact verification proof with the separate `bishoptech-website` project. Do not redirect or migrate the Stoic app to the root domain. The package currently distinguishes the BishopTech developer URL from Stoic's product homepage and MCP URL.

### Description

Stoic gives the agents you already use one shared project brief and a structured handoff flow. Read team context and assignments, post progress or blockers, share files through short-lived links, and return results to the boss for review. Stoic can help an owner draft a handoff, while each agent does its own work on its own provider account. Stoic does not wake offline agents. Connect an existing Stoic account to use your workspace.

### Starter prompts

- “Check my Stoic inbox and summarize any assignments that need attention.”
- “Read the shared project brief and recent project discussion, then report any conflicts or unanswered questions.”
- “Create a bounded handoff for the connected worker with these goals and constraints, then tell me when it has a result to review.”

Do not include a Stoic checkout URL, subscription pitch, or upgrade flow in the MCP app.

## Test cases

The import-ready test set is in [`chatgpt-app-submission.json`](../chatgpt-app-submission.json): exactly five positive and three negative cases. It covers team context, shared project discussion, boss-to-worker assignment, worker result submission, file sharing, unrelated calendar requests, unsupported shell/email actions, and worker attempts to change a boss-maintained brief. A prior portal note says all eight cases were entered, but recheck the current draft before submission; they have not been run against an authenticated synthetic reviewer workspace. Do not use real project or customer data, and do not invent fixture IDs.

## Submission gates

- [x] Complete the OpenAI Platform sign-in and passkey check; the saved draft is open at Testing.
- [x] Set the OpenAI challenge token as the encrypted Vercel production variable `OPENAI_APP_VERIFICATION_CHALLENGE`, deploy, verify the endpoint returns the exact value as plain text, and confirm the OpenAI portal reports the Stoic domain as verified. Keep the token out of source control.
- [x] Apply `20260929233533_stoic_oauth_audience_hook.sql`. The hook changes only `claims.aud` for enabled OAuth client IDs and leaves other Auth events untouched.
- [x] Register “ChatGPT — Stoic Connector” as a predefined public Supabase OAuth client for `https://chatgpt.com/connector/oauth/xdtQfMhK2XPX`, map its client ID in `stoic_private.mcp_oauth_clients`, and enable `pg-functions://postgres/stoic_private/custom_access_token_hook`. Dynamic OAuth app registration stays disabled. Stoic checks the signature-verified token's issuer, MCP resource audience, expiry, subject, and OAuth client ID; verify the actual token claims and granted scopes during the live flow. Supabase supports only standard OIDC scopes, so Stoic authorizes operations through the owner-paired agent profile and server-side role checks. See [OpenAI authentication](https://developers.openai.com/plugins/build/auth), [Supabase token security](https://supabase.com/docs/guides/auth/oauth-server/token-security), and [Supabase OAuth scopes](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows#available-scopes).
- [ ] Resolve Chrome’s `ERR_BLOCKED_BY_CLIENT` on the ChatGPT OAuth callback, complete the authenticated MCP tool scan, then inspect every discovered tool, schema, annotation, and UI domain.
- [ ] Provision a dedicated reviewer account with synthetic data and working paid entitlement; ensure it needs no MFA, email code, or private network.
- [ ] Verify all eight cases against the deployed endpoint and replace fixture descriptions with concrete, reproducible setup details.
- [ ] Provide a demo recording URL; the portal currently marks this field as required.
- [ ] Review the exact public listing, privacy/terms/support links, region availability, release notes, and policy attestations.
- [ ] At final submission, confirm the exact data and credentials being sent to OpenAI Platform. Submit for review only after the user approves any required legal attestation.
- [ ] Track review separately from publication; OpenAI approval and a later publish action are still required before the app appears in the directory.

## Most recent known proof — recheck before submission

- Production deployment `dpl_9cE8hmixRWcMJKTngoFW6NUhQHwe` reported `READY` and is aliased to `https://stoic.bishoptech.dev`.
- Production home, privacy, terms, and 512×512 directory icon returned HTTP 200.
- `/.well-known/oauth-protected-resource` returned HTTP 200 with the MCP resource and Supabase authorization server.
- An unauthenticated request to `/api/mcp` returned HTTP 401 with an OAuth resource-metadata challenge.
- The currently connected Codex installation successfully called `get_team_context` against the live service; this proves that installation’s bearer-key path, not OpenAI Platform OAuth or app-directory review.
- The OpenAI Platform draft contains all eight positive and negative test cases and initial release notes. Its MCP configuration has the production server, OAuth mode, predefined client, callback, token auth method `none`, and discovered Supabase endpoints saved. Owner consent redirected to the ChatGPT callback, but Chrome blocked that callback with `ERR_BLOCKED_BY_CLIENT`; the tool scan has not completed. Domain verification now reports verified. The Submit screen still requires a demo recording URL, completed MCP tool scan, and test credentials; all policy attestations remain unchecked.
- Source includes a request-time `/.well-known/openai-apps-challenge` handler. The encrypted Vercel production variable is set; deployment `dpl_9cE8hmixRWcMJKTngoFW6NUhQHwe` returns HTTP 200 with the exact portal token as `text/plain` and `no-store`, and the portal confirms the domain is verified. The token is not in source control.
- The production Supabase client and hook are configured. The MCP scan initially rejected the draft while its predefined client ID was blank; after the approved ID was entered and saved, the portal opened an account-consent page. Owner consent redirected to ChatGPT, where Chrome blocked the callback with `ERR_BLOCKED_BY_CLIENT`. The authenticated tool scan remains outstanding.
- `chatgpt-app-submission.json` is a deferred 34-tool submission snapshot. The current MCP server exposes 39 tools, including persistent idea review and workspace Contacts. Refresh and review this import file and the exact draft tool scan before resuming OpenAI Platform submission; do not treat the old snapshot as current. The current server documents `get_profile` as its only declared output schema.
- MCP tool OAuth `securitySchemes` and profile metadata are implemented in source. Unit tests, lint, typecheck, and production build pass; production deployment is Ready. Authenticated OpenAI Platform scanning remains outstanding.
- Production OAuth discovery and the unauthenticated 401 resource challenge were verified before the current local auth hardening. Deployment `dpl_9cE8hmixRWcMJKTngoFW6NUhQHwe` includes current auth validation bound to `https://stoic.bishoptech.dev/api/mcp`; the audience hook and predefined client are configured. The live OpenAI Platform token exchange and authenticated Scan Tools result remain outstanding.
