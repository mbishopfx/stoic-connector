import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { canPreviewOfficeArtifact, extractOfficePreview } from "../src/lib/office-preview";

const xlsxMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const pptxMime = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const odtMime = "application/vnd.oasis.opendocument.text";
const odsMime = "application/vnd.oasis.opendocument.spreadsheet";
const odpMime = "application/vnd.oasis.opendocument.presentation";

describe("bounded Office file previews", () => {
  it("extracts shared strings, inline values, and cached cell values without evaluating formulas", () => {
    const workbook = zipSync({
      "xl/sharedStrings.xml": strToU8("<sst><si><t>Quarterly &amp; annual</t></si><si><r><t>Owner</t></r><r><t> notes</t></r></si></sst>"),
      "xl/worksheets/sheet1.xml": strToU8("<worksheet><sheetData><row r=\"1\"><c r=\"A1\" t=\"s\"><v>0</v></c><c r=\"B1\" t=\"inlineStr\"><is><t>Team &amp; plan</t></is></c><c r=\"C1\"><f>HYPERLINK(\"https://example.com\")</f><v>3</v></c></row></sheetData></worksheet>"),
      "xl/vbaProject.bin": new Uint8Array([1, 2, 3]),
    });

    const preview = extractOfficePreview(workbook, xlsxMime);

    expect(preview?.kind).toBe("Spreadsheet");
    expect(preview?.text).toContain("A1=Quarterly & annual");
    expect(preview?.text).toContain("B1=Team & plan");
    expect(preview?.text).toContain("C1=3");
    expect(preview?.text).not.toContain("HYPERLINK");
  });

  it("extracts readable text from slides in slide order", () => {
    const presentation = zipSync({
      "ppt/slides/slide2.xml": strToU8("<p:sld><a:t>Second</a:t><a:t> slide</a:t></p:sld>"),
      "ppt/slides/slide1.xml": strToU8("<p:sld><a:t>First &amp; foremost</a:t></p:sld>"),
      "ppt/media/image1.png": new Uint8Array([1, 2, 3]),
    });

    const preview = extractOfficePreview(presentation, pptxMime);

    expect(preview?.kind).toBe("Presentation");
    expect(preview?.text).toBe("Slide 1: First & foremost\nSlide 2: Second slide");
  });

  it("previews OpenDocument text while ignoring metadata and preserving visible spacing", () => {
    const document = zipSync({
      "content.xml": strToU8("<office:document-content><office:meta><dc:title>Private metadata</dc:title></office:meta><text:p>One <text:span>shared</text:span><text:s text:c=\"2\"/>brief &amp; goal.</text:p></office:document-content>"),
    });

    const preview = extractOfficePreview(document, odtMime);

    expect(preview?.kind).toBe("Document");
    expect(preview?.text).toBe("One shared brief & goal.");
    expect(preview?.text).not.toContain("Private metadata");
  });

  it("previews cached OpenDocument spreadsheet cell text without evaluating formulas", () => {
    const document = zipSync({
      "content.xml": strToU8("<office:document-content><table:table><table:table-row><table:table-cell><text:p>Quarterly</text:p></table:table-cell><table:table-cell office:value=\"42\"><text:p>42</text:p><table:formula>of:=1+41</table:formula></table:table-cell></table:table-row></table:table></office:document-content>"),
    });

    const preview = extractOfficePreview(document, odsMime);

    expect(preview?.kind).toBe("Spreadsheet");
    expect(preview?.text).toBe("Row 1: 1=Quarterly | 2=42");
    expect(preview?.text).not.toContain("of:=");
  });

  it("previews OpenDocument presentation pages in order", () => {
    const document = zipSync({
      "content.xml": strToU8("<office:document-content><draw:page><text:p>First</text:p></draw:page><draw:page><text:h>Second</text:h><text:p>slide</text:p></draw:page></office:document-content>"),
    });

    const preview = extractOfficePreview(document, odpMime);

    expect(preview?.kind).toBe("Presentation");
    expect(preview?.text).toBe("Slide 1: First\nSlide 2: Second slide");
  });

  it("skips oversized XML entries while keeping the original file eligible for attachment", () => {
    const workbook = zipSync({
      "xl/worksheets/sheet1.xml": strToU8(`<worksheet>${"x".repeat(300_000)}</worksheet>`),
    });

    expect(extractOfficePreview(workbook, xlsxMime)?.text).toBe("");
  });

  it("skips OpenDocument content XML above its decompressed entry limit", () => {
    const document = zipSync({ "content.xml": strToU8(`<office:document-content>${"x".repeat(1_050_000)}</office:document-content>`) });
    expect(extractOfficePreview(document, odtMime)?.text).toBe("");
  });

  it("detects OpenDocument previews by filename when the upload MIME type is generic", () => {
    const document = zipSync({ "content.xml": strToU8("<office:document-content><text:p>Brief text</text:p></office:document-content>") });
    expect(canPreviewOfficeArtifact("brief.odt", "application/octet-stream")).toBe(true);
    expect(extractOfficePreview(document, "application/octet-stream", "brief.odt")).toMatchObject({ kind: "Document", text: "Brief text" });
  });

  it("leaves unsupported Office-like files to the agent without trying to parse them", () => {
    expect(extractOfficePreview(new Uint8Array(), "application/msword")).toBeNull();
  });
});
