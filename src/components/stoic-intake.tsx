"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, FormEvent } from "react";
import { ChatBubbleLeftRightIcon, LockClosedIcon, MicrophoneIcon, PaperClipIcon, PlusIcon, SpeakerWaveIcon, SpeakerXMarkIcon, StopIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { safeArtifactMime } from "@/lib/artifact-mime";
import { agentHealth } from "@/lib/agent-health";
import { getFileUploadIdempotencyKey } from "@/lib/intake-upload";
import { plainRichText } from "@/lib/rich-text";
import type { DashboardGuidance } from "@/lib/dashboard-guidance";
import { AssistantRichInline, AssistantRichText } from "@/components/rich-text";

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
  const conversationsClose = useRef<HTMLButtonElement>(null);
  const scrollEnd = useRef<HTMLDivElement>(null);
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
  const lastTurnStatus = visibleTurns.at(-1)?.status;

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

  useEffect(() => {
    if (!threadsOpen) return;
    conversationsClose.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setThreadsOpen(false);
      window.requestAnimationFrame(() => conversationsToggle.current?.focus());
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [threadsOpen]);

  useEffect(() => { scrollEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [visibleTurns.length, lastTurnStatus]);
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

  return <div className={`intake-layout${threadsOpen ? " threads-open" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={onDrop}>
    {threadsOpen && <button type="button" tabIndex={-1} className="intake-threads-backdrop" aria-label="Close conversation list" onClick={closeThreads} />}
    <aside id="stoic-conversations" className="intake-threads" aria-label="Stoic conversations" hidden={!threadsOpen}>
      <div className="intake-threads-head"><span>Conversations</span><div><button ref={conversationsClose} type="button" className="intake-toolbar-button" aria-label="Close conversations" title="Close conversations" onClick={closeThreads}><XMarkIcon aria-hidden="true" /></button><button type="button" className="intake-toolbar-button intake-new" aria-label="New conversation" title="New conversation" onClick={newChat}><PlusIcon aria-hidden="true" /></button></div></div>
      {threads.length ? <div className="intake-thread-list">{threads.map((thread) => <button type="button" key={thread.id} className={thread.id === threadId ? "selected" : ""} onClick={() => chooseThread(thread)}><span>{thread.title}</span><small>{projects.find((project) => project.id === thread.project_id)?.name || "Project"}</small></button>)}</div> : <p className="intake-thread-empty">Your conversations will appear here.</p>}
      <div className="intake-threads-note"><p>Stoic drafts handoffs for your review. Your agents pick them up at their next check.</p></div>
    </aside>
    <section className="intake-chat" aria-label="Stoic chat">
      <header className="intake-chat-header"><div><span className="intake-status-dot" /><strong>Stoic</strong><small className="sr-only">Team coordinator</small></div><div className="intake-chat-header-actions"><button ref={conversationsToggle} type="button" className="intake-toolbar-button" aria-label={threadsOpen ? "Hide conversations" : "Show conversations"} aria-expanded={threadsOpen} aria-controls="stoic-conversations" title={threadsOpen ? "Hide conversations" : "Show conversations"} onClick={() => setThreadsOpen((open) => !open)}><ChatBubbleLeftRightIcon aria-hidden="true" /></button><button type="button" className="intake-toolbar-button" aria-label="New conversation" title="New conversation" onClick={newChat}><PlusIcon aria-hidden="true" /></button><span className="intake-privacy" role="img" aria-label="Private owner conversation" title="Private owner conversation"><LockClosedIcon aria-hidden="true" /><span className="sr-only">Owner conversation</span></span></div></header>
      <div className="intake-scroll">
        {!visibleTurns.length && <div className="intake-welcome" data-testid="intake-welcome">
          <section className="intake-welcome-copy">
            <p className="intake-kicker">A CLEAR PLACE TO START</p>
            <h1>What should your team move forward?</h1>
            <p>Send a note, record a voice memo, or drop in files. Stoic prepares one focused handoff for your review. Once it is in the shared queue, workers see it on their next successful check-in.</p>
            <div className="intake-ideas"><button type="button" onClick={() => setMessage("Review our current project brief and propose one next task for the team.")}>Find the next clear step</button><button type="button" onClick={() => setMessage("Turn these notes into one focused task for the team.")}>Turn notes into a handoff</button></div>
            <p className="intake-ready-line">{workerCount ? `${workerCount} connected ${workerCount === 1 ? "worker" : "workers"} can receive a handoff` : "Connect a worker before Stoic drafts a handoff"} · First eligible worker to claim it owns the task</p>
          </section>
          <aside className="intake-start-module" aria-label="Team setup and next step">
            <div className="intake-start-module-heading"><div><span>TEAM SETUP</span><strong>{guidance.completedSteps} of {guidance.steps.length}</strong></div><div className="intake-progress-track" role="progressbar" aria-label="Team setup progress" aria-valuemin={0} aria-valuemax={guidance.steps.length} aria-valuenow={guidance.completedSteps} aria-valuetext={`${guidance.completedSteps} of ${guidance.steps.length} steps complete`}><span style={{ width: `${Math.round((guidance.completedSteps / guidance.steps.length) * 100)}%` }} /></div></div>
            <div className="intake-start-next"><span>NEXT STEP</span><h2>{guidance.title}</h2><p>{guidance.detail}</p><button type="button" className="button button-small" onClick={followGuidance}>{guidance.tab === "assistant" ? "Draft a handoff" : guidance.buttonLabel}</button></div>
            <details className="intake-setup-details"><summary>View the full setup path</summary><ol>{guidance.steps.map((step) => <li key={step.label} className={step.complete ? "done" : ""}><span>{step.complete ? "Done" : "Next"}</span><strong>{step.label}</strong></li>)}</ol></details>
            <div className="intake-team-list"><div><strong>Team roster</strong><button type="button" className="subtle-link" onClick={onManageAgents}>Manage agents</button></div>{rosterAgents.slice(0, 3).map((agent) => { const health = agentHealth(agent); const connection = agent.platform === "muse" ? agent.status === "revoked" ? "Revoked" : "Browser relay · not an MCP worker" : agent.status === "connected" ? `${health.label} · ${lastCheckLabel(agent.last_check_at)}` : agent.last_check_at ? "Recheck connection" : "Finish setup"; return <p key={agent.id}><strong>{agent.name}{agent.id === bossAgentId ? " · lead" : ""}</strong><span>{connection}</span></p>; })}{rosterAgents.length === 0 && <p className="intake-roster-empty">No agents connected yet. Stoic will walk you through adding the first one.</p>}{rosterAgents.length > 3 && <p className="intake-roster-more">+ {rosterAgents.length - 3} more agents</p>}</div>
          </aside>
        </div>}
        {visibleTurns.map((turn) => <div className="intake-turn" key={turn.id}>
          <div className="intake-owner-message"><p>{turn.prompt || (turn.transcript ? "Voice message" : "Files shared")}</p>{turn.artifact_ids.length > 0 && <div className="intake-turn-files"><small>{turn.artifact_ids.length} {turn.artifact_ids.length === 1 ? "file" : "files"} attached</small>{turn.artifact_ids.map((id) => { const artifact = turnArtifacts.find((item) => item.id === id); return artifact ? <span key={id}>{artifact.name}<small>{artifact.size_bytes >= 1024 * 1024 ? `${(artifact.size_bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(artifact.size_bytes / 1024))} KB`}</small></span> : null; })}</div>}{turn.transcript && <details><summary>Voice transcript</summary><p>{turn.transcript}</p></details>}</div>
          <div className="intake-stoic-message"><div>{turn.status === "processing" ? <div className="intake-thinking"><i /><i /><i /><span>Organizing your request…</span></div> : turn.status === "failed" ? <p>Stoic could not finish this message. You can resend your request.</p> : turn.proposal_status === "created" && turn.proposal ? <p>Added to the shared team queue. All {workerCount} connected workers can see it; the first to claim it owns the assignment.</p> : turn.proposal_status === "dismissed" ? <p>Draft dismissed. No handoff was created.</p> : turn.proposal_status === "creating" ? <p>Stoic is checking whether this handoff was added to the queue.</p> : <AssistantRichText text={turn.response} />}{turn.status === "completed" && !turn.proposal && workerCount === 0 && <button type="button" className="intake-text-button" onClick={onManageAgents}>Connect a worker</button>}
            {turn.proposal && turn.status === "completed" && <article className="intake-proposal">
              <div className="intake-proposal-label"><span>HANDOFF DRAFT</span><span>{turn.proposal_status === "created" ? "SENT TO TEAM QUEUE" : turn.proposal_status === "dismissed" ? "DISMISSED" : turn.proposal_status === "creating" ? "CHECKING QUEUE" : "READY FOR REVIEW"}</span></div>
              <h3><AssistantRichInline text={turn.proposal.title} /></h3><AssistantRichText text={turn.proposal.goal} />
              <div className="intake-proposal-meta"><span>Available to <strong>{workerCount} connected {workerCount === 1 ? "worker" : "workers"}</strong></span>{turn.artifact_ids.length > 0 && <span>{turn.artifact_ids.length} linked {turn.artifact_ids.length === 1 ? "file" : "files"}</span>}</div>
              {turn.proposal.constraints && <details><summary>Constraints and approvals</summary><AssistantRichText text={turn.proposal.constraints} /></details>}
              {(turn.proposal_status === "pending" || turn.proposal_status === "creating") && <div className="intake-proposal-actions"><button type="button" className="button button-small" disabled={!!deciding} onClick={() => void decide(turn, "create")}>{deciding === turn.id ? "Saving…" : turn.proposal_status === "creating" ? "Check handoff status" : "Add to handoff queue"}</button>{turn.proposal_status === "pending" && <button type="button" className="intake-text-button" disabled={!!deciding} onClick={() => void decide(turn, "dismiss")}>Dismiss draft</button>}</div>}
              {turn.proposal_status === "created" && <button type="button" className="intake-text-button" onClick={onViewHandoffs}> View handoff</button>}
            </article>}
          </div></div>
        </div>)}<div ref={scrollEnd} />
      </div>
      {error && <div className="intake-error" role="alert">{error}<button type="button" onClick={() => setError("")} aria-label="Dismiss error">Dismiss</button></div>}
      <form className={`intake-composer ${dragging ? "dragging" : ""}`} onSubmit={(event) => void send(event)}>
        {dragging && <div className="intake-drop-hint"> Drop files for Stoic</div>}
        {files.length > 0 && <div className="intake-files">{files.map((file, index) => <span key={`${file.name}-${index}`}>{file.name}<button type="button" className="intake-remove-file" onClick={() => { requestKey.current = null; setFiles((current) => current.filter((_, i) => i !== index)); }} aria-label={`Remove ${file.name}`}>Remove</button></span>)}</div>}
        <label htmlFor="stoic-message" className="sr-only">Message Stoic</label><textarea id="stoic-message" value={message} onChange={(event) => { setMessage(event.target.value); requestKey.current = null; }} placeholder="Ask Stoic to organize the next step for your team…" rows={2} maxLength={12000} disabled={sending} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
        <div className="intake-compose-actions"><div><label className="intake-project-picker">Project <select value={selectedProjectId} disabled={!!activeThread || sending} onChange={(event) => setProjectId(event.target.value)}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><input ref={fileInput} className="sr-only" type="file" multiple onChange={chooseFiles} /><button type="button" className="intake-icon-button" onClick={() => fileInput.current?.click()} aria-label="Attach files" title="Attach files"><PaperClipIcon width={19} height={19} /></button><button type="button" className={`intake-icon-button ${recording ? "recording" : ""}`} onClick={() => recording ? stopRecording() : void startRecording()} aria-label={recording ? "Stop recording" : "Record voice message"} title={recording ? "Stop recording" : "Record voice message"}>{recording ? <StopIcon width={19} height={19} /> : <MicrophoneIcon width={19} height={19} />}</button><button type="button" className={`intake-icon-button ${speakReplies ? "selected" : ""}`} onClick={() => { setSpeakReplies(!speakReplies); if (speakReplies) window.speechSynthesis?.cancel(); }} aria-label={speakReplies ? "Turn spoken replies off" : "Turn spoken replies on"} title={speakReplies ? "Spoken replies on" : "Spoken replies off"}>{speakReplies ? <SpeakerWaveIcon width={19} height={19} /> : <SpeakerXMarkIcon width={19} height={19} />}</button></div><button type="submit" className="intake-send" disabled={sending || recording || !threadId || !selectedProjectId || (!message.trim() && !files.length)} aria-label="Send to Stoic">{sending ? "Working…" : "Send"}</button></div>
      </form>
      <div className="intake-footnote"><span>{workerCount ? `${workerCount} connected ${workerCount === 1 ? "worker" : "workers"} available` : "Connect a worker to create handoffs"} · Review each draft before adding it to the queue</span><details className="intake-input-details"><summary>How Stoic handles messages and files</summary><div><p>Stoic saves files as private project attachments. Supported text and document contents are extracted locally when possible; selected images are resized locally before the Codex harness sees them. One short model session drafts a handoff. Voice recordings need a separate transcription request before that session. Files Stoic cannot preview stay attached for your agents.</p><p>Handoffs are available when agents next check in. Stoic never wakes an offline agent, and consequential outside actions still need your approval.</p></div></details></div>
    </section>
  </div>;
}
