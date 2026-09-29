import { describe, expect, it } from "vitest";
import { getDashboardGuidance } from "../src/lib/dashboard-guidance";

const now = Date.parse("2026-09-28T11:30:00Z");
const boss = { id: "boss", name: "Codex lead", platform: "codex", status: "connected", last_check_at: "2026-09-28T10:00:00Z", schedule_enabled: true, schedule_cadence_minutes: 60 };
const worker = { id: "worker", name: "Hermes", platform: "hermes", status: "connected", last_check_at: "2026-09-28T10:00:00Z", schedule_enabled: true, schedule_cadence_minutes: 60 };
const readyTeam = { agents: [boss, worker], projects: [{ brief: "Ship a careful launch." }], handoffs: [], bossAgentId: boss.id, now };

describe("dashboard guidance", () => {
  it("guides a new workspace to connect its first agent", () => {
    const guidance = getDashboardGuidance({ agents: [], projects: [], handoffs: [], bossAgentId: null });
    expect(guidance).toMatchObject({ title: "Connect your first agent", tab: "agents", completedSteps: 0 });
  });

  it("asks for a worker after a connected lead is selected", () => {
    const guidance = getDashboardGuidance({ ...readyTeam, agents: [boss], projects: [], bossAgentId: boss.id });
    expect(guidance).toMatchObject({ title: "Add a worker agent", tab: "agents" });
  });

  it("prioritizes first inbox checks before asking for a brief", () => {
    const guidance = getDashboardGuidance({ ...readyTeam, agents: [boss, { ...worker, last_check_at: null }] });
    expect(guidance.title).toBe("Verify the first inbox checks");
    expect(guidance.detail).toContain("cannot wake an offline host");
  });

  it("surfaces an unclaimed assignment as waiting for the native scheduled check", () => {
    const guidance = getDashboardGuidance({
      ...readyTeam,
      handoffs: [{ assigned_agent_id: worker.id, status: "assigned", created_at: "2026-09-28T11:00:00Z" }],
    });
    expect(guidance).toMatchObject({ title: "This handoff is waiting for the worker’s next check", tab: "handoffs" });
    expect(guidance.detail).toContain("Stoic does not wake an offline agent");
  });

  it("surfaces an open team-queue handoff while workers wait for their next check", () => {
    const guidance = getDashboardGuidance({
      ...readyTeam,
      handoffs: [{ assigned_agent_id: null, status: "assigned", created_at: "2026-09-28T11:00:00Z" }],
    });

    expect(guidance).toMatchObject({ title: "The team handoff is waiting for worker check-ins", buttonLabel: "Review team handoff", tab: "handoffs" });
    expect(guidance.detail).toContain("next successful inbox check");
    expect(guidance.detail).toContain("cannot wake an offline host");
  });

  it("identifies a shared-queue task that remains unclaimed after a worker check-in", () => {
    const guidance = getDashboardGuidance({
      ...readyTeam,
      agents: [boss, { ...worker, last_check_at: "2026-09-28T11:10:00Z" }],
      handoffs: [{ assigned_agent_id: null, status: "assigned", created_at: "2026-09-28T11:00:00Z" }],
    });

    expect(guidance).toMatchObject({ title: "The team handoff is still unclaimed", buttonLabel: "Review team handoff", tab: "handoffs" });
    expect(guidance.detail).toContain("checked in after this task entered the shared queue");
  });

  it("directs the owner to reconnect a worker if an open team task has no connected workers", () => {
    const guidance = getDashboardGuidance({
      ...readyTeam,
      agents: [boss],
      handoffs: [{ assigned_agent_id: null, status: "assigned", created_at: "2026-09-28T11:00:00Z" }],
    });

    expect(guidance).toMatchObject({ title: "Reconnect a worker for this handoff", buttonLabel: "Connect a worker", tab: "agents" });
  });

  it("shows a direct assignment that remains unclaimed after the assigned agent checked in", () => {
    const guidance = getDashboardGuidance({
      ...readyTeam,
      handoffs: [{ assigned_agent_id: worker.id, status: "assigned", created_at: "2026-09-28T09:00:00Z" }],
    });

    expect(guidance).toMatchObject({ title: "The assigned handoff is still unclaimed", buttonLabel: "Review handoff", tab: "handoffs" });
  });

  it("puts owner review actions before general setup suggestions", () => {
    const guidance = getDashboardGuidance({ ...readyTeam, agents: [boss, { ...worker, last_check_at: "2026-09-28T08:00:00Z" }], now: Date.parse("2026-09-28T13:00:00Z"), handoffs: [{ assigned_agent_id: worker.id, status: "submitted", created_at: "2026-09-28T11:00:00Z" }] });
    expect(guidance).toMatchObject({ title: "Review submitted work", buttonLabel: "Review result", tab: "handoffs" });
  });

  it("guides the owner back to work that was returned for changes", () => {
    const guidance = getDashboardGuidance({
      ...readyTeam,
      handoffs: [{ assigned_agent_id: worker.id, status: "changes_requested", created_at: "2026-09-28T11:00:00Z" }],
    });

    expect(guidance).toMatchObject({ title: "Follow up on requested changes", buttonLabel: "Review requested changes", tab: "handoffs" });
    expect(guidance.detail).toContain("next successful check-in");
  });

  it("surfaces claimed work instead of suggesting another similar handoff", () => {
    const guidance = getDashboardGuidance({
      ...readyTeam,
      handoffs: [
        { assigned_agent_id: worker.id, status: "claimed", created_at: "2026-09-28T11:00:00Z" },
        { assigned_agent_id: worker.id, status: "claimed", created_at: "2026-09-28T11:10:00Z" },
      ],
    });

    expect(guidance).toMatchObject({ title: "2 handoffs are in progress", buttonLabel: "Review active work", tab: "handoffs" });
    expect(guidance.detail).toContain("before starting similar work");
  });

  it("routes the first handoff through Stoic chat after the brief is ready", () => {
    const guidance = getDashboardGuidance(readyTeam);
    expect(guidance).toMatchObject({ title: "Try one small handoff", tab: "assistant", completedSteps: 5 });
  });

  it("recommends a native schedule after the first accepted handoff", () => {
    const guidance = getDashboardGuidance({
      ...readyTeam,
      agents: [boss, { ...worker, schedule_enabled: false }],
      handoffs: [{ assigned_agent_id: worker.id, status: "accepted", created_at: "2026-09-28T11:00:00Z" }],
    });
    expect(guidance).toMatchObject({ title: "Choose a calm check-in rhythm", tab: "agents", completedSteps: 6 });
  });

  it("routes an overdue scheduled agent to its setup with a recovery prompt", () => {
    const guidance = getDashboardGuidance({
      ...readyTeam,
      agents: [{ ...boss, last_check_at: "2026-09-28T12:30:00Z" }, { ...worker, last_check_at: "2026-09-28T08:00:00Z" }],
      now: Date.parse("2026-09-28T13:00:00Z"),
    });
    expect(guidance).toMatchObject({ title: "Review Hermes’s inbox schedule", buttonLabel: "Review this agent", tab: "agents", agentId: worker.id });
    expect(guidance.detail).toContain("run one manual Stoic inbox check");
    expect(guidance.detail).toContain("Stoic cannot wake an offline host");
  });

  it("does not label an agent overdue inside the configured grace window", () => {
    const guidance = getDashboardGuidance({ ...readyTeam, now: Date.parse("2026-09-28T12:15:00Z") });
    expect(guidance.title).not.toContain("Review");
    expect(guidance.agentId).toBeUndefined();
  });

  it("does not infer unattended schedule health for interactive-only clients", () => {
    const guidance = getDashboardGuidance({
      ...readyTeam,
      agents: [{ ...boss, last_check_at: "2026-09-28T12:30:00Z" }, { ...worker, platform: "grok", last_check_at: "2026-09-28T08:00:00Z" }],
      now: Date.parse("2026-09-28T13:00:00Z"),
    });
    expect(guidance.agentId).toBeUndefined();
    expect(guidance.title).toBe("Try one small handoff");
  });
});
