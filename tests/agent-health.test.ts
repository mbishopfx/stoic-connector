import { describe, expect, it } from "vitest";
import { agentConnectionSummary, agentHealth, FIRST_INBOX_CHECK_PROMPT } from "../src/lib/agent-health";

const now = Date.parse("2026-09-26T18:00:00Z");
const base = { status: "connected", schedule_enabled: true, schedule_cadence_minutes: 60, last_check_at: "2026-09-26T17:00:00Z" };
const connectedRecord = { ...base, platform: "codex" as const, oauth_client_id: null, access_notes: "GitHub read access; ask before merging." };

describe("scheduled check health", () => {
  it("provides a safe, one-time connection check without asking the agent to change work", () => {
    expect(FIRST_INBOX_CHECK_PROMPT).toContain("get_team_context");
    expect(FIRST_INBOX_CHECK_PROMPT).toContain("check_inbox once");
    expect(FIRST_INBOX_CHECK_PROMPT).toContain("Do not create, claim, update, or approve any work");
    expect(FIRST_INBOX_CHECK_PROMPT).toContain("do not include credentials");
  });

  it("distinguishes a first check from an overdue agent", () => {
    expect(agentHealth({ ...base, last_check_at: null }, now).label).toBe("Awaiting first check");
    expect(agentHealth({ ...base, last_check_at: "2026-09-26T14:00:00Z" }, now).label).toBe("Check overdue");
  });
  it("does not imply an unscheduled or revoked agent is checking in", () => {
    expect(agentHealth({ ...base, schedule_enabled: false }, now).label).toBe("On demand");
    expect(agentHealth({ ...base, schedule_enabled: false, last_check_at: null }, now).label).toBe("Awaiting first check");
    expect(agentHealth({ ...base, status: "revoked" }, now).label).toBe("Revoked");
  });
  it("marks a successful check inside the grace window", () => {
    expect(agentHealth(base, now).label).toBe("Checking in");
  });

  it("separates server proof from an owner-declared schedule", () => {
    const summary = agentConnectionSummary({ ...connectedRecord, last_check_at: null }, now);
    expect(summary.auth).toMatchObject({ label: "Stoic key paired", evidence: "server_record" });
    expect(summary.transport).toMatchObject({ label: "Streamable HTTP MCP", evidence: "product_config" });
    expect(summary.schedule).toMatchObject({ label: "Enabled · owner-declared", evidence: "owner_declared" });
    expect(summary.proof).toMatchObject({ label: "Awaiting first check", evidence: "none" });
    expect(summary.access).toMatchObject({ label: "Owner notes provided", evidence: "owner_declared" });
  });

  it("labels OAuth and unverified host postures without granting permissions", () => {
    const summary = agentConnectionSummary({ ...connectedRecord, platform: "grok", oauth_client_id: "oauth-client" }, now);
    expect(summary.auth).toMatchObject({ label: "OAuth paired", evidence: "server_record" });
    expect(summary.host).toMatchObject({ posture: "interactive_only" });
    expect(summary.proof.evidence).toBe("server_check");
    expect(summary.proof.detail).toContain("does not prove the host schedule");
  });

  it("distinguishes documented Grok Bot routines from Grok web MCP", () => {
    const grokBot = agentConnectionSummary({ ...connectedRecord, platform: "grok", harness_name: "Grok Bot", oauth_client_id: null }, now);
    const grokWeb = agentConnectionSummary({ ...connectedRecord, platform: "grok", harness_name: "Grok web", oauth_client_id: null }, now);

    expect(grokBot.host).toMatchObject({ posture: "pilot_guided", label: "Grok Bot · guided pilot path" });
    expect(grokWeb.host).toMatchObject({ posture: "interactive_only", label: "Grok web · interactive only" });
  });

  it("keeps Muse browser relay outside MCP authentication, inbox, and schedule claims", () => {
    const summary = agentConnectionSummary({ ...connectedRecord, platform: "muse", last_check_at: null }, now);
    expect(summary.host).toMatchObject({ posture: "preview" });
    expect(summary.auth).toMatchObject({ label: "Browser credentials are outside Stoic", evidence: "missing" });
    expect(summary.transport).toMatchObject({ label: "Browser relay · no MCP" });
    expect(summary.schedule).toMatchObject({ label: "Verify schedule in Muse", evidence: "none" });
    expect(summary.proof).toMatchObject({ label: "Not verified by Stoic", evidence: "none" });
    expect(summary.proof.detail).toContain("do not call Stoic's MCP inbox");
  });
});
