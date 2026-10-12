# Stoic Contacts Workspace UX Implementation Plan

> **For Hermes:** Use the subagent-driven-development skill task-by-task if delegating. Direct implementation on this feature branch is permitted.

**Goal:** Make the existing private Contacts tab fast to scan, search, filter, and maintain across many agent-discovered relationships.

**Architecture:** Keep the live `contacts`/`contact_sources` schema and write tools intact. Extend the owner and agent list read with a validated, workspace-scoped filter contract, applied server-side before pagination. Use the documented PostgREST `!inner` relation only for source-label search, with literal escaping. Reorganize the owner UI into a search-first contact workspace with responsive filters, clear active-filter chips, accurate counts, compact rows, and on-demand editing/history. Mirror essential filters in the MCP App without expanding agent permissions. No migration or production changes in this branch.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod, Supabase PostgREST, MCP App widget, Vitest.

---

### Task 1: Define a safe filter contract and query

**Files:**
- Create: `src/lib/contact-filters.ts`
- Modify: `src/lib/contacts.ts`, `src/app/api/contacts/route.ts`, `src/app/api/mcp/route.ts`
- Test: `tests/contact-filter-query.test.ts`, `tests/contact-filter-route.test.ts`

1. Write failing tests for validated search field, status, project/unassigned, contactability, recent activity, sort, offset, and exact workspace scope. Reject invalid enum/UUID/offset; treat `%`, `_`, commas, and parentheses as literal user input in field searches.
2. Add one typed filter schema and a server query builder. Keep default MCP behavior compatible, cap search and pagination, and preserve workspace/subscription checks. Use full-text search for broad terms, `ilike` for a selected field, and `contact_sources!inner` for source-label search. Filters must apply before `range` and exact count.
3. Add stable sort with ID tie-breaker. Return the same `{ contacts, total, nextOffset }` envelope so existing clients still work. Do not fetch arbitrary user contacts outside the active workspace.

### Task 2: Redesign the owner Contacts tab

**Files:**
- Create: `src/components/contacts-workspace.tsx`
- Modify: `src/components/relay-dashboard.tsx`, `src/app/globals.css`
- Test: `tests/contacts-workspace.test.tsx`

1. Move the Contacts view into a focused component. Lead with search and filter controls, not two large forms. Keep Add and CSV Import behind explicit disclosure panels. Preserve existing owner writes and complete source-history pagination.
2. Add status, project, contactability, last-activity, and sort controls with resettable active-filter chips and accurate filtered-result ranges. Debounce search, discard stale responses, and provide distinct loading, error, zero-results, and no-workspace-contacts states.
3. Render compact, legible contact summaries with project, method availability, last activity, and a keyboard-operable detail disclosure for notes, status updates, interaction linking, and source timeline. Keep text readable in dark mode and layout usable on mobile.
4. Preserve idempotency keys across a failed/retried owner write, including create and import. Do not send mail or outreach.

### Task 3: Keep the embedded MCP App aligned

**Files:**
- Modify: `src/mcp-app/widget.ts`, `src/lib/mcp-app-resource.ts`, `public/stoic-mcp-widget.js`, `openai-plugin/skills/stoic-team-coordination/SKILL.md`, `src/app/developers/page.tsx`
- Test: `tests/mcp-app-contact-surface.test.ts`

1. Add the same bounded read filters and result counts to the MCP App Contacts view. Keep write forms as-is and maintain profile-scoped MCP access.
2. Update the embedded resource cache key and regenerate the tracked widget. Document filter support in the agent skill and developer page without implying inbox or email access.

### Task 4: Verify and hand off safely

**Files:**
- Modify: `README.md`, `state.md`

1. Run `npm test`, `npm run test:sql`, `npm run typecheck`, `npm run lint`, `NEXT_PUBLIC_APP_URL=https://stoic.bishoptech.dev npm run build`, `npm run package:openai-plugin`, and `git diff --check`. Use Node 22.12+ and keep the pre-existing `output/`/`tmp/` untouched.
2. Smoke-test public routes and the built widget. Remove `.next` after the test server is stopped; retain the requested plugin ZIP and tracked bundle.
3. Commit only intended files on `feat/stoic-contacts-workspace-ux`. Prepare a preview-only branch review; do not merge or deploy production without Matt's explicit approval for this new UX slice.

**Acceptance:** A search/filter combination returns the correct workspace-scoped count and stable page, including source-label lookup and missing-email prospect slices. Clearing one filter leaves the others intact. Rapid searches cannot replace newer results with stale data. Owner editing and source read-back still work, and the MCP App remains functional under the same agent permissions.
