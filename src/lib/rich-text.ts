export type RichInline =
  | { type: "text"; text: string }
  | { type: "strong"; text: string }
  | { type: "emphasis"; text: string }
  | { type: "code"; text: string }
  | { type: "strike"; text: string }
  | { type: "link"; text: string; href: string };

export type RichBlock =
  | { type: "paragraph"; text: string }
  | { type: "quote"; text: string }
  | { type: "code"; text: string }
  | { type: "heading"; text: string; level: 2 | 3 | 4 }
  | { type: "unordered"; items: string[] }
  | { type: "ordered"; items: string[] }
  | { type: "rule" };

const SPECIAL_LINE = /^(?:\s{0,3}#{1,3}\s+|\s{0,3}>\s?|\s{0,3}(?:[-*+]\s+|\d+[.)]\s+)|\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$)/;

function stripHtmlTags(value: string) {
  return value.replace(/<\/?[a-z][^>]*>/gi, "");
}

export function parseRichInline(source: string): RichInline[] {
  const value = stripHtmlTags(source);
  const pattern = /\*\*([^*]+?)\*\*|__([^_]+?)__|~~([^~]+?)~~|`([^`\n]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*([^*\n]+?)\*|_([^_\n]+?)_/g;
  const parts: RichInline[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    if (match.index > cursor) parts.push({ type: "text", text: value.slice(cursor, match.index) });
    if (match[1] !== undefined) parts.push({ type: "strong", text: match[1].trim() });
    else if (match[2] !== undefined) parts.push({ type: "strong", text: match[2].trim() });
    else if (match[3] !== undefined) parts.push({ type: "strike", text: match[3].trim() });
    else if (match[4] !== undefined) parts.push({ type: "code", text: match[4] });
    else if (match[5] !== undefined && match[6] !== undefined) parts.push({ type: "link", text: match[5], href: match[6] });
    else if (match[7] !== undefined) parts.push({ type: "emphasis", text: match[7].trim() });
    else if (match[8] !== undefined) parts.push({ type: "emphasis", text: match[8].trim() });
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) parts.push({ type: "text", text: value.slice(cursor) });

  return parts.map((part) => part.type === "text"
    ? { ...part, text: part.text.replace(/\*\*|__|~~/g, "") }
    : part);
}

export function parseRichText(source: string): RichBlock[] {
  const lines = stripHtmlTags(source.replace(/\r\n?/g, "\n")).split("\n");
  const blocks: RichBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }

    if (/^\s{0,3}```/.test(line)) {
      index += 1;
      const code: string[] = [];
      while (index < lines.length && !/^\s{0,3}```/.test(lines[index])) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push({ type: "code", text: code.join("\n") });
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: "heading", level: Math.min(4, heading[1].length + 1) as 2 | 3 | 4, text: heading[2].trim() });
      index += 1;
      continue;
    }

    if (/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }

    const unordered = line.match(/^\s{0,3}(?:[-*+]\s+|•\s+)(.+)$/);
    const ordered = line.match(/^\s{0,3}\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      const type = unordered ? "unordered" : "ordered";
      const items: string[] = [];
      while (index < lines.length) {
        const item = type === "unordered"
          ? lines[index].match(/^\s{0,3}(?:[-*+]\s+|•\s+)(.+)$/)
          : lines[index].match(/^\s{0,3}\d+[.)]\s+(.+)$/);
        if (!item) break;
        items.push(item[1].trim());
        index += 1;
      }
      blocks.push({ type, items });
      continue;
    }

    if (/^\s{0,3}>/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s{0,3}>/.test(lines[index])) {
        quote.push(lines[index++].replace(/^\s{0,3}>\s?/, "").trim());
      }
      blocks.push({ type: "quote", text: quote.join(" ") });
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !SPECIAL_LINE.test(lines[index])) paragraph.push(lines[index++].trim());
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
}

export function plainRichInline(source: string) {
  return parseRichInline(source).map((part) => part.text).join("");
}

export function plainRichText(source: string) {
  return parseRichText(source).flatMap((block) => {
    if (block.type === "rule") return [];
    if (block.type === "unordered" || block.type === "ordered") return block.items.map(plainRichInline);
    return [plainRichInline(block.text)];
  }).filter(Boolean).join(" ");
}
