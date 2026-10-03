# Contact Link and Prompt Library Implementation Plan

> **For Hermes:** Use the subagent-driven-development skill to implement this plan task-by-task if delegating; direct implementation in this branch is also acceptable.

**Goal:** Let connected agents safely maintain an existing person's Stoic contact/source history, and give owners copy-ready prompts for consistent, bounded agent behavior.

**Architecture:** Extend the already-live workspace-private Contacts view instead of adding a duplicate CRM. Keep the existing `create_contact`, `search_contacts`, and CSV import paths; add a separate `link_contact` write to append an idempotent, attributed source/interaction to a positively identified existing contact, optionally filling empty verified contact fields and referencing an accessible ready artifact. A curated Prompt Library is code-defined and copied from the authenticated dashboard, not a mailbox integration or a prompt-execution service. No automatic email access or outreach is introduced.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod, MCP handler, Supabase/Postgres RPC, Vitest, SQL integration tests.

---

### Task 1: Establish a safe database update path

**Files:**
- Create: `supabase/migrations/20261003133000_contact_link.sql`
- Modify: `scripts/test-sql.sh`
- Test: `tests/sql/integration.sql`

**Steps:**
1. Add failing SQL checks for source append, same-key retry, foreign workspace/owner rejection, identity conflict, empty-field enrichment, artifact provenance, and direct authenticated-role denial.
2. Add `stoic_link_contact` as a service-role-only RPC. Validate the active workspace/actor, exact contact ID, project/artifact boundaries, lengths, URL shape, and source key. Lock the source key and contact, append one source, and fill only empty verified email/phone/company/title fields. Never overwrite a nonempty conflicting identity or status. If a new email or phone changes the dedupe basis, keep the dedupe key consistent and reject an existing-key collision. Audit only counts/IDs, not contact details.
3. Add migration to the SQL test runner, using the configured scratch temp directory. Run `npm run test:sql` and expect a passing integration notice.

### Task 2: Expose scoped agent and owner linking

**Files:**
- Modify: `src/lib/contacts.ts`, `src/app/api/mcp/route.ts`, `src/app/api/commands/route.ts`
- Test: `tests/contact-link.test.ts`

**Steps:**
1. Write failing tests for parsing, actor-scoped idempotency, safe URL stripping, accessible ready artifacts, denied handoff artifacts, RPC errors, and owner/agent call shape.
2. Add a bounded `contactLinkInputSchema` and `linkContact`. Use existing workspace/subscription checks and verify an attached artifact is ready in this workspace and visible to the actor. Return explicit `updated`/`alreadyLinked` and contact ID, never outreach.
3. Register `link_contact` in MCP and the owner command; keep `search_contacts` read-only and existing `create_contact`/CSV behavior intact. Run targeted Vitest.

### Task 3: Give owners a usable source trail and prompt library

**Files:**
- Modify: `src/components/relay-dashboard.tsx`, `src/app/globals.css`, `src/app/api/contacts/route.ts`, `src/lib/contacts.ts`
- Create: `src/lib/prompt-library.ts`, `src/components/prompt-library.tsx`
- Test: `tests/prompt-library.test.ts`, `tests/prompt-library-view.test.tsx`, `tests/contact-sources-route.test.ts`

**Steps:**
1. Test the generated Contact Link prompt for search-before-write, `link_contact` for an exact match, `create_contact` for a verified new person, stable idempotency, concise provenance, no raw mail/credentials, no unapproved mailbox access or outbound contact, and read-back. Test the browser-only Muse variant and a small team check-in template.
2. Add a Prompts tab in the authenticated shell with clear MCP vs browser relay labels and accessible copy feedback. Link to Agents for setup and Contacts for read-back; do not present pasting a prompt as proof of a connection.
3. In Contacts, add an owner form to append a source/interaction to an existing contact and show a secured artifact affordance when source history includes an artifact ID. Add a paged, owner-authenticated `sourcesFor` read so a busy contact's complete interaction trail remains inspectable instead of silently truncating to a preview. Avoid duplicating the existing CRM.
4. Make styles responsive and high-contrast in both themes.

### Task 4: Document and verify without touching production

**Files:**
- Modify: `src/lib/agent-install-guidance.ts`, `src/app/developers/page.tsx`, `README.md`, `state.md`

**Steps:**
1. Keep agent setup rules aligned with Contact Link: verify exact identity first, use `link_contact` for known contacts, never import full email threads, and never auto-send messages.
2. Document the migration prerequisite and prompt-library limitations. Run `npm test`, `npm run test:sql`, `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`. Exercise a local UI/API smoke test if environment permits.
3. Remove rebuildable `.next` output after verification, preserve the pre-existing untracked `output/` and `tmp/`, and check the final branch/status. Do not apply migrations to the live Supabase project or deploy production without Matt's explicit approval; a preview relying on the live database must wait for a safe schema path.

**Acceptance:** A connected agent can link a second verified interaction to an existing workspace contact without duplicating the person or changing existing status; a retry adds no duplicate source; cross-workspace and inaccessible artifacts fail; a copied Contact Link prompt is honest about connection/permissions and yields a safe, auditable read-back; the existing Contacts UI and import flow remain intact.
