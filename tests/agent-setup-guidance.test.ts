import { describe, expect, it } from "vitest";
import { getAgentSetupGuidance, hermesInstallPrompt } from "../src/lib/agent-setup-guidance";

const worker = {
  id: "worker",
  platform: "hermes" as const,
  status: "connected",
  last_check_at: "2026-09-28T12:00:00Z",
  schedule_enabled: false,
};

describe("per-agent setup guidance", () => {
  it("starts with pairing, then asks for server evidence", () => {
    const progress = getAgentSetupGuidance({
      agent: { ...worker, status: "pending", last_check_at: null },
      bossAgentId: "boss",
      handoffs: [],
    });

    expect(progress.nextStep?.id).toBe("connection");
    expect(progress.steps.find((step) => step.id === "inbox_check")?.complete).toBe(false);
  });

  it("requires a host schedule declaration after a successful check", () => {
    const progress = getAgentSetupGuidance({ agent: worker, bossAgentId: "boss", handoffs: [] });

    expect(progress.nextStep?.id).toBe("schedule");
  });

  it("labels the configured schedule as owner-declared and waits for an accepted worker handoff", () => {
    const progress = getAgentSetupGuidance({
      agent: { ...worker, schedule_enabled: true },
      bossAgentId: "boss",
      handoffs: [{ assigned_agent_id: "worker", created_by_agent_id: "boss", status: "submitted" }],
    });

    expect(progress.completedSteps).toBe(3);
    expect(progress.nextStep?.id).toBe("handoff");
    expect(progress.steps.find((step) => step.id === "schedule")?.detail).toContain("your declaration");
  });

  it("recognizes the boss's accepted assignment without counting another worker's work", () => {
    const progress = getAgentSetupGuidance({
      agent: { ...worker, id: "boss", platform: "codex", schedule_enabled: true },
      bossAgentId: "boss",
      handoffs: [
        { assigned_agent_id: "worker", created_by_agent_id: "other-boss", status: "accepted" },
        { assigned_agent_id: "worker", created_by_agent_id: "boss", status: "accepted" },
      ],
    });

    expect(progress.nextStep).toBeNull();
    expect(progress.completedSteps).toBe(progress.steps.length);
  });

  it("omits native scheduling for interactive-only clients", () => {
    const progress = getAgentSetupGuidance({
      agent: { ...worker, platform: "grok", schedule_enabled: false },
      bossAgentId: "boss",
      handoffs: [],
    });

    expect(progress.steps.map((step) => step.id)).toEqual(["connection", "inbox_check", "handoff"]);
  });

  it("adds a declared schedule step for a documented Grok Bot routine", () => {
    const progress = getAgentSetupGuidance({
      agent: { ...worker, platform: "grok", harness_name: "Grok Bot", schedule_enabled: false },
      bossAgentId: "boss",
      handoffs: [],
    });

    expect(progress.steps.map((step) => step.id)).toEqual(["connection", "inbox_check", "schedule", "handoff"]);
    expect(progress.steps.find((step) => step.id === "schedule")?.detail).toContain("personal Grok Bot routine");
  });

  it("describes Muse as a stored-credential browser relay rather than an MCP pairing", () => {
    const progress = getAgentSetupGuidance({
      agent: { ...worker, platform: "muse", status: "pending", last_check_at: null },
      bossAgentId: null,
      handoffs: [],
    });

    expect(progress.steps[0].detail).toContain("stored credentials");
    expect(progress.steps[0].detail).toContain("does not connect through Stoic MCP");
    expect(progress.steps.map((step) => step.id)).not.toContain("schedule");
  });
});

describe("Hermes install prompt", () => {
  it("guides a safe, verifiable install without embedding an agent credential", () => {
    const prompt = hermesInstallPrompt("https://stoic.bishoptech.dev/api/mcp");

    expect(prompt).toContain("https://stoic.bishoptech.dev/api/mcp");
    expect(prompt).toContain("preserve every existing entry");
    expect(prompt).toContain("private secret environment file");
    expect(prompt).toContain("Bearer ${STOIC_AGENT_KEY}");
    expect(prompt).toContain("hermes mcp test stoic_connector");
    expect(prompt).toContain("get_team_context and check_inbox once");
    expect(prompt).not.toContain("PASTE_STOIC_KEY_HERE");
  });
});
