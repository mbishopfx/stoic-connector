import { describe, expect, it } from "vitest";
import { promptLibrary, renderStoicPrompt } from "@/lib/prompt-library";

const endpoint = "https://stoic.example/api/mcp";

describe("copy-ready Stoic prompts", () => {
  it("guides a connected agent to search, link exact people, create only new people, and read back", () => {
    const text = renderStoicPrompt("contact-link", endpoint);
    expect(text).toContain(endpoint);
    expect(text.indexOf("search_contacts")).toBeLessThan(text.indexOf("link_contact"));
    expect(text).toContain("create_contact");
    expect(text).toContain("idempotencyKey");
    expect(text).toContain("artifactId");
    expect(text).toContain("sourceLabel");
    expect(text).toContain("read back");
    expect(text).toContain("Do not access email unless");
    expect(text).toContain("Never send outreach");
    expect(text).toContain("Do not paste raw email");
    expect(text).not.toContain("Bearer ");
  });

  it("routes browser-only Muse to the UI, without pretending MCP or silent ingestion", () => {
    const text = renderStoicPrompt("contact-link-browser", endpoint);
    expect(text).toContain("https://stoic.example/login");
    expect(text).toContain("Contacts");
    expect(text).toContain("not an MCP connection");
    expect(text).not.toContain("STOIC_AGENT_KEY");
  });

  it("keeps the check-in prompt read-only until an existing assignment is claimed", () => {
    const text = renderStoicPrompt("team-check-in", endpoint);
    expect(text).toContain("get_team_context");
    expect(text).toContain("check_inbox");
    expect(text).toContain("claim_handoff");
    expect(text).toContain("owner approval");
    expect(promptLibrary.map((prompt) => prompt.id)).toEqual(["contact-link", "contact-link-browser", "team-check-in"]);
  });
});
