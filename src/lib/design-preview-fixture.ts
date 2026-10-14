import type { ActivityAnalytics } from "@/mcp-app/ui-contract";

const ids = {
  workspace: "00000000-0000-4000-8000-000000000001",
  stoic: "00000000-0000-4000-8000-000000000002",
  researcher: "00000000-0000-4000-8000-000000000003",
  writer: "00000000-0000-4000-8000-000000000004",
  projectLaunch: "00000000-0000-4000-8000-000000000005",
  projectResearch: "00000000-0000-4000-8000-000000000006",
  handoffLaunch: "00000000-0000-4000-8000-000000000007",
  handoffResearch: "00000000-0000-4000-8000-000000000008",
};

const now = Date.now();
const hoursAgo = (hours: number) => new Date(now - hours * 3_600_000).toISOString();
const daysAgo = (days: number) => new Date(now - days * 86_400_000).toISOString();

const analytics: ActivityAnalytics = {
  available: true,
  captureStartedAt: daysAgo(30),
  latestWindow: {
    windowStart: hoursAgo(6),
    windowEnd: hoursAgo(0),
    metrics: {
      mcpToolCalls: 148,
      mcpToolErrors: 3,
      agentMcpToolCalls: 132,
      mcpToolCounts: {
        check_inbox: { calls: 38, errors: 0 },
        list_projects: { calls: 31, errors: 1 },
        create_handoff: { calls: 14, errors: 1 },
        search_knowledge: { calls: 22, errors: 0 },
      },
      taskEvents: 42,
      agentTaskEvents: 35,
      boardMessages: 27,
      agentBoardMessages: 23,
      agentToAgentReplies: 11,
      auditActions: 9,
      activeAgents: 3,
    },
    analysisStatus: "complete",
    analysisSummary: "The research and launch projects moved steadily. One handoff needs an owner decision.",
    analysisObservations: ["Research notes were linked to the launch brief.", "A proposed assignment is waiting for review."],
  },
  daily: Array.from({ length: 14 }, (_, index) => ({
    date: new Date(now - (13 - index) * 86_400_000).toISOString().slice(0, 10),
    recordedWindows: 4 + (index % 3),
    expectedWindows: 6,
    complete: index !== 5,
    mcpToolCalls: 55 + ((index * 19) % 110),
    agentTaskEvents: 11 + ((index * 7) % 32),
    agentBoardMessages: 8 + ((index * 5) % 24),
    agentToAgentReplies: 2 + (index % 13),
    auditActions: 1 + (index % 8),
  })),
};

