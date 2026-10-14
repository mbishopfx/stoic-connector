"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, FormEvent } from "react";
import { BotIcon, LockKeyholeIcon, MicIcon, MessageSquareIcon, PaperclipIcon, PlusIcon, SendIcon, SparklesIcon, SquareIcon, Volume2Icon, VolumeXIcon } from "lucide-react";
import { safeArtifactMime } from "@/lib/artifact-mime";
import { agentHealth } from "@/lib/agent-health";
import { getFileUploadIdempotencyKey } from "@/lib/intake-upload";
import { plainRichText } from "@/lib/rich-text";
import type { DashboardGuidance } from "@/lib/dashboard-guidance";
import { AssistantRichInline, AssistantRichText } from "@/components/rich-text";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Attachment, AttachmentAction, AttachmentContent, AttachmentDescription, AttachmentGroup, AttachmentMedia, AttachmentTitle } from "@/components/ui/attachment";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Message, MessageAvatar, MessageContent, MessageFooter, MessageGroup, MessageHeader } from "@/components/ui/message";
import { MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport } from "@/components/ui/message-scroller";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

type Project = { id: string; name: string; brief: string };
type Agent = { id: string; name: string; platform: string; status: string; schedule_enabled: boolean; schedule_cadence_minutes: number; last_check_at: string | null };
type Thread = { id: string; project_id: string; title: string; updated_at: string };
type IntakeArtifact = { id: string; name: string; mime_type: string; size_bytes: number };
type Proposal = { title: string; goal: string; constraints: string };
type Turn = {
  id: string; thread_id: string; prompt: string; artifact_ids: string[]; transcript: string;
  response: string; proposal: Proposal | null; proposal_status: "none" | "pending" | "creating" | "created" | "dismissed";
  handoff_id: string | null; status: "processing" | "completed" | "failed"; created_at: string;
};
type Reservation = { artifact: { id: string; status: string }; uploadUrl: string | null };

