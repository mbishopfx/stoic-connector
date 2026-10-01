import { describe, expect, it } from "vitest";
import { agentRunReportPrompt, schedulePromptFor } from "../src/lib/agent-run-guidance";

describe("scheduled and run-report instructions", () => {
  it("carries idea review and confirmed contact capture into scheduled runs", () => {
    for (const prompt of [
      schedulePromptFor({ id: "boss-1" }, { boss_agent_id: "boss-1" }),
      schedulePromptFor({ id: "worker-1" }, { boss_agent_id: "boss-1" }),
      agentRunReportPrompt,
    ]) {
      expect(prompt).toContain("get_team_context");
      expect(prompt).toContain("check_inbox");
      expect(prompt).toContain("list_team_ideas");
      expect(prompt).toContain("create_contact");
      expect(prompt).toContain("import_contacts_from_artifact");
      expect(prompt).toContain("Never contact a prospect");
    }
  });

  it("preserves distinct boss and worker task boundaries", () => {
    const bossPrompt = schedulePromptFor({ id: "boss-1" }, { boss_agent_id: "boss-1" });
    const workerPrompt = schedulePromptFor({ id: "worker-1" }, { boss_agent_id: "boss-1" });
    expect(bossPrompt).toContain("You may use create_handoff");
    expect(workerPrompt).toContain("Do not create assignments or accept results");
  });
});
