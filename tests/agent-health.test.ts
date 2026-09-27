import { describe, expect, it } from "vitest";
import { agentHealth } from "../src/lib/agent-health";

const now = Date.parse("2026-09-26T18:00:00Z");
const base = { status: "connected", schedule_enabled: true, schedule_cadence_minutes: 60, last_check_at: "2026-09-26T17:00:00Z" };

describe("scheduled check health", () => {
  it("distinguishes a first check from an overdue agent", () => {
    expect(agentHealth({ ...base, last_check_at: null }, now).label).toBe("Awaiting first check");
    expect(agentHealth({ ...base, last_check_at: "2026-09-26T14:00:00Z" }, now).label).toBe("Check overdue");
  });
  it("does not imply an unscheduled or revoked agent is checking in", () => {
    expect(agentHealth({ ...base, schedule_enabled: false }, now).label).toBe("On demand");
    expect(agentHealth({ ...base, status: "revoked" }, now).label).toBe("Revoked");
  });
  it("marks a successful check inside the grace window", () => {
    expect(agentHealth(base, now).label).toBe("Checking in");
  });
});
