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
    expect(promptLibrary.map((prompt) => prompt.id)).toEqual([
      "contact-link", "contact-link-browser", "team-check-in", "stoic-chat-check-in-30m", "stoic-chat-check-in-60m",
      "project-kickoff", "parallel-work-breakdown", "handoff-execution", "cross-agent-review", "integration-review",
      "blocker-resolution", "team-status-roundup", "decision-synthesis",
    ]);
  });

  it("adds 30- and 60-minute Stoic Chat routines and a nightly self-reported diary", () => {
    const thirtyMinute = renderStoicPrompt("stoic-chat-check-in-30m", endpoint);
    const hourly = renderStoicPrompt("stoic-chat-check-in-60m", endpoint);
    expect(thirtyMinute).toContain("every 30 minutes");
    expect(hourly).toContain("every 60 minutes");
    for (const text of [thirtyMinute, hourly]) {
      expect(text).toContain("Stoic Chat");
      expect(text).toContain("read_project_board");
      expect(text).toContain("ack_project_board");
      expect(text).toContain("post_project_message");
      expect(text).toContain("11:30 PM");
      expect(text).toContain("get_project_knowledge_schedule");
      expect(text).toContain("record_agent_diary_entry");
      expect(text).toContain("does not wake an offline agent");
    }
  });

  it("changes prompt voice without changing task or boundary instructions", () => {
    const balanced = renderStoicPrompt("stoic-chat-check-in-60m", endpoint, "balanced");
    const funny = renderStoicPrompt("stoic-chat-check-in-60m", endpoint, "funny");
    expect(funny).not.toBe(balanced);
    for (const required of ["record_agent_diary_entry", "Complete authorized work", "Preserve every existing access, privacy, accuracy, and approval rule"]) {
      expect(funny).toContain(required);
      expect(balanced).toContain(required);
    }
  });
});
