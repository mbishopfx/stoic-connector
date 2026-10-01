import { describe, expect, it } from "vitest";
import { agentConnectionGuide } from "../src/lib/agent-connection-guidance";

const endpoint = "https://stoic.example.com/api/mcp";

function getGuide(platform: "codex" | "hermes" | "openclaw" | "other", harness: string) {
  const guide = agentConnectionGuide(platform, endpoint, harness);
  if (!guide) throw new Error(`Expected an MCP setup guide for ${harness}`);
  return guide;
}

describe("harness-specific connection guidance", () => {
  it("provides Claude Code's environment-backed HTTP config without exposing a key", () => {
    const guide = getGuide("other", "Claude Code");

    expect(guide.code).toContain(endpoint);
    expect(guide.code).toContain("Bearer ${STOIC_AGENT_KEY}");
    expect(guide.code).not.toContain("undefined");
    expect(guide.text).toContain("OAuth client registered");
  });

  it("resolves ChatGPT by harness name despite its generic platform mapping", () => {
    const guide = getGuide("other", "ChatGPT");

    expect(guide.code).toBe(endpoint);
    expect(guide.text).toContain("registered Stoic OAuth sign-in");
  });

  it("keeps key references literal in Hermes and OpenClaw examples", () => {
    const hermes = getGuide("hermes", "Hermes");
    const openclaw = getGuide("openclaw", "OpenClaw");

    expect(hermes.code).toContain("Bearer ${STOIC_AGENT_KEY}");
    expect(openclaw.code).toContain("Bearer ${STOIC_AGENT_KEY}");
    expect(hermes.code + openclaw.code).not.toContain("undefined");
  });

  it("uses a cautious generic setup for custom harnesses", () => {
    const guide = getGuide("other", "Private runner");

    expect(guide.text).toContain("securely store the key");
    expect(guide.code).toContain("<STOIC_AGENT_KEY>");
  });

  it("does not describe consumer Muse as an MCP client", () => {
    expect(agentConnectionGuide("muse", endpoint, "Muse")).toBeNull();
  });
});
