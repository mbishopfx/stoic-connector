import type { ReactNode } from "react";
import { parseRichInline, parseRichText, type RichInline } from "@/lib/rich-text";

function inlineNodes(parts: RichInline[], keyPrefix: string): ReactNode[] {
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.type === "text") return part.text;
    if (part.type === "strong") return <strong key={key}>{part.text}</strong>;
    if (part.type === "emphasis") return <em key={key}>{part.text}</em>;
    if (part.type === "strike") return <s key={key}>{part.text}</s>;
    if (part.type === "code") return <code key={key}>{part.text}</code>;
    return <a key={key} href={part.href} target="_blank" rel="noreferrer">{part.text}</a>;
  });
}

export function AssistantRichText({ text, className = "" }: { text: string; className?: string }) {
  const blocks = parseRichText(text);
  return <div className={`rich-text ${className}`.trim()}>
    {blocks.map((block, index) => {
      const key = `block-${index}`;
      if (block.type === "rule") return <hr key={key} />;
      if (block.type === "code") return <pre key={key}><code>{block.text}</code></pre>;
      if (block.type === "heading") {
        const Heading = `h${block.level}` as "h2" | "h3" | "h4";
        return <Heading key={key}>{inlineNodes(parseRichInline(block.text), key)}</Heading>;
      }
      if (block.type === "unordered" || block.type === "ordered") {
        const List = block.type === "unordered" ? "ul" : "ol";
        return <List key={key}>{block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{inlineNodes(parseRichInline(item), `${key}-${itemIndex}`)}</li>)}</List>;
      }
      if (block.type === "quote") return <blockquote key={key}>{inlineNodes(parseRichInline(block.text), key)}</blockquote>;
      return <p key={key}>{inlineNodes(parseRichInline(block.text), key)}</p>;
    })}
  </div>;
}

export function AssistantRichInline({ text }: { text: string }) {
  return <>{inlineNodes(parseRichInline(text), "inline")}</>;
}
