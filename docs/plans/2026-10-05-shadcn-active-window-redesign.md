# Active Window Redesign with shadcn/ui

## Scope

Refresh the content view for all twelve dashboard tabs while leaving the left toolbar's structure, labels, order, width, and navigation behavior alone. Keep existing commands, permission checks, privacy boundaries, and persisted product data intact. Use one shadcn component family throughout the active views.

## Component base

Use shadcn's current `base-nova` style backed by Base UI. The current catalog includes `Field`, `Empty`, `Attachment`, `Message`, and `Message Scroller`, alongside the established form, disclosure, overlay, and data-display components. Adopt semantic CSS variables for color and radius so every component follows the same theme. The newest `Questionnaire` is aimed at guided question flows; it is not a fit for these persistent workspace screens.

## Tab-by-tab mapping

| Tab | Recommended shadcn components | Interaction focus |
| --- | --- | --- |
| Stoic chat | `Message`, `Bubble`, `MessageScroller`, `Attachment`, `InputGroup`, `Textarea`, `Sheet`, `Badge`, `Empty`, `Spinner` | Keep it a bounded request-to-reviewed-handoff flow. Preserve project selection, file/voice input, and the explicit create or dismiss step. Keep scroll position under the reader's control. |
| Ideas | `Card`, `Badge`, `ToggleGroup`, `Select`, `Collapsible`, `Field`, `Empty`, `Skeleton`, `Button` | Make review state, evidence, project filter, pagination, and worker/Observe-mode requirements easy to scan. |
| Overview | `Card`, `Avatar`, `Badge`, `Progress`, `Empty`, `Skeleton`, `AlertDialog` | Put setup guidance, current work, agent check-ins, and owner decisions into a clear hierarchy. Confirm approval decisions. |
| Handoffs | `Card`, `Badge`, `ScrollArea`, `Separator`, `Field`, `Input`, `Textarea`, `Select`, `Dialog`, `Sheet` | Keep the list/detail and event history readable; use a drawer on narrow screens. Preserve status-gated actions and cursor pagination. |
| Message board | `Message`, `MessageGroup`, `MessageScroller`, `Avatar`, `Badge`, `Field`, `Select`, `Textarea`, `Empty` | Make project scope, reply context, and post type explicit. Preserve reply nesting and the current refresh cadence. |
| Contacts | `Input`, `Select`, `ToggleGroup`, `Badge`, `Field`, `Card`, `Sheet`, `Accordion`, `Empty`, `Skeleton`, `Button` | Keep server-side filters and 50-row pagination. Use a desktop list/detail split and a mobile detail sheet. Keep create/import and source history available without crowding search. |
| Projects | `Combobox`, `Card`, `Badge`, `Dialog`, `Field`, `Textarea`, `Select`, `Button` | Make project switching and routing clear; preserve optimistic/version checks when saving the shared brief. |
| Agents | `Card`, `Avatar`, `Badge`, `Tabs`, `Field`, `Select`, `Switch`, `AlertDialog`, `Button` | Separate connection, access, scheduling, and team controls while keeping status proof and access boundaries visible. Confirm destructive credential actions. |
| Prompt library | `Card`, `Badge`, `Accordion`, `Button`, `Empty` | Keep copy feedback and prompt preview close together; preserve the explanation that prompts do not connect agents or send outreach. |
| Knowledge | `Tabs`, `Card`, `ScrollArea`, `Field`, `Select`, `Checkbox`, `Switch`, `Badge`, `Empty`, `Skeleton` | Keep Notes/Graph navigation, note filters, steward scheduling, and review actions in a consistent layout. Retain the domain-specific SVG graph inside shadcn surfaces. |
| Artifacts | `Attachment`, `Card`, `Input`, `Select`, `AlertDialog`, `Empty`, `Skeleton`, `Button` | Show real file metadata and processing state, retain project/handoff filters, and confirm deletion. Do not imply upload progress unless it is measurable. |
| Plan & billing | `Card`, `Badge`, `Separator`, `Button` | Surface plan and usage facts with direct account actions. Avoid quota meters because this plan has no monthly usage cap. |

## Appearance preferences

Offer Light, Dark, and System modes; four curated accent palettes; comfortable or compact spacing; and a small radius preference. Save those preferences in browser storage and apply them through shadcn semantic tokens. The existing `stoic-theme` storage key keeps current light/dark selections. These are browser-local preferences; syncing them across devices would require a server-side workspace preference field.

## Technical boundaries

- Keep left navigation markup and behavior outside this redesign.
- Use shadcn components for controls, disclosures, messages, status, empty/loading states, and content surfaces. Preserve product-specific domain visuals such as the knowledge graph.
- Keep server-side filters and writes as the source of truth. Use shadcn `Table` only where it fits; the official Data Table guide builds a custom table on the base `Table` and TanStack Table, so Contacts does not need a second client-side data model.
- Honor reduced-motion preferences and keep transitions short and informative.
- Keep the current MCP tools and embedded plugin permission model unchanged. The web dashboard tabs are the visual scope; the embedded MCP App remains a separate surface.

## Official references checked 2026-10-05

- [Component catalog](https://ui.shadcn.com/docs/components)
- [Next.js installation](https://ui.shadcn.com/docs/installation/next)
- [Theming and semantic variables](https://ui.shadcn.com/docs/theming)
- [Next.js dark mode](https://ui.shadcn.com/docs/dark-mode/next)
- [Data Table guide](https://ui.shadcn.com/docs/components/data-table)
- [Attachment](https://ui.shadcn.com/docs/components/attachment)
- [Message](https://ui.shadcn.com/docs/components/message)
- [Message Scroller](https://ui.shadcn.com/docs/components/message-scroller)
