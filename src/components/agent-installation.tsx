"use client";

import { useMemo, useState } from "react";
import { Check, Copy, ExternalLink, ShieldCheck } from "lucide-react";
import { AGENT_HARNESSES, type AgentHarnessId } from "@/lib/agent-harness";
import { agentInstallPrompt } from "@/lib/agent-install-guidance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const cadences = [
  { value: "60", label: "Every hour" },
  { value: "90", label: "Every 90 minutes" },
  { value: "360", label: "Every six hours" },
  { value: "1440", label: "Once a day" },
] as const;

export function AgentInstallation({
  endpoint = "https://stoic.bishoptech.dev/api/mcp",
  onManageAgents,
}: {
  endpoint?: string;
  onManageAgents?: () => void;
}) {
  const [harness, setHarness] = useState<AgentHarnessId>("codex");
  const [cadence, setCadence] = useState("60");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  const prompt = useMemo(
    () => agentInstallPrompt(AGENT_HARNESSES.find((item) => item.id === harness)?.label || "Codex", endpoint, Number(cadence)),
    [cadence, endpoint, harness],
  );

  async function copyPrompt() {
    setCopied(false);
    setCopyError("");
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopyError("Clipboard access is unavailable. Select and copy the prompt below.");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 sm:gap-7 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <Badge variant="secondary">Team setup</Badge>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Installation</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">Create a setup prompt for one agent profile. It covers a private connection, a safe first check, and an optional host schedule.</p>
        </div>
        {onManageAgents && <Button variant="outline" onClick={onManageAgents}><ExternalLink />Manage agents</Button>}
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Choose the agent host</CardTitle>
            <CardDescription>The generated steps match the selected harness and keep its existing connections intact.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="install-harness">Agent host</Label>
              <Select value={harness} onValueChange={(value) => value && setHarness(value as AgentHarnessId)}>
                <SelectTrigger id="install-harness" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{AGENT_HARNESSES.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="install-cadence">Check-in cadence</Label>
              <Select value={cadence} onValueChange={(value) => value && setCadence(value)}>
                <SelectTrigger id="install-cadence" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{cadences.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-sm leading-6 text-muted-foreground">
              <div className="mb-1 flex items-center gap-2 font-medium text-foreground"><ShieldCheck className="size-4 text-primary" />Credential and schedule boundaries</div>
              The prompt never asks for a key in chat and only asks the host to create a schedule when that surface supports one. Stoic does not wake an offline agent.
            </div>
            <Button className="w-full" onClick={() => void copyPrompt()}>{copied ? <Check /> : <Copy />}{copied ? "Copied setup prompt" : "Copy setup prompt"}</Button>
            {copyError && <p role="status" className="text-sm text-destructive">{copyError}</p>}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader><CardTitle>Setup prompt</CardTitle><CardDescription>Review the instructions before pasting them into your agent host.</CardDescription></CardHeader>
          <CardContent><Textarea aria-label="Generated agent setup prompt" readOnly value={prompt} className="min-h-[30rem] resize-y font-mono text-xs leading-5" /></CardContent>
        </Card>
      </section>
    </div>
  );
}
