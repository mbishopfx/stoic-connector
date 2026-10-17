import { describe, expect, it } from "vitest";
import { canCompleteArtifact, canReadHandoff } from "../src/lib/handoff-policy";
import type { AgentIdentity } from "../src/lib/identity";

const worker: AgentIdentity = { agentId: "worker-a", workspaceId: "workspace", ownerId: "owner", isBoss: false };
const boss: AgentIdentity = { ...worker, agentId: "boss", isBoss: true };

describe("handoff read access", () => {
  it("lets connected workers read routed assignments and proposed history within their workspace", () => {
    expect(canReadHandoff(worker, { assigned_agent_id: "worker-a", status: "assigned" })).toBe(true);
    expect(canReadHandoff(worker, { assigned_agent_id: "worker-b", status: "assigned" })).toBe(true);
    expect(canReadHandoff(worker, { assigned_agent_id: "worker-a", status: "proposed" })).toBe(true);
  });

  it("allows the designated boss to review team handoffs", () => {
    expect(canReadHandoff(boss, { assigned_agent_id: "worker-b", status: "submitted" })).toBe(true);
    expect(canReadHandoff(boss, { assigned_agent_id: "worker-b", status: "proposed" })).toBe(true);
  });

  it("reads open team-queue history without a stale eligibility snapshot", () => {
    const open = { assigned_agent_id: null, status: "assigned" };
    expect(canReadHandoff(worker, open)).toBe(true);
    expect(canReadHandoff(worker, { ...open, status: "proposed" })).toBe(true);
    expect(canReadHandoff(worker, { assigned_agent_id: "worker-b", status: "assigned" })).toBe(true);
  });

  it("only lets the uploader or boss finalize a pending file", () => {
    expect(canCompleteArtifact(worker, { uploaded_by_agent_id: "worker-a" })).toBe(true);
    expect(canCompleteArtifact(worker, { uploaded_by_agent_id: "worker-b" })).toBe(false);
    expect(canCompleteArtifact(boss, { uploaded_by_agent_id: "worker-b" })).toBe(true);
  });
});
