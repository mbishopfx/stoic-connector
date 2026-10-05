import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { stoicMcpAppHtml } from "@/lib/mcp-app-resource";

const widgetSource = readFileSync("src/mcp-app/widget.ts", "utf8");
const widgetBundle = readFileSync("public/stoic-mcp-widget.js", "utf8");
const plugin = JSON.parse(readFileSync("openai-plugin/plugin.json", "utf8")) as { extensions: { "com.openai": { interface: { defaultPrompt: string[] }; onboardingSkill: string } } };
const submission = JSON.parse(readFileSync("chatgpt-app-submission.json", "utf8")) as { tools: Record<string, unknown> };

describe("Stoic plugin contact surfaces", () => {
  it("exposes Contacts and Prompt library through the embedded MCP App", () => {
    expect(widgetSource).toContain('case "contacts": await renderContacts()');
    expect(widgetSource).toContain('case "prompts": renderPrompts()');
    for (const name of ["search_contacts", "create_contact", "link_contact"]) {
      expect(widgetSource).toContain(`"${name}"`);
      expect(widgetBundle).toContain(name);
    }
    expect(widgetBundle).toContain("Contact Link");
    expect(widgetBundle).toContain("Prompt library");
    expect(widgetSource).toContain("state.contactFilters");
    expect(widgetBundle).toContain("Missing email");
    expect(stoicMcpAppHtml("https://stoic.example")).toContain("stoic-mcp-widget.js?v=20261003-contacts-ux");
  });

  it("keeps the portable plugin's contact copy and tool inventory aligned", () => {
    const onboarding = readFileSync("openai-plugin/skills/stoic-team-coordination/SKILL.md", "utf8");
    expect(onboarding).toContain("link_contact");
    expect(onboarding).toContain("Do not read an email account merely because Contact Link exists");
    expect(plugin.extensions["com.openai"].interface.defaultPrompt.some((prompt) => prompt.includes("confirmed interaction"))).toBe(true);
    expect(Object.keys(submission.tools)).toContain("link_contact");
    expect(Object.keys(submission.tools)).toHaveLength(40);
  });
});
