import { describe, expect, it } from "vitest";
import { parseRichInline, parseRichText, plainRichText } from "@/lib/rich-text";

describe("assistant rich text", () => {
  it("turns Markdown emphasis markers into semantic rich text nodes", () => {
    expect(parseRichInline("A ** bold ** handoff with *calm* detail.")).toEqual([
      { type: "text", text: "A " },
      { type: "strong", text: "bold" },
      { type: "text", text: " handoff with " },
      { type: "emphasis", text: "calm" },
      { type: "text", text: " detail." },
    ]);
  });

  it("creates safe themed blocks for headings, lists, links, and fenced code", () => {
    expect(parseRichText("## Next step\n\n- Read the brief\n- [Open the board](https://stoic.bishoptech.dev)\n\n```text\n**literal code**\n```" )).toEqual([
      { type: "heading", level: 3, text: "Next step" },
      { type: "unordered", items: ["Read the brief", "[Open the board](https://stoic.bishoptech.dev)"] },
      { type: "code", text: "**literal code**" },
    ]);
  });

  it("strips raw tags and unsafe link syntax from assistant content", () => {
    expect(parseRichText("<script>alert(1)</script> **done**" )).toEqual([
      { type: "paragraph", text: "alert(1) **done**" },
    ]);
    expect(parseRichInline("[bad](javascript:alert(1))")).toEqual([
      { type: "text", text: "[bad](javascript:alert(1))" },
    ]);
  });

  it("provides formatted plain text for voice replies", () => {
    expect(plainRichText("## Done\n\n- **Brief** updated\n- Next step")).toBe("Done Brief updated Next step");
  });
});
