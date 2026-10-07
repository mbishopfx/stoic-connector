import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { stoicMcpAppHtml } from "@/lib/mcp-app-resource";

const widgetSource = readFileSync("src/mcp-app/widget-react.tsx", "utf8");
const contactTabSource = readFileSync("src/mcp-app/tabs/other-tabs.tsx", "utf8");
const tabContract = readFileSync("src/mcp-app/ui-contract.ts", "utf8");
const widgetBundle = readFileSync("public/stoic-mcp-widget.js", "utf8");
const widgetStyles = readFileSync("public/stoic-mcp-widget.css", "utf8");
const plugin = JSON.parse(readFileSync("openai-plugin/plugin.json", "utf8")) as { extensions: { "com.openai": { interface: { defaultPrompt: string[] }; onboardingSkill: string } } };
const submission = JSON.parse(readFileSync("chatgpt-app-submission.json", "utf8")) as { tools: Record<string, unknown> };

describe("Stoic plugin contact surfaces", () => {
  it("exposes every ShadCN workspace tab through the embedded MCP App", () => {
    for (const tab of ["assistant", "ideas", "overview", "handoffs", "board", "contacts", "projects", "agents", "prompts", "knowledge", "files", "billing"]) {
      expect(tabContract).toContain(`"${tab}"`);
      expect(widgetBundle).toContain(tab);
    }
    expect(widgetSource).toContain('data-component-system="shadcn"');
    expect(widgetBundle).toContain("Navigate to tab");
    expect(widgetStyles).toContain("--background");
    expect(contactTabSource).toContain('"search_contacts"');
    expect(contactTabSource).toContain('"create_contact"');
    expect(contactTabSource).toContain('"link_contact"');
    for (const name of ["search_contacts", "create_contact", "link_contact"]) {
      expect(widgetBundle).toContain(name);
    }
    expect(widgetBundle).toContain("Link interaction");
    expect(widgetBundle).toContain("Prompt library");
    expect(widgetBundle).toContain("Missing email");
    expect(stoicMcpAppHtml("https://stoic.example")).toContain("stoic-mcp-widget.js?v=20261007-shadcn-mcp-v3");
    expect(stoicMcpAppHtml("https://stoic.example")).toContain("stoic-mcp-widget.css?v=20261007-shadcn-mcp-v3");
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
