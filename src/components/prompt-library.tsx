"use client";

import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
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

  return <div className="grid gap-5 text-foreground">
    <header className="border-b pb-5">
      <Badge variant="outline" className="mb-2">Ready-to-paste playbooks</Badge>
      <h1 className="text-3xl font-semibold tracking-tight">Prompt library</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Give your agents a consistent Stoic workflow. Copying a prompt does not connect an agent or grant access to email.</p>
    </header>

    <Card className="border-primary/15 bg-primary/[0.03]">
      <CardHeader className="gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-2">
          <Badge variant="secondary" className="w-fit">Before you begin</Badge>
          <CardTitle className="text-xl">Connect first, then give the agent a task</CardTitle>
          <CardDescription className="max-w-3xl text-sm leading-6">Use a separate private Stoic connection for each MCP agent. Browser-only agents use the owner-authorized Contacts screen instead. These prompts capture verified context; they do not run automatically, import a mailbox, or contact anyone.</CardDescription>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button type="button" onClick={onOpenAgents}>Set up agents</Button>
          <Button type="button" variant="outline" onClick={onOpenContacts}>Open Contacts</Button>
        </div>
      </CardHeader>
    </Card>

    {copyError && <Alert variant="destructive">
      <div><AlertTitle>Prompt was not copied</AlertTitle><AlertDescription>{copyError}</AlertDescription></div>
    </Alert>}

    {promptLibrary.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {promptLibrary.map((item) => <Card key={item.id} className="h-full min-w-0">
        <CardHeader className="flex-1">
          <Badge variant="outline" className="w-fit">{item.audience}</Badge>
          <CardTitle className="pt-1 text-lg leading-snug">{item.title}</CardTitle>
          <CardDescription className="text-sm leading-6">{item.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion className="border-t">
            <AccordionItem value={item.id} className="border-0">
              <AccordionTrigger className="py-3 text-sm">Preview prompt</AccordionTrigger>
              <AccordionContent>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-5 text-foreground">{renderStoicPrompt(item.id, STOIC_ENDPOINT)}</pre>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
        <CardFooter className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">{copied === item.id ? "Ready to paste" : "Review before sharing"}</span>
          <Button type="button" variant={copied === item.id ? "secondary" : "default"} onClick={() => void copy(item.id)} aria-label={`Copy ${item.title} prompt`}>
            {copied === item.id ? "Copied" : "Copy prompt"}
          </Button>
        </CardFooter>
      </Card>)}
    </div> : <Empty className="min-h-64 rounded-xl border bg-card p-8">
      <EmptyHeader><EmptyTitle>No prompts are available</EmptyTitle><EmptyDescription>Prompt templates will appear here when they have been added to the library.</EmptyDescription></EmptyHeader>
    </Empty>}

    <Alert role="status" className="border-border bg-muted/20 text-foreground">
      <AlertTitle>{copied ? `${promptLibrary.find((item) => item.id === copied)?.title} copied` : "Prompts are copied only when you choose"}</AlertTitle>
      <AlertDescription>{copied ? "Paste it into the agent you selected and verify its Stoic read-back." : "No prompt has been copied yet."}</AlertDescription>
    </Alert>
  </div>;
}
