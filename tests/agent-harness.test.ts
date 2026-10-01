import { describe, expect, it } from "vitest";
import { agentHarnessLabel, resolveAgentHarness } from "../src/lib/agent-harness";
import { museRelayPrompt } from "../src/lib/muse-browser-guidance";
import { agentInput } from "../src/lib/validation";

describe("agent harness profiles", () => {
  it("keeps harness display identity separate from MCP capability mapping", () => {
    expect(resolveAgentHarness("claude")).toEqual({ platform: "other", harnessName: "Claude" });
    expect(resolveAgentHarness("grok")).toEqual({ platform: "grok", harnessName: "Grok Bot" });
    expect(resolveAgentHarness("muse")).toEqual({ platform: "muse", harnessName: "Muse" });
    expect(resolveAgentHarness("other", "  Local assistant  ")).toEqual({ platform: "other", harnessName: "Local assistant" });
  });

  it("offers common and custom harnesses without coupling the agent's display name to them", () => {
    expect(resolveAgentHarness("claude")).toEqual({ platform: "other", harnessName: "Claude" });
    expect(resolveAgentHarness("other", "Team research bot")).toEqual({ platform: "other", harnessName: "Team research bot" });
  });

  it("derives the internal platform on the server instead of trusting a client platform field", () => {
    expect(agentInput.parse({ name: "Research Muse", harness: "muse", platform: "codex" })).toEqual({
      name: "Research Muse",
      platform: "muse",
      harnessName: "Muse",
    });
  });

  it("requires a custom harness label when Other is selected", () => {
    expect(agentInput.safeParse({ name: "Local Helper", harness: "other" }).success).toBe(false);
    expect(agentInput.parse({ name: "Local Helper", harness: "other", customHarnessName: "Private runner" }).harnessName).toBe("Private runner");
  });

  it("uses a saved harness name when displaying an agent", () => {
    expect(agentHarnessLabel({ harness_name: "Private runner", platform: "other" })).toBe("Private runner");
  });
});

describe("Muse browser relay prompt", () => {
  it("sets three local daily runs and direct-request behavior without presenting an MCP connection", () => {
    const prompt = museRelayPrompt("https://stoic.example.com/login");
    expect(prompt).toContain("https://stoic.example.com/login");
    expect(prompt).toContain("9:00 AM, 1:00 PM, and 5:00 PM");
    expect(prompt).toContain("When I ask you directly");
    expect(prompt).toContain("in Muse's stored credentials");
    expect(prompt).toContain("Do not ask me to paste a password into chat");
    expect(prompt).toContain("not a native Stoic MCP connection");
    expect(prompt).toContain("Stoic does not wake Muse");
    expect(prompt).toContain("Do not create or claim handoffs");
    expect(prompt).toContain("choose “Suggestion · review first” as the post type");
    expect(prompt).toContain("at most one per run");
    expect(prompt).toContain("Do not repeat a recent suggestion");
    expect(prompt).not.toContain("<password>");
  });
});
