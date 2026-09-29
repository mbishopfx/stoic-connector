import { unzipSync } from "fflate";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const ODT = "application/vnd.oasis.opendocument.text";
const ODS = "application/vnd.oasis.opendocument.spreadsheet";
const ODP = "application/vnd.oasis.opendocument.presentation";
const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 4000;
const MAX_XML_ENTRY_BYTES = 256 * 1024;
const MAX_ODF_XML_BYTES = 1024 * 1024;
const MAX_TOTAL_XML_BYTES = 1024 * 1024;
const MAX_WORKSHEETS = 12;
const MAX_SLIDES = 24;
const MAX_PREVIEW_CHARS = 5000;

function decodeXml(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, token: string) => {
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    const key = token.toLowerCase();
    if (key in named) return named[key];
    const codePoint = key.startsWith("#x") ? Number.parseInt(key.slice(2), 16) : Number.parseInt(key.slice(1), 10);
    if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return "�";
    try { return String.fromCodePoint(codePoint); } catch { return "�"; }
  });
}

function textNodes(xml: string) {
  return [...xml.matchAll(/<(?:[a-z]+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[a-z]+:)?t\s*>/gi)]
    .map((match) => decodeXml(match[1].replace(/<[^>]*>/g, "")));
}

function getSelectedXml(bytes: Uint8Array, allowedName: (name: string) => boolean, limit: number, maxEntryBytes = MAX_XML_ENTRY_BYTES) {
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) throw new Error("Office archive exceeds preview size limit");
  let entries = 0;
  let selected = 0;
  let remaining = MAX_TOTAL_XML_BYTES;
  const files = unzipSync(bytes, {
    filter(file) {
      entries++;
      if (entries > MAX_ARCHIVE_ENTRIES || selected >= limit) return false;
      if (!allowedName(file.name) || file.originalSize > maxEntryBytes || file.originalSize > remaining) return false;
      if (file.compression !== 0 && file.compression !== 8) return false;
      selected++;
      remaining -= file.originalSize;
      return true;
    },
  });
  return files;
}

function spreadsheetPreview(bytes: Uint8Array) {
  let sheetEntries = 0;
  let sharedStringsEntry = false;
  const files = getSelectedXml(bytes, (name) => {
    if (name === "xl/sharedStrings.xml") {
      if (sharedStringsEntry) return false;
      sharedStringsEntry = true;
      return true;
    }
    if (!/^xl\/worksheets\/sheet\d+\.xml$/i.test(name) || sheetEntries >= MAX_WORKSHEETS) return false;
    sheetEntries++;
    return true;
  }, MAX_WORKSHEETS + 1);
  const sharedXml = files["xl/sharedStrings.xml"];
  const sharedStrings = sharedXml
    ? [...new TextDecoder().decode(sharedXml).matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/gi)]
      .map((item) => textNodes(item[1]).join(""))
    : [];
  const sheets = Object.keys(files).filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort((a, b) => Number(a.match(/sheet(\d+)/i)?.[1] || 0) - Number(b.match(/sheet(\d+)/i)?.[1] || 0));
  const output: string[] = [];
  for (const [index, name] of sheets.entries()) {
    const xml = new TextDecoder().decode(files[name]);
    let rows = 0;
    for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)) {
      if (rows >= 80 || output.join("\n").length >= MAX_PREVIEW_CHARS) break;
      const cells = [...row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)].map((cell) => {
        const reference = cell[1].match(/\br="([^"]+)"/i)?.[1] || "cell";
        const type = cell[1].match(/\bt="([^"]+)"/i)?.[1] || "";
        const rawValue = cell[2].match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/i)?.[1];
        const value = type === "s" && rawValue !== undefined
          ? sharedStrings[Number(rawValue)] || ""
          : type === "inlineStr"
            ? textNodes(cell[2]).join("")
            : rawValue === undefined ? "" : decodeXml(rawValue);
        return value ? `${reference}=${value.replace(/\s+/g, " ").slice(0, 180)}` : "";
      }).filter(Boolean);
      if (cells.length) {
        output.push(`Sheet ${index + 1}: ${cells.join(" | ")}`);
        rows++;
      }
    }
  }
  return output.join("\n").slice(0, MAX_PREVIEW_CHARS);
}

function presentationPreview(bytes: Uint8Array) {
  const files = getSelectedXml(bytes, (name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name), MAX_SLIDES);
  const slides = Object.keys(files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => Number(a.match(/slide(\d+)/i)?.[1] || 0) - Number(b.match(/slide(\d+)/i)?.[1] || 0));
  return slides.map((name, index) => {
    const text = textNodes(new TextDecoder().decode(files[name])).join(" ").replace(/\s+/g, " ").trim();
    return text ? `Slide ${index + 1}: ${text}` : "";
  }).filter(Boolean).join("\n").slice(0, MAX_PREVIEW_CHARS);
}

