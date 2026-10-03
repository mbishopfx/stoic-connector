"use client";

import { useState } from "react";
import { promptLibrary, renderStoicPrompt, type StoicPromptId } from "@/lib/prompt-library";

const STOIC_ENDPOINT = "https://stoic.bishoptech.dev/api/mcp";

export function PromptLibraryView({ onOpenAgents, onOpenContacts }: { onOpenAgents: () => void; onOpenContacts: () => void }) {
  const [copied, setCopied] = useState<StoicPromptId | null>(null);
  const [copyError, setCopyError] = useState("");

  async function copy(id: StoicPromptId) {
    try {
      await navigator.clipboard.writeText(renderStoicPrompt(id, STOIC_ENDPOINT));
      setCopied(id);
      setCopyError("");
    } catch {
      setCopied(null);
      setCopyError("Clipboard access is unavailable. Open the prompt below and copy the text manually.");
    }
  }

  return <>
    <div className="page-heading"><div><span className="eyebrow muted">READY-TO-PASTE PLAYBOOKS</span><h1>Prompt library</h1><p>Give your agents a consistent Stoic workflow. Copying a prompt does not connect an agent or grant access to email.</p></div></div>
    <section className="panel prompt-library-intro" aria-label="Before using a prompt"><div><h2>Connect first, then give the agent a task</h2><p>Use a separate private Stoic connection for each MCP agent. Browser-only agents use the owner-authorized Contacts screen instead. These prompts capture verified context; they do not run automatically, import a mailbox, or contact anyone.</p></div><div className="prompt-library-actions"><button type="button" className="button button-small" onClick={onOpenAgents}>Set up agents</button><button type="button" className="button button-outline button-small" onClick={onOpenContacts}>Open Contacts</button></div></section>
    {copyError && <p className="form-error" role="alert">{copyError}</p>}
    <div className="prompt-library-grid">{promptLibrary.map((item) => <article className="panel prompt-library-card" key={item.id}>
      <span className="eyebrow muted">{item.audience}</span><h2>{item.title}</h2><p>{item.description}</p>
      <div className="prompt-library-card-actions"><button type="button" className="button button-small" onClick={() => void copy(item.id)} aria-label={`Copy ${item.title} prompt`}>{copied === item.id ? "Copied" : "Copy prompt"}</button><details><summary>Preview prompt</summary><pre>{renderStoicPrompt(item.id, STOIC_ENDPOINT)}</pre></details></div>
    </article>)}</div>
    <p className="prompt-library-note" role="status" aria-live="polite">{copied ? `${promptLibrary.find((item) => item.id === copied)?.title} copied. Paste it into the agent you selected and verify its Stoic read-back.` : "No prompt has been copied yet."}</p>
  </>;
}
