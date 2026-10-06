import { describe, expect, it } from "vitest";
import { agentInstallPrompt, stoicAgentInstructions } from "../src/lib/agent-install-guidance";
import { agentConnectionGuide } from "../src/lib/agent-connection-guidance";

describe("agent-agnostic install instructions", () => {
  it("includes the ideas and contact boundaries in every harness setup prompt", () => {
    for (const harness of ["Codex", "Hermes", "OpenClaw", "Grok Bot", "Claude", "ChatGPT", "Local helper"]) {
      const prompt = agentInstallPrompt(harness, "https://stoic.example.com/api/mcp");
      expect(prompt).toContain("list_team_ideas");
      expect(prompt).toContain("create_contact");
      expect(prompt).toContain("link_contact");
      expect(prompt).toContain("import_contacts_from_artifact");
      expect(prompt).toContain("Never contact a prospect");
      expect(prompt).toContain("https://stoic.example.com/api/mcp");
    }
  });

  it("gives verified schedulers a setup path and keeps unverified harnesses interactive", () => {
    expect(agentInstallPrompt("Hermes", "https://stoic.example.com/api/mcp")).toContain("Create one new Hermes cron job");
    expect(agentInstallPrompt("OpenClaw", "https://stoic.example.com/api/mcp")).toContain("Create one new OpenClaw recurring automation");
    expect(agentInstallPrompt("Grok Bot", "https://stoic.example.com/api/mcp")).toContain("Create one new Grok Bot routine");
    expect(agentInstallPrompt("Grok web", "https://stoic.example.com/api/mcp")).toContain("Grok web custom MCP is interactive");
    expect(agentInstallPrompt("Claude", "https://stoic.example.com/api/mcp")).toContain("First identify the Claude surface");
    expect(agentInstallPrompt("Claude", "https://stoic.example.com/api/mcp")).toContain("Eligible paid Claude Cowork accounts support recurring Scheduled tasks");
    expect(agentInstallPrompt("Claude", "https://stoic.example.com/api/mcp")).toContain("confirming Stoic is available in that task");
    expect(agentInstallPrompt("ChatGPT", "https://stoic.example.com/api/mcp")).toContain("do not assume a custom MCP app is available");
  });

  it("keeps the nightly diary schedule separate when the check-in cadence is not hourly", () => {
    const prompt = agentInstallPrompt("Codex", "https://stoic.example.com/api/mcp", 360);
    expect(prompt).toContain("every six hours");
    expect(prompt).toContain("selected team check-in cadence does not replace the nightly diary run");
    expect(prompt).toContain("11:30 PM in the project's configured local time zone");
  });

  it("tailors setup to Grok web, Gemini CLI, and OpenClaw credential behavior", () => {
    const grok = agentInstallPrompt("Grok web", "https://stoic.example.com/api/mcp");
    expect(grok).toContain("New Connector → Custom");
    expect(grok).toContain("admin may first need to provision");
    expect(grok).toContain("Grok web supports custom MCP connectors for interactive conversations");

    const grokBot = agentInstallPrompt("Grok Bot", "https://stoic.example.com/api/mcp");
    expect(grokBot).toContain("Remote HTTPS option");
    expect(grokBot).toContain("A Team Bot's own key is shared");
    expect(grokBot).toContain("use Stoic OAuth");
    expect(grokBot).toContain("Routines belong to the person");
    expect(grokBot).toContain("not team-wide schedules");

    const gemini = agentInstallPrompt("Gemini CLI", "https://stoic.example.com/api/mcp");
    expect(gemini).toContain("remote HTTP MCP support");
    expect(gemini).toContain("private, access-restricted user settings file");
    expect(gemini).toContain("do not pass the key in a command");

    const openclaw = agentInstallPrompt("OpenClaw", "https://stoic.example.com/api/mcp");
    expect(openclaw).toContain("openclaw mcp doctor stoic-connector --probe");
    expect(openclaw).toContain("literal sensitive headers");
  });

  it("routes Muse through its stored-credential browser relay, never generic MCP setup", () => {
    const prompt = agentInstallPrompt("Muse", "https://stoic.example.com/api/mcp");
    expect(prompt).toContain("https://stoic.example.com/login");
    expect(prompt).toContain("Muse's stored credentials");
    expect(prompt).toContain("not a native Stoic MCP connection");
    expect(prompt).not.toContain("STOIC_AGENT_KEY");
    expect(prompt).not.toContain("check_inbox");
    expect(agentConnectionGuide("muse", "https://stoic.example.com/api/mcp", "Muse")).toBeNull();
  });

  it("keeps the Claude bearer environment reference literal and names the owner-only idea review rule", () => {
    const prompt = agentInstallPrompt("Claude", "https://stoic.example.com/api/mcp");
    expect(prompt).toContain('Bearer ${STOIC_AGENT_KEY}');
    expect(prompt).toContain("Claude client is not registered");
    expect(prompt).not.toContain("undefined");
    expect(stoicAgentInstructions()).toContain("Never accept, archive, or delete ideas for the owner");
  });
});
