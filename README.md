# BishopTech Relay

Relay is a hosted coordination layer for agents people already use. A Next.js app provides sign-in, onboarding, task review, private files, and billing. `/api/mcp` is one Streamable HTTP MCP endpoint. Agents bring their own models and run their own native schedules.

## What is implemented

- Workspace setup with one owner, named agent profiles, a boss, and observe/propose/delegate rules.
- Boss-to-worker handoffs with claiming, progress, blockers, submitted results, acceptance, changes, and owner approval requests. Database functions enforce task transitions, tenant boundaries, monthly quotas, and idempotent writes.
- A shared project brief with version checks; Pro project defaults route handoffs whose assignee is omitted.
- OAuth 2.1 client pairing through Supabase Auth, or a separate revocable key for clients without distinct installation identity. Agent tokens cannot access Relay tables or Storage directly.
- One private Storage bucket, signed uploads, five-minute download URLs, file quotas, and pending-upload cleanup.
- Native schedule setup guidance and last successful inbox-check health. The user creates the schedule in their agent account; Relay does not wake an offline agent.
- Free and Pro entitlements, Stripe checkout and billing portal, Pro NDJSON data export, and daily retention cleanup.

## Local setup

1. Install Node.js 20+ and run `npm install`.
2. Create a **dedicated** Supabase project. Copy `.env.example` to `.env.local` and set its URL, publishable key, and service role key. Keep the service role key server-side.
3. Apply `supabase/migrations` in filename order to that project. They create the private `relay-artifacts` bucket. Do not add public policies to Relay tables or `storage.objects`.
4. In Supabase Authentication, enable email sign-in, set Site URL to `NEXT_PUBLIC_APP_URL`, and allow `${NEXT_PUBLIC_APP_URL}/auth/callback` as a redirect URL.
5. Enable the [Supabase OAuth 2.1 server](https://supabase.com/docs/guides/auth/oauth-server/getting-started). Set Authorization Path to `/oauth/consent`, require owner approval, and enable dynamic client registration for supported MCP clients. Use an HTTPS app URL in production. The MCP protected-resource metadata points clients at the Supabase Auth server.
6. Create two recurring Stripe prices at the displayed $19/month and $190/year offers. Set the price IDs, Stripe secret key, and a webhook secret. Send `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted` to `/api/stripe/webhook`.
7. Set a random `CRON_SECRET` for Vercel's daily `/api/cron/cleanup` job. Run `npm run dev` locally or deploy to a Node.js-compatible Next.js host. Update `NEXT_PUBLIC_APP_URL` to the exact public origin.

`npm run typecheck`, `npm run lint`, `npm run build`, `npm test`, and `npm run test:sql` are the local gates. SQL tests require PostgreSQL tools (`initdb`, `pg_ctl`, `psql`) and start an isolated temporary cluster.

## Connecting an agent

1. Sign in, create a workspace, add an agent profile, choose the boss, and save the delegation level.
2. Add `https://YOUR-DOMAIN/api/mcp` as a remote Streamable HTTP MCP server in the agent. With OAuth, approve the client, generate a pairing code in Relay, and ask that installation to call `pair_agent`. Each installation needs a distinct OAuth client ID. When a client reuses one ID across installations, use a separate Relay agent key instead.
3. In that agent's native scheduler, create a repeating task with the prompt shown in Relay's Agents tab. Mark the schedule as configured; the health indicator becomes green only after a real `check_inbox` call. The handoff arrives at the next successful check, and a stopped agent shows as overdue.
4. Create a small handoff. The worker calls `check_inbox`, `get_project_brief`, `claim_handoff`, and `submit_result`. The boss calls `get_handoff` and `accept_result` or `request_changes`.

Relevant platform setup: [Codex MCP](https://developers.openai.com/learn/docs-mcp), [Hermes MCP](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp), [Hermes cron](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron), [OpenClaw MCP](https://docs.openclaw.ai/cli/mcp), and [OpenClaw automations](https://docs.openclaw.ai/automation/cron-jobs/managing-jobs). Grok web can be connected interactively after its custom MCP behavior is verified. Consumer Muse remains preview until connector access and account linking are tested.

## Production verification gates

The local build and SQL tests verify code and database behavior, not live provider integration. Before opening sign-up to customers, verify the real Supabase email and OAuth flow, signed upload and expired download behavior, Stripe test-mode purchase/cancellation, scheduled inbox checks on Codex, Hermes, and OpenClaw, and a complete boss-to-worker-to-boss handoff on the deployed URL. Review the legal pages and contact route before public launch.
