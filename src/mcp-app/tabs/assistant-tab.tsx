import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { AudioLines, Mic, Paperclip, Plus, Send, Square, Volume2, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { safeArtifactMime } from "@/lib/artifact-mime";
import type { McpTabProps } from "../ui-contract";

type Attachment = { id: string; name: string; sizeBytes: number };
type Proposal = {
  title: string;
  goal: string;
  constraints: string;
  artifactIds: string[];
  attachments: Attachment[];
  workerCount: number;
  idempotencyKey: string;
  status: "ready" | "sending" | "sent" | "dismissed";
  sentForReview?: boolean;
};
type Turn = { id: string; role: "user" | "stoic"; body: string; attachments?: Attachment[]; proposal?: Proposal; thinking?: boolean };
type DraftResult = {
  reply: string;
  proposal: { title: string; goal: string; constraints: string } | null;
  transcript: string;
  warnings: string[];
  workerCount: number;
  artifactIds: string[];
};

function readableSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AssistantTab({ context, projectId, runtime }: McpTabProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [voiceReply, setVoiceReply] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const project = context.projects.find((candidate) => candidate.id === projectId);
  const workers = context.agents.filter((agent) => agent.status === "connected" && agent.platform !== "muse" && agent.id !== context.self.agentId);
  const canDraft = context.self.role === "boss" && context.workspace.delegationLevel !== "observe" && Boolean(project);

  useEffect(() => {
    setTurns([]);
    setMessage("");
    setFiles([]);
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, [projectId]);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [turns]);

  useEffect(() => () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  function updateProposal(turnId: string, patch: Partial<Proposal>) {
    setTurns((current) => current.map((turn) => turn.id === turnId && turn.proposal
      ? { ...turn, proposal: { ...turn.proposal, ...patch } }
      : turn));
  }

  async function uploadFile(file: File, idempotencyKey: string): Promise<Attachment> {
    const reservation = await runtime.callTool<{
      artifact: { id: string; name: string; size_bytes: number };
      uploadUrl: string | null;
    }>("create_artifact_upload", {
      projectId,
      name: file.name,
      mimeType: safeArtifactMime(file.type),
      sizeBytes: file.size,
      idempotencyKey,
    });
    if (reservation.uploadUrl) {
      const response = await fetch(reservation.uploadUrl, { method: "PUT", headers: { "Content-Type": safeArtifactMime(file.type) }, body: file });
      if (!response.ok) throw new Error(`Could not upload ${file.name}.`);
      await runtime.callTool("complete_artifact_upload", { artifactId: reservation.artifact.id });
    }
    return { id: reservation.artifact.id, name: reservation.artifact.name, sizeBytes: reservation.artifact.size_bytes };
  }

  async function sendMessage(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (busy || !canDraft || (!message.trim() && files.length === 0)) return;
    if (workers.length === 0) {
      runtime.notify("Connect a worker before drafting a team handoff.", "error");
      return;
    }
    const prompt = message.trim();
    const pendingFiles = [...files];
    const recent: { prompt: string; response: string }[] = [];
    for (let index = 0; index < turns.length; index += 1) {
      const turn = turns[index];
      const previous = turns[index - 1];
      if (turn.role === "stoic" && previous?.role === "user") recent.push({ prompt: previous.body.slice(0, 700), response: turn.body.slice(0, 700) });
    }
    const userTurn: Turn = {
      id: crypto.randomUUID(),
      role: "user",
      body: prompt || "Please review these project files.",
      attachments: pendingFiles.map((file) => ({ id: "", name: file.name, sizeBytes: file.size })),
    };
    const stoicTurn: Turn = { id: crypto.randomUUID(), role: "stoic", body: "Organizing your request…", thinking: true };
    setTurns((current) => [...current, userTurn, stoicTurn]);
    setMessage("");
    setFiles([]);
    setBusy(true);
    try {
      const attachments: Attachment[] = [];
      for (const file of pendingFiles) attachments.push(await uploadFile(file, crypto.randomUUID()));
      const draft = await runtime.callTool<DraftResult>("draft_handoff", {
        projectId,
        prompt,
        artifactIds: attachments.map((file) => file.id),
        recent: recent.slice(-2),
      });
      const body = [draft.reply, draft.transcript && `Voice transcript: ${draft.transcript}`].filter(Boolean).join("\n\n");
      setTurns((current) => current.map((turn) => turn.id !== stoicTurn.id ? turn : {
        ...turn,
        body: body || "I could not form a handoff draft from that request. Add a little more project context and try again.",
        thinking: false,
        attachments: [],
        proposal: draft.proposal ? {
          ...draft.proposal,
          artifactIds: draft.artifactIds,
          attachments,
          workerCount: draft.workerCount,
          idempotencyKey: crypto.randomUUID(),
          status: "ready",
        } : undefined,
      }));
      if (draft.warnings.length) runtime.notify(draft.warnings.join(" "), "error");
      if (voiceReply && body && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(body));
      }
    } catch (error) {
      setTurns((current) => current.map((turn) => turn.id === stoicTurn.id
        ? { ...turn, body: error instanceof Error ? error.message : "Stoic could not finish this request.", thinking: false }
        : turn));
    } finally {
      setBusy(false);
    }
  }

  async function confirmProposal(turnId: string, proposal: Proposal) {
    if (proposal.status !== "ready") return;
    updateProposal(turnId, { status: "sending" });
    try {
      const constraints = [
        proposal.constraints.trim(),
        "Before spending, publishing, deleting, contacting third parties, or changing external services, request owner approval.",
        proposal.attachments.length && `Relevant project files: ${proposal.attachments.map((file) => `${file.name.replace(/[\r\n]/g, " ").slice(0, 180)} (artifact ${file.id})`).join("; ")}. Read them through Stoic only when needed.`,
      ].filter(Boolean).join("\n\n").slice(0, 10000);
      const result = await runtime.callTool<{ handoff?: { id: string; status: string } }>("create_handoff", {
        projectId,
        teamQueue: true,
        title: proposal.title.trim(),
        goal: proposal.goal.trim(),
        constraints,
        idempotencyKey: proposal.idempotencyKey,
      });
      const sentForReview = result.handoff?.status === "proposed";
      updateProposal(turnId, { status: "sent", sentForReview });
      setTurns((current) => current.map((turn) => turn.id === turnId ? {
        ...turn,
        body: sentForReview ? "Sent for owner review. Workers can see it after approval." : "Added to the shared team queue. A worker can claim it on their next inbox check.",
      } : turn));
      runtime.notify(sentForReview ? "Handoff sent for owner review." : "Handoff added to the shared queue.", "success");
      await runtime.refreshContext();
    } catch (error) {
      updateProposal(turnId, { status: "ready" });
      runtime.notify(error instanceof Error ? error.message : "Could not create the handoff.", "error");
    }
  }

  function addFiles(selected: FileList | File[]) {
    const next = [...files];
    for (const file of Array.from(selected)) {
      if (next.length >= 5) { runtime.notify("Attach up to five files to one request.", "error"); break; }
      if (!file.size || file.size > 25 * 1024 * 1024) { runtime.notify(`${file.name} is empty or larger than 25 MB.`, "error"); continue; }
      next.push(file);
    }
    setFiles(next);
  }

  async function toggleRecording() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      runtime.notify("This browser does not support voice recording.", "error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error("This browser has no supported recording format.");
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      streamRef.current = stream;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const type = mimeType.split(";")[0];
        const blob = new Blob(chunksRef.current, { type });
        if (blob.size) addFiles([new File([blob], `voice-${Date.now()}.${type === "audio/mp4" ? "m4a" : "webm"}`, { type })]);
        stream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        streamRef.current = null;
        chunksRef.current = [];
        setRecording(false);
      };
      recorder.start();
      setRecording(true);
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      runtime.notify(error instanceof Error ? error.message : "Could not start voice recording.", "error");
    }
  }

  if (!project) {
    return (
      <Card className="border-dashed">
        <CardContent className="pt-5">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{context.projects.length ? "Choose a project" : "Start with a project"}</EmptyTitle>
              <EmptyDescription>{context.projects.length ? "Select a project from the header to start a focused conversation." : "Create a project to give a handoff a shared brief and a clear home."}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-3">
      <Card className="flex min-h-[12rem] flex-1 flex-col overflow-hidden">
        <CardHeader className="flex-row items-start justify-between border-b">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/40" /><span className="relative inline-flex size-2 rounded-full bg-primary" /></span>
              Stoic <span className="truncate font-normal text-muted-foreground">/ {project.name}</span>
            </CardTitle>
            <CardDescription className="mt-1">Turn a project outcome into a draft your team can review.</CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="outline">{workers.length} {workers.length === 1 ? "worker" : "workers"}</Badge>
            <Button variant="ghost" size="sm" onClick={() => { setTurns([]); setMessage(""); setFiles([]); }} disabled={busy || recording}>
              <Plus /> New
            </Button>
          </div>
        </CardHeader>
        <CardContent ref={transcriptRef} className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto py-5">
          {!turns.length ? (
            <Empty className="min-h-[18rem] border-0">
              <EmptyHeader>
                <EmptyTitle>What should your team work on next?</EmptyTitle>
                <EmptyDescription>Describe an outcome or attach project notes. Stoic will prepare a draft for you to review.</EmptyDescription>
              </EmptyHeader>
              {canDraft && <div className="flex flex-wrap justify-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setMessage("Review our current project brief and propose one next task for the team.")}>Find the next clear step</Button>
                <Button variant="outline" size="sm" onClick={() => setMessage("Turn these notes into one focused task for the team.")}>Turn notes into a handoff</Button>
              </div>}
            </Empty>
          ) : turns.map((turn) => (
            <div key={turn.id} className={`flex ${turn.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`w-full max-w-[46rem] rounded-xl border px-4 py-3 ${turn.role === "user" ? "bg-muted/70" : "bg-card"}`}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-xs font-medium">{turn.role === "user" ? "You" : "Stoic"}</span>
                  {turn.thinking && <Badge variant="secondary"><AudioLines className="animate-pulse" /> Working</Badge>}
                </div>
                <p className="whitespace-pre-wrap text-sm leading-6">{turn.body}</p>
                {turn.attachments?.length ? <div className="mt-3 flex flex-wrap gap-2">{turn.attachments.map((file) => <Badge key={file.id || file.name} variant="outline"><Paperclip />{file.name} · {readableSize(file.sizeBytes)}</Badge>)}</div> : null}
                {turn.proposal && <Card className="mt-4 border-primary/25 bg-muted/25">
                  <CardHeader className="flex-row items-center justify-between gap-3 border-b">
                    <div><CardTitle className="text-sm">Handoff draft</CardTitle><CardDescription className="mt-1">Review the scope and boundaries before adding it to the team queue.</CardDescription></div>
                    <Badge variant={turn.proposal.status === "sent" ? "secondary" : "outline"}>
                      {turn.proposal.status === "sending" ? "Saving" : turn.proposal.status === "sent" ? (turn.proposal.sentForReview ? "Needs approval" : "In queue") : turn.proposal.status === "dismissed" ? "Dismissed" : "Ready to review"}
                    </Badge>
                  </CardHeader>
                  <CardContent className="grid gap-3 pt-4">
                    <div className="grid gap-2"><Label htmlFor={`proposal-title-${turn.id}`}>Title</Label><Input id={`proposal-title-${turn.id}`} maxLength={160} value={turn.proposal.title} disabled={turn.proposal.status !== "ready"} onChange={(event) => updateProposal(turn.id, { title: event.target.value })} /></div>
                    <div className="grid gap-2"><Label htmlFor={`proposal-goal-${turn.id}`}>Goal</Label><Textarea id={`proposal-goal-${turn.id}`} className="min-h-24" maxLength={10000} value={turn.proposal.goal} disabled={turn.proposal.status !== "ready"} onChange={(event) => updateProposal(turn.id, { goal: event.target.value })} /></div>
                    <div className="rounded-lg border bg-background px-3 py-2">
                      <Collapsible>
                        <CollapsibleTrigger className="w-full text-left text-sm font-medium">Constraints and approvals</CollapsibleTrigger>
                        <CollapsibleContent className="pt-3">
                          <Textarea className="min-h-20" maxLength={10000} placeholder="Boundaries, decisions, or approvals needed" value={turn.proposal.constraints} disabled={turn.proposal.status !== "ready"} onChange={(event) => updateProposal(turn.id, { constraints: event.target.value })} />
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                    <p className="text-xs text-muted-foreground">Available to {turn.proposal.workerCount} connected {turn.proposal.workerCount === 1 ? "worker" : "workers"}{turn.proposal.attachments.length ? ` · ${turn.proposal.attachments.length} linked files` : ""}.</p>
                    {turn.proposal.status === "ready" && <div className="flex flex-wrap gap-2">
                      <Button onClick={() => void confirmProposal(turn.id, turn.proposal!)} disabled={turn.proposal.title.trim().length < 3 || turn.proposal.goal.trim().length < 10}>
                        {context.workspace.delegationLevel === "propose" ? "Send for owner review" : "Add to handoff queue"}
                      </Button>
                      <Button variant="ghost" onClick={() => { updateProposal(turn.id, { status: "dismissed" }); setTurns((current) => current.map((item) => item.id === turn.id ? { ...item, body: "Draft dismissed. No handoff was created." } : item)); }}>Dismiss</Button>
                    </div>}
                    {turn.proposal.status === "ready" && <Alert><AlertTitle>Review before sharing</AlertTitle><AlertDescription>Only a confirmed handoff enters the shared queue. Workers receive it during their next successful inbox check.</AlertDescription></Alert>}
                  </CardContent>
                </Card>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {!canDraft && <Alert variant="default">
        <AlertTitle>{context.self.role === "worker" ? "Worker profile" : "Observe mode"}</AlertTitle>
        <AlertDescription>{context.self.role === "worker" ? "Review and claim work from Handoffs. This profile cannot create team assignments." : "Change delegation settings in Stoic to prepare handoff drafts."}</AlertDescription>
      </Alert>}

      <Card>
        <form onSubmit={(event) => void sendMessage(event)}>
          <CardContent className="grid gap-3 pt-4">
            <Label htmlFor="stoic-message">Message Stoic</Label>
            <Textarea id="stoic-message" className="min-h-24 resize-y" maxLength={12000} placeholder={canDraft ? "Describe the outcome you want…" : "Open Handoffs to review or claim work."} value={message} disabled={!canDraft || busy} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
            {files.length > 0 && <div className="flex flex-wrap gap-2">{files.map((file, index) => <Badge key={`${file.name}-${index}`} variant="secondary" className="gap-1.5 py-1">
              <Paperclip /> {file.name} · {readableSize(file.size)}
              <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}><X /></Button>
            </Badge>)}</div>}
            <Separator />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Input id="stoic-file-input" type="file" multiple className="sr-only" aria-label="Attach project files" onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.target.value = ""; }} />
                <Button type="button" variant="outline" size="sm" disabled={!canDraft || busy} onClick={() => (document.getElementById("stoic-file-input") as HTMLInputElement | null)?.click()}><Paperclip /> Attach</Button>
                <Button type="button" variant={recording ? "destructive" : "outline"} size="sm" disabled={!canDraft || busy} onClick={() => void toggleRecording()}>{recording ? <Square /> : <Mic />}{recording ? "Stop recording" : "Voice note"}</Button>
                <div className="flex items-center gap-2 pl-1">
                  <Switch id="voice-reply" checked={voiceReply} onCheckedChange={setVoiceReply} disabled={!canDraft} />
                  <Label htmlFor="voice-reply" className="text-xs text-muted-foreground"><Volume2 className="size-3.5" /> Voice replies</Label>
                </div>
              </div>
              <Button type="submit" disabled={!canDraft || busy || (!message.trim() && files.length === 0)}>
                {busy ? <Skeleton className="size-4 rounded-full" /> : <Send />} {busy ? "Preparing" : "Send"}
              </Button>
            </div>
          </CardContent>
        </form>
      </Card>
      <p className="text-center text-xs text-muted-foreground">Every draft stays yours to review. Workers pick up confirmed handoffs on their next successful inbox check.</p>
    </div>
  );
}
