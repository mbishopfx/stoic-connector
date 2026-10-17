import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PromptLibraryView } from "@/components/prompt-library";
import { promptLibrary } from "@/lib/prompt-library";

describe("prompt library dashboard surface", () => {
  it("renders the labeled, previewable copy prompts without secrets", () => {
    const html = renderToStaticMarkup(createElement(PromptLibraryView, {
      onOpenAgents: () => {},
      onOpenContacts: () => {},
    }));
    expect(html).toContain("Prompt library");
    expect(html).toContain("Contact Link");
    expect(html).toContain("browser relay");
    expect(html).toContain("Team Check-In");
    expect(html).toContain("Stoic Chat · Every 30 Minutes");
    expect(html).toContain("Parallel Work Breakdown");
    expect(html).toContain("Group Chat Collaboration");
    expect(html.match(/Copy prompt/g)).toHaveLength(promptLibrary.length);
    expect(html).not.toContain("Bearer ");
  });
});
