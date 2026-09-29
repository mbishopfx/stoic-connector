import { describe, expect, it } from "vitest";
import { extractRtfPreview } from "../src/lib/rtf-preview";

describe("bounded RTF previews", () => {
  it("keeps document text and paragraphs while omitting metadata and formatting groups", () => {
    const source = String.raw`{\rtf1\ansi{\fonttbl{\f0 Arial;}}{\info{\title Private metadata}}Start \b calm\b0\par Next step}`;
    const preview = extractRtfPreview(new TextEncoder().encode(source));

    expect(preview).toBe("Start calm\nNext step");
    expect(preview).not.toContain("Arial");
    expect(preview).not.toContain("Private metadata");
  });

  it("decodes ANSI hex escapes and signed Unicode values", () => {
    const source = String.raw`{\rtf1\ansi Caf\'e9 \u8217?ready}`;
    expect(extractRtfPreview(new TextEncoder().encode(source))).toBe("Café ’ready");
  });

  it("rejects malformed or oversized input", () => {
    expect(() => extractRtfPreview(new TextEncoder().encode("plain text"))).toThrow("valid RTF");
    expect(() => extractRtfPreview(new Uint8Array(25 * 1024 * 1024 + 1))).toThrow("size limit");
  });
});
