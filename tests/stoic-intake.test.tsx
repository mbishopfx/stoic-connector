import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StoicIntake } from "../src/components/stoic-intake";
import type { DashboardGuidance } from "../src/lib/dashboard-guidance";

const guidance: DashboardGuidance = {
  title: "Connect your first agent",
  detail: "Give one installation its own Stoic identity.",
  buttonLabel: "Connect an agent",
  tab: "agents",
  completedSteps: 0,
  steps: [
    { label: "Connect your first agent", complete: false },
    { label: "Choose who leads", complete: false },
    { label: "Connect a worker", complete: false },
    { label: "Verify both agents check in", complete: false },
    { label: "Write a shared project brief", complete: false },
    { label: "Complete and accept a handoff", complete: false },
  ],
};

function renderIntake(agents: { id: string; name: string; platform: string; status: string; schedule_enabled: boolean; schedule_cadence_minutes: number; last_check_at: string | null }[] = []) {
  return renderToStaticMarkup(React.createElement(StoicIntake, {
    projects: [],
    agents,
    bossAgentId: null,
    guidance,
    command: async () => undefined,
    onHandoffCreated: () => undefined,
    onViewHandoffs: () => undefined,
    onManageAgents: () => undefined,
    onOpenGuidance: () => undefined,
    onPrefillConsumed: () => undefined,
  }));
}

describe("Stoic intake guidance", () => {
  it("shows a clear next action, team setup path, and multi-modal controls for a new owner", () => {
    const markup = renderIntake();

    expect(markup).toContain("What should your team move forward?");
    expect(markup).toContain("Connect your first agent");
    expect(markup).toContain("0 of 6");
    expect(markup).toContain("View the full setup path");
    expect(markup).toContain("Attach files");
    expect(markup).toContain("Record voice message");
    expect(markup).toContain("How Stoic handles messages and files");
  });

  it("keeps the roster preview compact as the agent team grows", () => {
    const agents = Array.from({ length: 5 }, (_, index) => ({
      id: `agent-${index + 1}`,
      name: `Worker ${index + 1}`,
      platform: "codex",
      status: "connected",
      schedule_enabled: true,
      schedule_cadence_minutes: 360,
      last_check_at: null,
    }));
    const markup = renderIntake(agents);

    expect(markup).toContain("Worker 1");
    expect(markup).toContain("Worker 3");
    expect(markup).not.toContain("Worker 4");
    expect(markup).toContain("+ 2 more agents");
  });
});
