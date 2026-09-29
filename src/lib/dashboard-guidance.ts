import { agentHealth } from "./agent-health";

export type DashboardGuideTab = "assistant" | "agents" | "projects" | "handoffs";

export type DashboardGuideAgent = {
  id: string;
  name: string;
  platform: string;
  status: string;
  last_check_at: string | null;
  schedule_enabled: boolean;
  schedule_cadence_minutes: number;
};

export type DashboardGuideStep = {
  label: string;
  complete: boolean;
};

export type DashboardGuidance = {
  title: string;
  detail: string;
  buttonLabel: string;
  tab: DashboardGuideTab;
  agentId?: string;
  completedSteps: number;
  steps: DashboardGuideStep[];
};

type DashboardGuideInput = {
  agents: DashboardGuideAgent[];
  projects: { brief: string }[];
  handoffs: {
    assigned_agent_id: string | null;
    status: string;
    created_at: string;
  }[];
  bossAgentId: string | null;
  now?: number;
};

const SCHEDULABLE_PLATFORMS = new Set(["codex", "hermes", "openclaw"]);

export function getDashboardGuidance(input: DashboardGuideInput): DashboardGuidance {
  const now = input.now ?? Date.now();
  const connected = input.agents.filter((agent) => agent.status === "connected");
  const boss = connected.find((agent) => agent.id === input.bossAgentId);
  const worker = connected.find((agent) => agent.id !== input.bossAgentId);
  const hasBrief = input.projects.some((project) => project.brief.trim().length > 0);
  const hasAcceptedHandoff = input.handoffs.some((handoff) => handoff.status === "accepted");
  const steps: DashboardGuideStep[] = [
    { label: "Connect your first agent", complete: connected.length > 0 },
    { label: "Choose who leads", complete: Boolean(boss) },
    { label: "Connect a worker", complete: Boolean(worker) },
    { label: "Verify both agents check in", complete: Boolean(boss?.last_check_at && worker?.last_check_at) },
    { label: "Write a shared project brief", complete: hasBrief },
    { label: "Complete and accept a handoff", complete: hasAcceptedHandoff },
  ];

  const base = {
    completedSteps: steps.filter((step) => step.complete).length,
    steps,
  };

  if (input.handoffs.some((handoff) => handoff.status === "proposed")) {
    return { ...base, title: "Review a proposed assignment", detail: "The team lead suggested this handoff. Review it before it becomes available to a worker.", buttonLabel: "Review assignment", tab: "handoffs" };
  }
  if (input.handoffs.some((handoff) => handoff.status === "submitted")) {
    return { ...base, title: "Review submitted work", detail: "A worker has returned a result. Accept it or request a focused change in the handoff history.", buttonLabel: "Review result", tab: "handoffs" };
  }
  if (input.handoffs.some((handoff) => handoff.status === "blocked")) {
    return { ...base, title: "Help clear a blocker", detail: "Read the worker’s note, answer what you can, then let the agent continue on its next run.", buttonLabel: "View blocker", tab: "handoffs" };
  }
  if (input.handoffs.some((handoff) => handoff.status === "changes_requested")) {
    return {
      ...base,
      title: "Follow up on requested changes",
      detail: "Review the feedback on the returned work and make sure the worker has the context it needs. It can continue on its next successful check-in.",
      buttonLabel: "Review requested changes",
      tab: "handoffs",
    };
  }
  const claimedCount = input.handoffs.filter((handoff) => handoff.status === "claimed").length;
  if (claimedCount > 0) {
    return {
      ...base,
      title: claimedCount === 1 ? "A worker is handling a handoff" : `${claimedCount} handoffs are in progress`,
      detail: "Review the latest progress or blockers before starting similar work. The worker will continue from the shared brief on its next successful run.",
      buttonLabel: "Review active work",
      tab: "handoffs",
    };
  }

  const overdueAgent = connected.find((agent) =>
    SCHEDULABLE_PLATFORMS.has(agent.platform)
    && agent.schedule_enabled
    && agentHealth(agent, now).label === "Check overdue",
  );
  if (overdueAgent) {
    const cadence = overdueAgent.schedule_cadence_minutes === 1440
      ? "daily"
      : overdueAgent.schedule_cadence_minutes === 360
        ? "six-hour"
        : "hourly";
    return {
      ...base,
      title: `Review ${overdueAgent.name}’s inbox schedule`,
      detail: `${overdueAgent.name} has missed its expected ${cadence} check. Confirm its native schedule is enabled, then run one manual Stoic inbox check. Stoic cannot wake an offline host.`,
      buttonLabel: "Review this agent",
      tab: "agents",
      agentId: overdueAgent.id,
    };
  }

  const waiting = input.handoffs.find((handoff) => {
    return handoff.status === "assigned";
  });
  if (waiting) {
    if (!waiting.assigned_agent_id) {
      const workers = connected.filter((agent) => agent.id !== input.bossAgentId);
      if (!workers.length) {
        return {
          ...base,
          title: "Reconnect a worker for this handoff",
          detail: "This shared task has no connected worker available to claim it. Reconnect a worker, then review the open handoff before continuing.",
          buttonLabel: "Connect a worker",
          tab: "agents",
        };
      }
      const checkedAfterQueueing = workers.filter((agent) => agent.last_check_at && new Date(agent.last_check_at).getTime() > new Date(waiting.created_at).getTime());
      return checkedAfterQueueing.length
        ? {
          ...base,
          title: "The team handoff is still unclaimed",
          detail: `${checkedAfterQueueing.map((agent) => agent.name).join(" and ")} checked in after this task entered the shared queue, but it remains open. Review the task’s outcome and constraints, or assign it to one worker if ownership should be explicit.`,
          buttonLabel: "Review team handoff",
          tab: "handoffs",
        }
        : {
          ...base,
          title: "The team handoff is waiting for worker check-ins",
          detail: "Connected workers can claim this shared task on their next successful inbox check. Stoic cannot wake an offline host.",
          buttonLabel: "Review team handoff",
          tab: "handoffs",
        };
    }
    const assignee = connected.find((agent) => agent.id === waiting.assigned_agent_id);
    if (assignee?.last_check_at && new Date(assignee.last_check_at).getTime() > new Date(waiting.created_at).getTime()) {
      return {
        ...base,
        title: "The assigned handoff is still unclaimed",
        detail: `${assignee.name} checked in after this assignment was created, but it remains unclaimed. Review the handoff or clarify its outcome and constraints.`,
        buttonLabel: "Review handoff",
        tab: "handoffs",
      };
    }
    return {
      ...base,
      title: assignee?.schedule_enabled ? "This handoff is waiting for the worker’s next check" : "Ask the worker to check in",
      detail: assignee?.schedule_enabled
        ? `${assignee.name} will see the assignment on its next successful native scheduled run. Stoic does not wake an offline agent.`
        : `${assignee?.name || "The assigned agent"} has not checked Stoic since this handoff was created. Start its MCP client and ask it to check its inbox; Stoic does not wake it.`,
      buttonLabel: "View handoff",
      tab: "handoffs",
    };
  }

  if (connected.length === 0) {
    return { ...base, title: "Connect your first agent", detail: "Give one installation its own Stoic identity. You can choose it as team lead after it connects.", buttonLabel: "Connect an agent", tab: "agents" };
  }
  if (!boss) {
    return { ...base, title: "Choose a team lead", detail: "Select one connected agent to organize assignments. The other agents can claim work and report back.", buttonLabel: "Set team rules", tab: "agents" };
  }
  if (!worker) {
    return { ...base, title: "Add a worker agent", detail: "Connect one more installation so the lead has a teammate to delegate work to.", buttonLabel: "Add an agent", tab: "agents" };
  }
  if (!boss.last_check_at || !worker.last_check_at) {
    const names = [boss, worker].filter((agent) => !agent.last_check_at).map((agent) => agent.name).join(" and ");
    return {
      ...base,
      title: "Verify the first inbox checks",
      detail: `Ask ${names} to run Stoic’s inbox check once. After that, native schedules can check for work on their next run. Stoic cannot wake an offline host.`,
      buttonLabel: "Check agent setup",
      tab: "agents",
    };
  }
  if (!hasBrief) {
    return { ...base, title: "Give the team one shared brief", detail: "Write the goal, constraints, and confirmed decisions once so each agent starts from the same context.", buttonLabel: "Write a brief", tab: "projects" };
  }
  if (!hasAcceptedHandoff) {
    return { ...base, title: "Try one small handoff", detail: "Tell Stoic what outcome you need. Review the proposed assignment, then let the worker return its result for acceptance.", buttonLabel: "Start in Stoic chat", tab: "assistant" };
  }

  const needsSchedule = connected.some((agent) => SCHEDULABLE_PLATFORMS.has(agent.platform) && !agent.schedule_enabled);
  if (needsSchedule) {
    return { ...base, title: "Choose a calm check-in rhythm", detail: "Set a cadence in each supported agent’s own scheduler. Stoic records successful checks; the agent host decides when to run.", buttonLabel: "Review agent schedules", tab: "agents" };
  }
  return { ...base, title: "Your team is ready for its next outcome", detail: "Keep the brief current, make each assignment clear, and let agents check in on the cadence you chose.", buttonLabel: "Plan the next handoff", tab: "assistant" };
}
