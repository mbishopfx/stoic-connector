# Stoic Platform Dashboard Redesign

## Objective

Redesign the Stoic owner dashboard around the documented ShadCN dashboard preset while preserving the current 12 tabs, adding evidence-based agent collaboration analytics, and simplifying Ideas into a review table with assignment and denial actions.

## Original Request

Use the dashboard preset in the supplied design files, keep the app's current tabs, add agent-to-agent statistics from six-hour activity and compound them over a month with the supplied charts, and make Ideas a table whose rows open a popup to assign the idea to an agent or deny it.

## Intake Summary

- Input shape: `specific`
- Audience: Stoic workspace owners
- Authority: `requested`
- Proof type: `artifact`
- Completion proof: The owner dashboard uses the requested dashboard shell and matching ShadCN components; all existing tabs remain; Overview displays real six-hour collaboration and MCP activity with a 30-day chart; Ideas uses a table and an accessible detail dialog that can assign an eligible connected worker or deny the idea; app code and migration/config changes pass the selected source and build checks.
- Likely misfire: Render attractive but fabricated numbers, or imply the Agents API can inspect unrelated Codex Desktop/third-party conversations. The product must count activity Stoic actually observes and send only a bounded, redacted summary to its managed analysis agent.
- Blind spots considered: The user has not answered which of the two dashboard surfaces they mean; proceed with the recommended owner web dashboard at `/dashboard`. Historical MCP calls are not currently recorded, so exact MCP call counts begin after instrumentation. Six-hour windows and daily chart buckets need a consistent UTC boundary. Assignment eligibility must honor workspace policy and connected-agent rules.
- Existing plan facts: `design/main-redesign.md` (the file present in the supplied `design/` directory) specifies `dashboard-01` as the main layout and preset `b4aRK5K0fb` for active-window components. Keep the current 12 navigation tabs and add statistics within an existing tab. Use the supplied `design/ideas.md`, `design/charts.md`, and `design/graphs.md` guidance. Ideas rows open a popup for assignment or denial.

## Goal Kind

`specific`

## Current Tranche

Complete the owner-visible product slice end to end in source: validate event and API boundaries, implement the preset shell and Ideas review flow, add real six-hour activity capture and monthly aggregation/visualization, and audit the result against the original request. Production migration application and external-provider behavior must be reported separately from local source/build proof.

## Non-Negotiable Constraints

- Preserve the current 12 tabs; do not add an analytics tab.
- Use the dashboard block and preset documented in `design/main-redesign.md`, with the supplied ShadCN component references.
- Do not use mock values as live metrics. Separate historical data coverage from activity recorded after instrumentation.
- Do not store MCP arguments, tool results, credentials, or private chat history for analytics. The Codex analysis input must be bounded and redacted.
- Keep assignment within the existing workspace, delegation policy, and connected-worker boundaries.
- Preserve existing untracked files and user work in the checkout; scope edits to the requested feature.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if the user asked for working software and a safe Worker task can be activated.

Do not stop after a single verified Worker slice when the broader owner outcome still has safe local follow-up slices. After each slice audit, advance the board to the next highest-leverage safe Worker task and continue.

Do not stop because a slice needs owner input, credentials, production access, destructive operations, or policy decisions. Mark that exact slice blocked with a receipt, create the smallest safe follow-up or workaround, and continue all local, non-destructive work that can still move the goal forward.

## Canonical Board

Machine truth lives at:

`docs/goals/stoic-platform-dashboard/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/stoic-platform-dashboard/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter and `state.yaml`.
2. Re-check the intake, constraints, blind spots, and completion proof.
3. Work only on the active board task.
4. Assign Scout, Judge, Worker, or PM according to the task.
5. Write a compact task receipt and update the board.
6. Activate each safe Worker task selected by Judge and continue until no required implementation or audit work remains.
7. Finish only with a Judge/PM audit receipt that maps current evidence back to the original request and records `full_outcome_complete: true`.
