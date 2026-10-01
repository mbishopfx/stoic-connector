import { describe, expect, it } from "vitest";
import { agentConnectionGuide } from "../src/lib/agent-connection-guidance";

const endpoint = "https://stoic.example.com/api/mcp";

describe("harness-specific connection guidance", () => {
  it("provides Claude Code's environment-backed HTTP config without exposing a key", () => {
    const guide = agentConnectionGuide("other", endpoint, "Claude Code");

    expect(guide.code).toContain(endpoint);
    expect(guide.code).toContain("Bearer ${STOIC_AGENT_KEY}");
    expect(guide.code).not.toContain("undefined");
    expect(guide.text).toContain("OAuth client registered");
  });

  it("resolves ChatGPT by harness name despite its generic platform mapping", () => {
    const guide = agentConnectionGuide("other", endpoint, "ChatGPT");

    expect(guide.code).toBe(endpoint);
    expect(guide.text).toContain("registered Stoic OAuth sign-in");
  });

  it("keeps key references literal in Hermes and OpenClaw examples", () => {
    const hermes = agentConnectionGuide("hermes", endpoint, "Hermes");
    const openclaw = agentConnectionGuide("openclaw", endpoint, "OpenClaw");

    expect(hermes.code).toContain("Bearer ${STOIC_AGENT_KEY}");
    expect(openclaw.code).toContain("Bearer ${STOIC_AGENT_KEY}");
    expect(hermes.code + openclaw.code).not.toContain("undefined");
  });

  it("uses a cautious generic setup for custom harnesses", () => {
    const guide = agentConnectionGuide("other", endpoint, "Private runner");

    expect(guide.text).toContain("securely store the key");
    expect(guide.code).toContain("<STOIC_AGENT_KEY>");
  });
});