function messageError(error: unknown) { return error instanceof Error ? error.message : "Something went wrong. Please try again."; }
function lastCheckLabel(value: string | null) {
  if (!value) return "No successful inbox check yet";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 2) return "Last check just now";
  if (minutes < 60) return `Last check ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last check ${hours}h ago`;
  return `Last check ${Math.floor(hours / 24)}d ago`;
}
function isSupersededFailure(turn: Turn, turns: Turn[]) {
  if (turn.status !== "failed" || !turn.prompt.trim() || turn.artifact_ids.length > 0) return false;
  const failedAt = Date.parse(turn.created_at);
  return turns.some((candidate) => candidate.status === "completed" && candidate.prompt === turn.prompt
    && candidate.artifact_ids.length === 0 && Date.parse(candidate.created_at) > failedAt);
}
export function StoicIntake({ projects, agents, bossAgentId, guidance, command, onHandoffCreated, onViewHandoffs, onManageAgents, onOpenGuidance, initialPrompt, initialProjectId, onPrefillConsumed }: {
  projects: Project[]; agents: Agent[]; bossAgentId: string | null; guidance: DashboardGuidance;
  command: (action: string, payload?: Record<string, unknown>) => Promise<unknown>;
  onHandoffCreated: () => void; onViewHandoffs: () => void; onManageAgents: () => void;
  onOpenGuidance: () => void;
  initialPrompt?: string; initialProjectId?: string; onPrefillConsumed: () => void;
}) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [turnArtifacts, setTurnArtifacts] = useState<IntakeArtifact[]>([]);
  const [threadId, setThreadId] = useState("");
  const [threadsOpen, setThreadsOpen] = useState(false);
  const [projectId, setProjectId] = useState(projects[0]?.id || "");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const conversationsToggle = useRef<HTMLButtonElement>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const requestKey = useRef<string | null>(null);
  const fileUploadKeys = useRef(new WeakMap<object, string>());
  const initialSeed = useRef(initialPrompt && initialProjectId ? { prompt: initialPrompt, projectId: initialProjectId } : null);
  const workerCount = agents.filter((agent) => agent.status === "connected" && agent.id !== bossAgentId && agent.platform !== "muse").length;
  const rosterAgents = agents.filter((agent) => agent.status !== "revoked");
  const activeThread = threads.find((thread) => thread.id === threadId);
  const selectedProjectId = activeThread?.project_id || projectId;
  const visibleTurns = turns.filter((turn) => !isSupersededFailure(turn, turns));

  const load = useCallback(async (id?: string) => {
    const url = id ? `/api/intake?threadId=${encodeURIComponent(id)}` : "/api/intake";
    const response = await fetch(url, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not load conversations");
    setThreads(body.threads || []);
    if (id) { setTurns(body.turns || []); setTurnArtifacts(body.artifacts || []); }
    return body as { threads: Thread[]; turns: Turn[]; artifacts?: IntakeArtifact[] };
  }, []);

  useEffect(() => {
    let active = true;
    const seed = initialSeed.current;
    const timer = window.setTimeout(() => { void load().then(async (body) => {
      if (!active) return;
      if (seed) { setThreadId(crypto.randomUUID()); setProjectId(seed.projectId); return; }
      const first = body.threads[0];
      if (first) { setThreadId(first.id); setProjectId(first.project_id); await load(first.id); }
      else setThreadId(crypto.randomUUID());
    }).catch((cause) => { if (active) setError(messageError(cause)); }); }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [load]);

  useEffect(() => {
    const seed = initialSeed.current;
    if (!seed) return;
    initialSeed.current = null;
    setProjectId(seed.projectId);
    setMessage(seed.prompt);
    onPrefillConsumed();
  }, [onPrefillConsumed]);

  useEffect(() => {
    if (!threadId || !turns.some((turn) => turn.status === "processing")) return;
    const timer = window.setInterval(() => { void load(threadId).catch(() => {}); }, 3500);
    return () => window.clearInterval(timer);
  }, [load, threadId, turns]);

  useEffect(() => () => { recorder.current?.stop(); stream.current?.getTracks().forEach((track) => track.stop()); window.speechSynthesis?.cancel(); }, []);

  function newChat() {
    setThreadId(crypto.randomUUID());
    setThreadsOpen(false);
    window.requestAnimationFrame(() => document.getElementById("stoic-message")?.focus());
    setTurns([]);
    setTurnArtifacts([]);
    setMessage("");
    setFiles([]);
    setError("");
    requestKey.current = null;
  }

  function addFiles(incoming: File[]) {
    setError("");
    if (incoming.some((file) => file.size > 25 * 1024 * 1024)) { setError("Each file must be 25 MB or smaller."); return; }
    requestKey.current = null;
    setFiles((current) => {
      if (current.length + incoming.length > 5) { setError("Attach up to five files per message."); return current; }
      return [...current, ...incoming];
    });
  }

  function onDrop(event: DragEvent) {
    event.preventDefault(); setDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  }

  async function startRecording() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setError("This browser does not support voice recording."); return; }
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mime) { mic.getTracks().forEach((track) => track.stop()); throw new Error("This browser has no supported recording format."); }
      stream.current = mic; chunks.current = [];
      const next = new MediaRecorder(mic, { mimeType: mime });
      recorder.current = next;
      next.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      next.onstop = () => {
        const type = mime.split(";")[0];
        const blob = new Blob(chunks.current, { type });
        if (blob.size) addFiles([new File([blob], `voice-${Date.now()}.${type === "audio/mp4" ? "m4a" : "webm"}`, { type })]);
        mic.getTracks().forEach((track) => track.stop());
        stream.current = null; recorder.current = null; chunks.current = []; setRecording(false);
      };
      next.start(); setRecording(true);
    } catch (cause) { setError(messageError(cause)); }
  }

  function stopRecording() { recorder.current?.stop(); }

  async function upload(file: File) {
    const mimeType = safeArtifactMime(file.type);
    const reservation = await command("reserve_artifact", {
      projectId: selectedProjectId, name: file.name, mimeType, sizeBytes: file.size,
      idempotencyKey: getFileUploadIdempotencyKey(fileUploadKeys.current, file, () => crypto.randomUUID()),
    }) as Reservation;
    if (reservation.uploadUrl) {
      const response = await fetch(reservation.uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: file });
      if (!response.ok) {
        try {
          await command("complete_artifact", { artifactId: reservation.artifact.id });
          return reservation.artifact.id;
        } catch {
          throw new Error(`Could not upload ${file.name}`);
        }
      }
      await command("complete_artifact", { artifactId: reservation.artifact.id });
    }
    return reservation.artifact.id;
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!threadId || !selectedProjectId || (!message.trim() && !files.length) || sending) return;
    setSending(true); setError("");
    requestKey.current ||= crypto.randomUUID();
    let intakeResponseHandled = false;
    try {
      const artifacts: string[] = [];
      for (const file of files) artifacts.push(await upload(file));
      const response = await fetch("/api/intake", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, projectId: selectedProjectId, text: message.trim(), artifactIds: artifacts, requestKey: requestKey.current }),
      });
      const body = await response.json();
      intakeResponseHandled = true;
      if (!response.ok) throw new Error(body.error || "Stoic could not organize this message");
      setMessage(""); setFiles([]); requestKey.current = null; fileUploadKeys.current = new WeakMap();
      await load(threadId);
      if (speakReplies && body.turn?.response && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(plainRichText(body.turn.response)));
      }
    } catch (cause) { if (intakeResponseHandled) requestKey.current = null; setError(messageError(cause)); }
    finally { setSending(false); }
  }

  async function decide(turn: Turn, action: "create" | "dismiss") {
    setDeciding(turn.id); setError("");
    try {
      const response = await fetch("/api/intake/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ turnId: turn.id, action }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not update this draft");
      await load(threadId);
      if (action === "create") onHandoffCreated();
    } catch (cause) { setError(messageError(cause)); }
    finally { setDeciding(null); }
  }

  function chooseThread(thread: Thread) { setThreadId(thread.id); setThreadsOpen(false); window.requestAnimationFrame(() => conversationsToggle.current?.focus()); setProjectId(thread.project_id); setError(""); setMessage(""); setFiles([]); void load(thread.id).catch((cause) => setError(messageError(cause))); }
  function closeThreads() { setThreadsOpen(false); window.requestAnimationFrame(() => conversationsToggle.current?.focus()); }
  function chooseFiles(event: ChangeEvent<HTMLInputElement>) { addFiles(Array.from(event.target.files || [])); event.target.value = ""; }

  function followGuidance() {
    if (guidance.tab === "assistant") {
      setMessage((current) => current || "Help me turn this into one clear handoff for my team.");
      window.requestAnimationFrame(() => document.getElementById("stoic-message")?.focus());
      return;
    }
    onOpenGuidance();
  }

  return <main className="flex h-[calc(100dvh-76px)] min-h-[480px] min-w-0 flex-col bg-background text-foreground">
    <Sheet open={threadsOpen} onOpenChange={setThreadsOpen}>
      <SheetContent side="left" className="flex w-[min(22rem,88vw)] flex-col gap-0 p-0 sm:max-w-sm">
        <SheetHeader className="gap-3 border-b p-5 pr-14">
          <div className="flex items-center gap-2">
            <Avatar size="sm"><AvatarFallback><MessageSquareIcon /></AvatarFallback></Avatar>
            <div><SheetTitle>Conversations</SheetTitle><SheetDescription>Pick up where you left off.</SheetDescription></div>
          </div>
          <Button onClick={newChat} className="w-full"><PlusIcon />New conversation</Button>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-1 p-3">
            {threads.length ? threads.map((thread) => <Button key={thread.id} type="button" variant={thread.id === threadId ? "secondary" : "ghost"} className="h-auto w-full flex-col items-start gap-1 whitespace-normal px-3 py-2.5 text-left" onClick={() => chooseThread(thread)}>
              <span className="line-clamp-2 w-full font-medium">{thread.title}</span>
              <span className="w-full text-xs text-muted-foreground">{projects.find((project) => project.id === thread.project_id)?.name || "Project"}</span>
            </Button>) : <Empty className="border-0 py-12"><EmptyHeader><EmptyMedia variant="icon"><MessageSquareIcon /></EmptyMedia><EmptyTitle>No conversations yet</EmptyTitle><EmptyDescription>Your conversations will appear here.</EmptyDescription></EmptyHeader></Empty>}
          </div>
        </ScrollArea>
        <SheetFooter className="border-t p-4">
          <p className="text-xs leading-relaxed text-muted-foreground">Stoic drafts handoffs for your review. Agents see approved handoffs on their next check-in.</p>
        </SheetFooter>
      </SheetContent>
    </Sheet>

    <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Button ref={conversationsToggle} type="button" variant="ghost" size="icon" onClick={() => setThreadsOpen(true)} aria-label="Show conversations" title="Conversations"><MessageSquareIcon /></Button>
        <Separator orientation="vertical" className="h-6" />
        <div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate text-sm font-semibold">{activeThread?.title || "Stoic"}</h1><Badge variant="outline" className="hidden gap-1 sm:inline-flex"><LockKeyholeIcon />Private</Badge></div><p className="truncate text-xs text-muted-foreground">{projects.find((project) => project.id === selectedProjectId)?.name || "Choose a project to get started"}</p></div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button type="button" variant="ghost" size="icon" onClick={newChat} aria-label="New conversation" title="New conversation"><PlusIcon /></Button>
      </div>
    </header>

    <MessageScrollerProvider autoScroll defaultScrollPosition="end" scrollEdgeThreshold={80}>
      <MessageScroller className="flex-1">
        <MessageScrollerViewport role="log" aria-label="Conversation with Stoic" aria-live="polite" className="focus-visible:outline-none">
          <MessageScrollerContent className="mx-auto w-full max-w-5xl gap-5 px-4 py-6 md:px-8 md:py-8">
            {!visibleTurns.length && <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.8fr)]">
              <Card className="justify-center border-0 bg-muted/35 shadow-none sm:min-h-72">
                <CardContent className="space-y-4 p-5 sm:space-y-5 sm:p-8">
                  <Badge variant="secondary" className="gap-1.5"><SparklesIcon />A clear place to start</Badge>
                  <div className="max-w-2xl space-y-3"><h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">What should your team move forward?</h2><p className="text-sm leading-relaxed text-muted-foreground sm:text-base">Send a note, record a voice memo, or add files. Stoic prepares one focused handoff for your review. Approved work enters the shared queue for workers to pick up on their next check-in.</p></div>
                  <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setMessage("Review our current project brief and propose one next task for the team.")}>Find the next clear step</Button><Button type="button" variant="outline" onClick={() => setMessage("Turn these notes into one focused task for the team.")}>Turn notes into a handoff</Button></div>
                  <p className="text-xs text-muted-foreground">{workerCount ? `${workerCount} connected ${workerCount === 1 ? "worker can" : "workers can"} receive a handoff` : "Connect a worker before Stoic drafts a handoff"} · The first eligible worker to claim it owns the task.</p>
                </CardContent>
              </Card>
              <Card className="h-fit">
                <CardHeader className="space-y-3">
                  <div className="flex items-center justify-between gap-4"><div><CardTitle>Team setup</CardTitle><CardDescription className="mt-1">{guidance.completedSteps} of {guidance.steps.length} steps complete</CardDescription></div><Badge variant="outline">{Math.round((guidance.completedSteps / Math.max(1, guidance.steps.length)) * 100)}%</Badge></div>
                  <Progress value={Math.round((guidance.completedSteps / Math.max(1, guidance.steps.length)) * 100)} aria-label="Team setup progress" />
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Next step</p><h3 className="text-base font-semibold">{guidance.title}</h3><p className="text-sm leading-relaxed text-muted-foreground">{guidance.detail}</p><Button type="button" size="sm" onClick={followGuidance}>{guidance.tab === "assistant" ? "Draft a handoff" : guidance.buttonLabel}</Button></div>
                  <Accordion defaultValue={[]}>
                    <AccordionItem value="setup-path"><AccordionTrigger>View the full setup path</AccordionTrigger><AccordionContent><ol className="space-y-2">{guidance.steps.map((step) => <li key={step.label} className="flex items-center justify-between gap-3 text-sm"><span>{step.label}</span><Badge variant={step.complete ? "secondary" : "outline"}>{step.complete ? "Done" : "Next"}</Badge></li>)}</ol></AccordionContent></AccordionItem>
                  </Accordion>
                  <Separator />
                  <div className="space-y-3"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Team roster</h3><Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={onManageAgents}>Manage agents</Button></div>
                    {rosterAgents.slice(0, 3).map((agent) => { const health = agentHealth(agent); const connection = agent.platform === "muse" ? agent.status === "revoked" ? "Revoked" : "Browser relay · not an MCP worker" : agent.status === "connected" ? `${health.label} · ${lastCheckLabel(agent.last_check_at)}` : agent.last_check_at ? "Recheck connection" : "Finish setup"; return <div key={agent.id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5"><div className="flex min-w-0 items-center gap-2.5"><Avatar size="sm"><AvatarFallback>{agent.name.slice(0, 1).toUpperCase()}</AvatarFallback></Avatar><span className="truncate text-sm font-medium">{agent.name}{agent.id === bossAgentId ? " · lead" : ""}</span></div><Badge variant={agent.status === "connected" ? "secondary" : "outline"} className="max-w-[48%] truncate">{connection}</Badge></div>; })}
                    {rosterAgents.length === 0 && <p className="text-sm text-muted-foreground">No agents connected yet. Stoic will walk you through adding the first one.</p>}{rosterAgents.length > 3 && <p className="text-xs text-muted-foreground">+ {rosterAgents.length - 3} more agents</p>}
                  </div>
                </CardContent>
              </Card>
            </div>}

            {visibleTurns.map((turn, index) => <MessageScrollerItem key={turn.id} messageId={turn.id} scrollAnchor={index === visibleTurns.length - 1}>
              <MessageGroup>
                <Message align="end">
                  <MessageAvatar><Avatar size="sm"><AvatarFallback>You</AvatarFallback></Avatar></MessageAvatar>
                  <MessageContent>
                    <MessageHeader>You</MessageHeader>
                    <Card className="max-w-3xl bg-primary text-primary-foreground ring-0">
                      <CardContent className="space-y-3 p-4"><p className="whitespace-pre-wrap leading-relaxed">{turn.prompt || (turn.transcript ? "Voice message" : "Files shared")}</p>
                        {turn.artifact_ids.length > 0 && <AttachmentGroup>{turn.artifact_ids.map((id) => { const artifact = turnArtifacts.find((item) => item.id === id); return artifact ? <Attachment key={id} size="sm" orientation="horizontal" className="border-primary-foreground/20 bg-primary-foreground/10 text-inherit"><AttachmentMedia><PaperclipIcon /></AttachmentMedia><AttachmentContent><AttachmentTitle>{artifact.name}</AttachmentTitle><AttachmentDescription className="text-primary-foreground/70">{artifact.size_bytes >= 1024 * 1024 ? `${(artifact.size_bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(artifact.size_bytes / 1024))} KB`}</AttachmentDescription></AttachmentContent></Attachment> : null; })}</AttachmentGroup>}
                        {turn.transcript && <Accordion defaultValue={[]}><AccordionItem value={`transcript-${turn.id}`} className="border-primary-foreground/20"><AccordionTrigger className="py-2 text-primary-foreground hover:no-underline">Voice transcript</AccordionTrigger><AccordionContent className="text-primary-foreground/80"><p className="whitespace-pre-wrap">{turn.transcript}</p></AccordionContent></AccordionItem></Accordion>}
                      </CardContent>
                    </Card>
                  </MessageContent>
                </Message>
                <Message align="start">
                  <MessageAvatar><Avatar><AvatarFallback><BotIcon /></AvatarFallback></Avatar></MessageAvatar>
                  <MessageContent>
                    <MessageHeader><span>Stoic</span>{turn.status === "processing" && <Badge variant="outline" className="ml-2 gap-1"><Spinner />Organizing</Badge>}</MessageHeader>
                    {turn.status === "processing" ? <Card className="max-w-3xl"><CardContent className="flex items-center gap-3 p-4 text-sm text-muted-foreground"><Spinner />Preparing a focused response…</CardContent></Card>
                      : turn.status === "failed" ? <Alert variant="destructive" className="max-w-3xl"><AlertTitle>Stoic could not finish this message</AlertTitle><AlertDescription>You can resend your request.</AlertDescription></Alert>
                      : <div className="max-w-3xl space-y-3"><Card><CardContent className="p-4"><AssistantRichText text={turn.response} />{turn.proposal_status === "created" && turn.proposal && <p className="mt-3 text-sm text-muted-foreground">Added to the shared team queue. All {workerCount} connected workers can see it; the first to claim it owns the assignment.</p>}{turn.proposal_status === "dismissed" && <p className="mt-3 text-sm text-muted-foreground">Draft dismissed. No handoff was created.</p>}{turn.proposal_status === "creating" && <p className="mt-3 text-sm text-muted-foreground">Stoic is checking whether this handoff was added to the queue.</p>}{!turn.proposal && workerCount === 0 && <Button type="button" variant="link" className="mt-2 h-auto p-0" onClick={onManageAgents}>Connect a worker</Button>}</CardContent></Card>
                        {turn.proposal && <Card className="border-primary/25"><CardHeader className="gap-2"><div className="flex flex-wrap items-center justify-between gap-2"><Badge variant="secondary">Handoff draft</Badge><Badge variant={turn.proposal_status === "created" ? "default" : "outline"}>{turn.proposal_status === "created" ? "Sent to team queue" : turn.proposal_status === "dismissed" ? "Dismissed" : turn.proposal_status === "creating" ? "Checking queue" : "Ready for review"}</Badge></div><CardTitle className="text-lg"><AssistantRichInline text={turn.proposal.title} /></CardTitle></CardHeader><CardContent className="space-y-4"><AssistantRichText text={turn.proposal.goal} /><div className="flex flex-wrap gap-2 text-xs text-muted-foreground"><Badge variant="outline">Available to {workerCount} connected {workerCount === 1 ? "worker" : "workers"}</Badge>{turn.artifact_ids.length > 0 && <Badge variant="outline">{turn.artifact_ids.length} linked {turn.artifact_ids.length === 1 ? "file" : "files"}</Badge>}</div>
                          {turn.proposal.constraints && <Accordion defaultValue={[]}><AccordionItem value={`constraints-${turn.id}`}><AccordionTrigger>Constraints and approvals</AccordionTrigger><AccordionContent><AssistantRichText text={turn.proposal.constraints} /></AccordionContent></AccordionItem></Accordion>}
                          {(turn.proposal_status === "pending" || turn.proposal_status === "creating") && <div className="flex flex-wrap gap-2"><Button type="button" disabled={!!deciding} onClick={() => void decide(turn, "create")}>{deciding === turn.id ? <><Spinner />Saving…</> : turn.proposal_status === "creating" ? "Check handoff status" : "Add to handoff queue"}</Button>{turn.proposal_status === "pending" && <Button type="button" variant="ghost" disabled={!!deciding} onClick={() => void decide(turn, "dismiss")}>Dismiss draft</Button>}</div>}
                          {turn.proposal_status === "created" && <Button type="button" variant="outline" onClick={onViewHandoffs}>View handoff</Button>}
                        </CardContent></Card>}
                      </div>}
                    <MessageFooter className="px-0">{turn.status === "completed" ? "Review the draft before it enters the shared queue." : turn.status === "failed" ? "Your message is still available above." : ""}</MessageFooter>
                  </MessageContent>
                </Message>
              </MessageGroup>
            </MessageScrollerItem>)}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton direction="end" className="left-1/2" />
      </MessageScroller>
    </MessageScrollerProvider>

    <div className="shrink-0 border-t bg-background px-3 py-3 md:px-6 md:py-4">
      <div className="mx-auto w-full max-w-5xl space-y-2">
        {error && <Alert variant="destructive" className="py-2"><AlertTitle className="text-sm">Message not sent</AlertTitle><AlertDescription className="flex items-center justify-between gap-3"><span>{error}</span><Button type="button" variant="ghost" size="sm" onClick={() => setError("")}>Dismiss</Button></AlertDescription></Alert>}
        <form className="space-y-2" onSubmit={(event) => void send(event)}>
        <Card className={dragging ? "border-primary ring-2 ring-primary/20" : ""} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={onDrop}>
          <CardContent className="space-y-3 p-3 sm:p-4">
            {dragging && <Badge variant="secondary" className="gap-1.5"><PaperclipIcon />Drop files to attach them</Badge>}
            {files.length > 0 && <AttachmentGroup>{files.map((file, index) => <Attachment key={`${file.name}-${index}`} state={sending ? "uploading" : "idle"} size="sm" orientation="horizontal" className="min-w-0"><AttachmentMedia><PaperclipIcon /></AttachmentMedia><AttachmentContent><AttachmentTitle>{file.name}</AttachmentTitle><AttachmentDescription>{file.size >= 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`}</AttachmentDescription></AttachmentContent><AttachmentAction type="button" aria-label={`Remove ${file.name}`} title={`Remove ${file.name}`} onClick={() => { requestKey.current = null; setFiles((current) => current.filter((_, i) => i !== index)); }}><span className="sr-only">Remove</span>×</AttachmentAction></Attachment>)}</AttachmentGroup>}
            <label htmlFor="stoic-message" className="sr-only">Message Stoic</label><Textarea id="stoic-message" value={message} onChange={(event) => { setMessage(event.target.value); requestKey.current = null; }} placeholder="Ask Stoic to organize the next step for your team…" rows={2} maxLength={12000} disabled={sending} className="min-h-20 resize-y border-0 px-1 py-1 shadow-none focus-visible:ring-0" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                {projects.length > 0 && <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">Project</span><Select items={projects.map((project) => ({ value: project.id, label: project.name }))} value={selectedProjectId} disabled={!!activeThread || sending} onValueChange={(value) => value && setProjectId(value)}><SelectTrigger aria-label="Project" className="h-7 max-w-48 border-0 bg-muted/50 text-xs"><SelectValue placeholder="Choose project" /></SelectTrigger><SelectContent>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select></div>}
                <input ref={fileInput} className="sr-only" type="file" multiple onChange={chooseFiles} /><Button type="button" variant="ghost" size="icon" onClick={() => fileInput.current?.click()} aria-label="Attach files" title="Attach files"><PaperclipIcon /></Button>
                <Button type="button" variant={recording ? "destructive" : "ghost"} size="icon" onClick={() => recording ? stopRecording() : void startRecording()} aria-label={recording ? "Stop recording" : "Record voice message"} title={recording ? "Stop recording" : "Record voice message"}>{recording ? <SquareIcon /> : <MicIcon />}</Button>
                <Button type="button" variant={speakReplies ? "secondary" : "ghost"} size="icon" onClick={() => { setSpeakReplies(!speakReplies); if (speakReplies) window.speechSynthesis?.cancel(); }} aria-label={speakReplies ? "Turn spoken replies off" : "Turn spoken replies on"} title={speakReplies ? "Spoken replies on" : "Spoken replies off"}>{speakReplies ? <Volume2Icon /> : <VolumeXIcon />}</Button>
                <span className="hidden text-xs text-muted-foreground sm:inline">{workerCount ? `${workerCount} ${workerCount === 1 ? "worker" : "workers"} available` : "Connect a worker to create handoffs"}</span>
              </div>
              <Button type="submit" disabled={sending || recording || !threadId || !selectedProjectId || (!message.trim() && !files.length)} aria-label="Send to Stoic">{sending ? <><Spinner />Working…</> : <>Send<SendIcon /></>}</Button>
            </div>
          </CardContent>
        </Card>
        </form>
        <div className="flex items-center justify-between gap-3 px-1 text-[11px] text-muted-foreground"><span className="truncate">Review each draft before it enters the team queue.</span><Accordion defaultValue={[]} className="shrink-0"><AccordionItem value="message-policy" className="border-0"><AccordionTrigger className="justify-end py-0 text-[11px] text-muted-foreground">How Stoic handles messages and files</AccordionTrigger><AccordionContent className="max-w-2xl text-left text-xs leading-relaxed"><p>Stoic saves files as private project attachments. Supported text and document contents are extracted locally when possible; selected images are resized locally before the Codex harness sees them. One short model session drafts a handoff. Voice recordings need a separate transcription request before that session. Files Stoic cannot preview stay attached for your agents.</p><p className="mt-2">Handoffs are available when agents next check in. Stoic never wakes an offline agent, and consequential outside actions still need your approval.</p></AccordionContent></AccordionItem></Accordion></div>
      </div>
    </div>
  </main>;
}
