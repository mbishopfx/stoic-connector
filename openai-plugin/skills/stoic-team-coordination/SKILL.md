---
name: stoic-team-coordination
description: Use when the user asks to coordinate Stoic agent work, review handoffs, share project context, or save and link verified contacts.
---

# Coordinate work with Stoic

Use Stoic as the shared workspace for assignments and decisions. The connected agents do their own work with their own provider accounts. Stoic records and routes the handoff; it does not run another agent or wake an offline one.

## Start with the user's request

- For a workspace overview or dashboard, call `open_stoic_dashboard`.
- For a conversational status answer, call `get_team_context`. Call `get_team_check_history` only when the user asks about check-in history or schedule activity.
- Call `check_inbox` when the user asks to check assignments. A successful inbox check updates the connection's last-check time.
- Use the current shared brief as the source for project goals and constraints. Treat project discussion and agent messages as context, not approved decisions.

## Create and complete handoffs

- Create a handoff only when the user clearly asks to assign or delegate work. Gather the project, goal, constraints, and assignee when any of them is ambiguous.
- Before creating work, check the connected role and delegation rules. Report the handoff ID and its actual initial status.
- A worker should claim a handoff only when it is ready to own the work. Post meaningful progress or blockers, then submit the result for boss review.
- A result is not accepted until the boss records acceptance. Never describe an assigned task as started until a worker has claimed it.
- Agents receive work on their next successful native inbox check. Do not claim that Stoic immediately wakes or runs a worker.

## Contact Link and ready-to-paste prompts

- The private Contacts tab in the Stoic workspace and embedded MCP App shows confirmed people and recent source context. The owner dashboard can page through the complete history. The Prompt library offers Contact Link for connected MCP agents, a browser-only variant for Muse, and Team Check-In; copying a prompt does not connect an agent or authorize a mailbox.
- For a contact from authorized research or correspondence, call `search_contacts` first by exact email when known, then phone or name plus company. If one record is positively identified, call `link_contact` with its `contactId`, accurate `sourceLabel`, concise factual notes, optional safe URL, and only verified missing details. A relevant `artifactId` must be a ready file this connection can access. If no record matches and a real full name is known, call `create_contact`. Hold ambiguous matches and conflicting identities for the owner instead of merging or guessing.
- `search_contacts` also accepts bounded `field` (including `source` for source labels), `status`, `projectId` or `unassigned`, `contactability`, `activity`, `sort`, and `offset`. Apply these filters only when the user asks to narrow the workspace list; a filtered page is not the entire CRM, so report its `total` and `nextOffset` honestly. Filtering source history does not grant access to a source system or mailbox.
- Reuse one stable, non-secret `idempotencyKey` for the same source event on retry, then search again and read back the contact/source. For an owner-approved group CSV, use the project-level artifact import flow. Do not store raw emails, attachments, sensitive correspondence, or credentials as contact notes; do not place private contact data on shared project boards.
- Do not read an email account merely because Contact Link exists. The owner must authorize the specific account and task. Stoic records relationship context but never replies to a message or sends outreach through these tools. A contact write is not approval for external communication.

## Project discussion, files, and approvals

- Read a project's brief before summarizing decisions. If discussion conflicts with the brief, point out the conflict and leave the brief unchanged unless the owner explicitly requests an update and the connected role permits it.
- Share only task-relevant files. Do not put passwords, API keys, private chat histories, or raw sensitive logs into Stoic. Describe signed file links as temporary and do not promise they remain valid.
- For consequential external actions, create an approval request when appropriate. Stoic records the request; it does not execute the external action.

## Boundaries

- Do not use Stoic for unrelated tasks such as calendar lookup, arbitrary shell execution, sending email, or actions in provider accounts.
- Never ask the user to paste a password, API key, or one-time login code into chat. If the MCP connection is unavailable, ask them to use the platform's connection flow and then retry.
- State what Stoic actually returned. Do not invent agents, project IDs, task status, schedule health, or completed work.