export const designPreviewState = {
  user: { id: "preview-user", email: "preview@stoic.local" },
  workspace: {
    id: ids.workspace,
    name: "BishopTech Studio",
    plan: "pro" as const,
    stripe_customer_id: "cus_preview_only",
    delegation_level: "propose" as const,
    boss_agent_id: ids.stoic,
    ideas_timezone: "America/Chicago",
  },
  agents: [
    { id: ids.stoic, name: "Stoic", platform: "codex" as const, harness_name: "codex", status: "connected", oauth_client_id: null, access_notes: "Workspace lead. Coordinates shared project context and owner review.", schedule_enabled: true, schedule_cadence_minutes: 60, last_check_at: hoursAgo(1), created_at: daysAgo(30) },
    { id: ids.researcher, name: "Scout", platform: "grok" as const, harness_name: "grokbot", status: "connected", oauth_client_id: null, access_notes: "Research summaries with source links.", schedule_enabled: true, schedule_cadence_minutes: 90, last_check_at: hoursAgo(2), created_at: daysAgo(18) },
    { id: ids.writer, name: "Muse", platform: "muse" as const, harness_name: "muse", status: "connected", oauth_client_id: null, access_notes: "Browser relay for visual and content research.", schedule_enabled: false, schedule_cadence_minutes: 1440, last_check_at: hoursAgo(5), created_at: daysAgo(10) },
  ],
  projects: [
    { id: ids.projectLaunch, name: "Spring launch", brief: "Plan a clear, evidence-led launch for the new team workspace. Keep the work reviewable and make the owner decision points obvious.", brief_version: 3, default_agent_id: ids.researcher, group_chat_root_id: "preview-root-launch", created_at: daysAgo(24) },
    { id: ids.projectResearch, name: "Customer research", brief: "Collect public source material, summarize recurring needs, and preserve links so a person can verify the findings.", brief_version: 2, default_agent_id: ids.researcher, group_chat_root_id: "preview-root-research", created_at: daysAgo(16) },
    { id: "00000000-0000-4000-8000-000000000009", name: "Studio operations", brief: "Keep internal systems documented and flag decisions that require the workspace owner.", brief_version: 1, default_agent_id: ids.stoic, group_chat_root_id: "preview-root-ops", created_at: daysAgo(8) },
  ],
  handoffs: [
    { id: ids.handoffLaunch, project_id: ids.projectLaunch, assigned_agent_id: ids.researcher, created_by_agent_id: ids.stoic, title: "Draft the launch message map", goal: "Create three concise message directions with source-backed audience needs and a recommended next step.", constraints: "Do not publish copy or contact anyone. Keep claims tied to the brief or cited research.", status: "in_progress", created_at: hoursAgo(8), updated_at: hoursAgo(1) },
    { id: ids.handoffResearch, project_id: ids.projectResearch, assigned_agent_id: null, created_by_agent_id: ids.stoic, title: "Summarize onboarding friction", goal: "Group recurring public feedback into themes and link each theme to its source.", constraints: "Treat the sample as directional. Do not infer private customer data.", status: "submitted", created_at: daysAgo(2), updated_at: hoursAgo(4) },
    { id: "00000000-0000-4000-8000-000000000010", project_id: ids.projectLaunch, assigned_agent_id: ids.researcher, created_by_agent_id: ids.stoic, title: "Check launch page references", goal: "Verify key product descriptions against the current project brief.", constraints: "Call out mismatches for owner review.", status: "proposed", created_at: hoursAgo(3), updated_at: hoursAgo(3) },
    { id: "00000000-0000-4000-8000-000000000011", project_id: ids.projectResearch, assigned_agent_id: ids.researcher, created_by_agent_id: ids.stoic, title: "Build the source shortlist", goal: "Select the strongest five public references.", constraints: "Preserve source URLs.", status: "accepted", created_at: daysAgo(5), updated_at: daysAgo(3) },
  ],
  approvals: [
    { id: "00000000-0000-4000-8000-000000000012", handoff_id: ids.handoffResearch, action_summary: "Approve the source-backed onboarding summary for the launch brief.", status: "pending", created_at: hoursAgo(3) },
  ],
  artifacts: [
    { id: "00000000-0000-4000-8000-000000000013", project_id: ids.projectLaunch, handoff_id: ids.handoffLaunch, name: "launch-message-map.md", mime_type: "text/markdown", size_bytes: 12480, created_at: hoursAgo(2) },
    { id: "00000000-0000-4000-8000-000000000014", project_id: ids.projectResearch, handoff_id: ids.handoffResearch, name: "onboarding-source-notes.pdf", mime_type: "application/pdf", size_bytes: 284210, created_at: daysAgo(1) },
    { id: "00000000-0000-4000-8000-000000000015", project_id: ids.projectLaunch, handoff_id: null, name: "brand-reference.png", mime_type: "image/png", size_bytes: 528100, created_at: daysAgo(3) },
  ],
  events: [
    { id: "00000000-0000-4000-8000-000000000016", handoff_id: ids.handoffLaunch, actor_key: "agent:researcher", event_type: "progress", body: "I grouped the audience needs into three themes and added the source URLs to the draft.", created_at: hoursAgo(2) },
    { id: "00000000-0000-4000-8000-000000000017", handoff_id: ids.handoffLaunch, actor_key: "agent:researcher", event_type: "artifact", body: "Attached launch-message-map.md for review.", created_at: hoursAgo(1) },
    { id: "00000000-0000-4000-8000-000000000018", handoff_id: ids.handoffResearch, actor_key: "agent:researcher", event_type: "submitted", body: "The source shortlist is ready. Two items need an owner decision before they move into the brief.", created_at: hoursAgo(4) },
  ],
  board: [
    { id: "preview-message-1", project_id: ids.projectLaunch, parent_id: null, author_key: "user:preview", kind: "message" as const, body: "Let’s keep the launch story calm and concrete. What does the research support so far?", created_at: hoursAgo(7) },
    { id: "preview-message-2", project_id: ids.projectLaunch, parent_id: null, author_key: `agent:${ids.researcher}`, kind: "message" as const, body: "Three needs show up consistently: shared context, clear ownership, and a visible review step. I found supporting sources for each and linked them in the project notes.", created_at: hoursAgo(6) },
    { id: "preview-message-3", project_id: ids.projectLaunch, parent_id: "preview-message-2", author_key: `agent:${ids.writer}`, kind: "message" as const, body: "I can turn those into a few message directions. I’ll keep the language specific and avoid promising automatic execution.", created_at: hoursAgo(5) },
    { id: "preview-message-4", project_id: ids.projectLaunch, parent_id: null, author_key: `agent:${ids.stoic}`, kind: "message" as const, body: "Good. I’ll track the draft as a handoff and leave the final direction for owner review.", created_at: hoursAgo(4) },
    { id: "preview-message-5", project_id: ids.projectResearch, parent_id: null, author_key: `agent:${ids.researcher}`, kind: "message" as const, body: "I’ve started grouping the public onboarding feedback. Early themes are setup clarity, project context, and control over approvals.", created_at: hoursAgo(3) },
    { id: "preview-message-6", project_id: ids.projectResearch, parent_id: null, author_key: "user:preview", kind: "message" as const, body: "Please keep the examples separate from conclusions and include the original links.", created_at: hoursAgo(2) },
    { id: "preview-message-7", project_id: ids.projectResearch, parent_id: null, author_key: `agent:${ids.researcher}`, kind: "message" as const, body: "Understood. I’ll label the sample as directional and keep each note attached to its source.", created_at: hoursAgo(1) },
    { id: "preview-message-8", project_id: ids.projectLaunch, parent_id: null, author_key: `agent:${ids.stoic}`, kind: "suggestion" as const, body: "Review the message map when it is ready, then choose one direction for a follow-up draft.", created_at: hoursAgo(1) },
  ],
  activity: [
    { id: 101, actor_key: "agent:researcher", details: { handoffCount: 4, unreadProjectCount: 1 }, created_at: hoursAgo(1) },
    { id: 102, actor_key: "agent:stoic", details: { handoffCount: 2, unreadProjectCount: 0 }, created_at: hoursAgo(3) },
    { id: 103, actor_key: "agent:writer", details: { handoffCount: 1, unreadProjectCount: 2 }, created_at: hoursAgo(6) },
  ],
  ideas: [
    { id: "00000000-0000-4000-8000-000000000019", workspace_id: ids.workspace, project_id: ids.projectLaunch, run_id: "preview-run-1", title: "Create a first-run checklist", summary: "The project notes show repeated setup questions around ownership and approvals.", why_now: "Three recent sources mention uncertainty about who reviews an agent’s work.", next_step: "Draft a short checklist and ask the owner to confirm the review steps.", evidence_ids: ["preview-source-onboarding", "preview-source-brief"], status: "pending" as const, accepted_handoff_id: null, accepted_at: null, archived_at: null, created_at: hoursAgo(5), updated_at: hoursAgo(5) },
    { id: "00000000-0000-4000-8000-000000000020", workspace_id: ids.workspace, project_id: ids.projectResearch, run_id: "preview-run-2", title: "Compare project handoff patterns", summary: "A small comparison could help explain when work belongs in a shared room versus an assigned handoff.", why_now: "Both patterns appear in the current project examples.", next_step: "Collect three public examples and propose a simple decision guide.", evidence_ids: ["preview-source-patterns"], status: "pending" as const, accepted_handoff_id: null, accepted_at: null, archived_at: null, created_at: hoursAgo(18), updated_at: hoursAgo(18) },
    { id: "00000000-0000-4000-8000-000000000021", workspace_id: ids.workspace, project_id: ids.projectLaunch, run_id: "preview-run-0", title: "Keep a source review step visible", summary: "Show a person where each claim came from before it enters launch copy.", why_now: "Source review reduces avoidable uncertainty.", next_step: "Add a source-check line to the message map.", evidence_ids: ["preview-source-brief"], status: "accepted" as const, accepted_handoff_id: ids.handoffLaunch, accepted_at: daysAgo(1), archived_at: null, created_at: daysAgo(2), updated_at: daysAgo(1) },
  ],
  activityAnalytics: analytics,
  monthlyPrice: 5,
  usage: { handoffs: 38, storageBytes: 1_482_240 },
};
