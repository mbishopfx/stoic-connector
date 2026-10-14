# Room Finder redesign QA

Date: 2026-10-14

Dashboard visual review: 2026-10-13. MCP widget update: 2026-10-14.

## Review scope

Reviewed the development-only `/design-preview` using synthetic workspace data. The pass covered all 13 destinations: Analytics, Stoic Chat, Ideas, Overview, Handoffs, Contacts, Projects, Agents, Installation, Prompt library, Knowledge, Artifacts, and Plan & billing.

## Visual checks

- Desktop: all destinations use the compact icon rail; the active tab name remains a single line in the header.
- Stoic Chat: project search and room switching stay beside the conversation on desktop. Messages show sender context, grouped bubbles, owner alignment, timestamps, and a persistent composer.
- Handoffs: the selected handoff includes its goal, constraints, activity, and files in the preview; no loading placeholder remains.
- Projects, Knowledge, and Handoffs selectors display project/agent labels rather than raw IDs.
- Contacts and Knowledge render synthetic preview records without fetching or persisting account data.
- Mobile chat: checked at 390 × 844. The project list opens from a drawer, messages remain readable, and the composer stays at the bottom. The room name ellipsizes in the narrow header; its full text remains available as the heading and in the room list.
- Billing: checked after correcting Base UI anchor semantics; the page no longer raises a development issue.

## MCP plugin surface

- The widget keeps its icon-only rail, shows the active tab title, and removes the duplicate text navigation selector.
- Stoic Chat has a searchable project-room drawer, grouped sender-aware bubbles, a distinct owner bubble, and a docked composer sized for the embedded panel.
- The MCP widget bundle builds successfully, and the resource cache key is versioned so hosts request the updated JS and CSS.

## Verification

- `npm run typecheck` — passed.
- `git diff --check` — passed.
- `npm run build:mcp-app` — passed after the widget changes.
- Browser review — all 13 destinations visited; desktop layout checked across the set, with focused mobile review of Stoic Chat.

The preview route returns 404 outside development. No authentication flow was bypassed and no live account data was used.