function odfContent(bytes: Uint8Array) {
  const files = getSelectedXml(bytes, (name) => name === "content.xml", 1, MAX_ODF_XML_BYTES);
  const content = files["content.xml"];
  return content ? new TextDecoder().decode(content) : "";
}

function odfFragmentText(fragment: string) {
  const withSpacing = fragment
    .replace(/<text:s\b([^>]*)\/>/gi, (_tag, attributes: string) => {
      const count = Number(attributes.match(/\btext:c=["'](\d+)["']/i)?.[1] || 1);
      return " ".repeat(Math.max(1, Math.min(count, 100)));
    })
    .replace(/<text:tab\b[^>]*\/>/gi, "\t")
    .replace(/<text:line-break\b[^>]*\/>/gi, "\n");
  return decodeXml(withSpacing.replace(/<[^>]*>/g, "")).replace(/[\t ]+/g, " ").trim();
}

function odfParagraphs(xml: string) {
  return [...xml.matchAll(/<text:(?:p|h)\b[^>]*>([\s\S]*?)<\/text:(?:p|h)\s*>/gi)]
    .map((match) => odfFragmentText(match[1]))
    .filter(Boolean);
}

function odtPreview(bytes: Uint8Array) {
  return odfParagraphs(odfContent(bytes)).join("\n").slice(0, MAX_PREVIEW_CHARS);
}

function odsPreview(bytes: Uint8Array) {
  const xml = odfContent(bytes);
  const output: string[] = [];
  const rows = xml.matchAll(/<table:table-row\b[^>]*>([\s\S]*?)<\/table:table-row\s*>/gi);
  for (const [index, row] of [...rows].slice(0, 80).entries()) {
    if (output.join("\n").length >= MAX_PREVIEW_CHARS) break;
    const cells = [...row[1].matchAll(/<table:table-cell\b([^>]*)>([\s\S]*?)<\/table:table-cell\s*>/gi)]
      .map((cell, cellIndex) => {
        const text = odfParagraphs(cell[2]).join(" ")
          || cell[1].match(/\boffice:(?:string-value|value)=["']([^"']*)["']/i)?.[1]
          || "";
        return text ? `${cellIndex + 1}=${text.slice(0, 180)}` : "";
      })
      .filter(Boolean);
    if (cells.length) output.push(`Row ${index + 1}: ${cells.join(" | ")}`);
  }
  return output.join("\n").slice(0, MAX_PREVIEW_CHARS);
}

function odpPreview(bytes: Uint8Array) {
  const xml = odfContent(bytes);
  const pages = [...xml.matchAll(/<draw:page\b[^>]*>([\s\S]*?)<\/draw:page\s*>/gi)].slice(0, MAX_SLIDES);
  if (!pages.length) return odfParagraphs(xml).join("\n").slice(0, MAX_PREVIEW_CHARS);
  return pages.map((page, index) => {
    const text = odfParagraphs(page[1]).join(" ");
    return text ? `Slide ${index + 1}: ${text}` : "";
  }).filter(Boolean).join("\n").slice(0, MAX_PREVIEW_CHARS);
}

function officeType(mimeType: string, fileName: string) {
  if ([XLSX, PPTX, ODT, ODS, ODP].includes(mimeType)) return mimeType;
  const extension = fileName.split(".").at(-1)?.toLowerCase();
  return extension === "xlsx" ? XLSX
    : extension === "pptx" ? PPTX
      : extension === "odt" ? ODT
        : extension === "ods" ? ODS
          : extension === "odp" ? ODP
            : null;
}

export function canPreviewOfficeArtifact(fileName: string, mimeType: string) {
  return officeType(mimeType, fileName) !== null;
}

export function extractOfficePreview(bytes: Uint8Array, mimeType: string, fileName = "") {
  const type = officeType(mimeType, fileName);
  if (type === XLSX) return { kind: "Spreadsheet", text: spreadsheetPreview(bytes) };
  if (type === PPTX) return { kind: "Presentation", text: presentationPreview(bytes) };
  if (type === ODT) return { kind: "Document", text: odtPreview(bytes) };
  if (type === ODS) return { kind: "Spreadsheet", text: odsPreview(bytes) };
  if (type === ODP) return { kind: "Presentation", text: odpPreview(bytes) };
  return null;
}
