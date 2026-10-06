"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Platform } from "@/lib/config";
import { agentHarnessLabel } from "@/lib/agent-harness";
import { AGENT_DIALOGUE_MARKER, AGENT_DIALOGUE_MAX_PARTICIPANTS, AGENT_DIALOGUE_MAX_REPLIES, AGENT_DIALOGUE_TARGET_REPLIES, AGENT_DIALOGUE_WINDOW_MINUTES, buildAgentDialogueKickoff, isAgentDialogueKickoff } from "@/lib/agent-dialogue";
import { AssistantRichText } from "@/components/rich-text";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty as UiEmpty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Message, MessageAvatar, MessageContent, MessageGroup, MessageHeader } from "@/components/ui/message";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

type Agent = { id: string; name: string; platform: Platform; harness_name?: string | null; status: string; oauth_client_id: string | null; access_notes: string; schedule_enabled: boolean; schedule_cadence_minutes: number; last_check_at: string | null; created_at: string };
type Project = { id: string; name: string; brief: string; brief_version: number; default_agent_id: string | null; created_at: string };
type BoardMessage = { id: string; project_id: string; parent_id: string | null; author_key: string; kind: "message" | "run_report" | "suggestion" | "artifact"; body: string; created_at: string };
type DialogueInfo = { invitedIds: string[]; replies: number; closesAt: Date; expired: boolean; ended: boolean; displayBody: string; topic: string };

function timeAgo(value: string | null) {
  if (!value) return "Never";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 2) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function descendants(rootId: string, children: Map<string, BoardMessage[]>) {
  const result: BoardMessage[] = [];
  const pending = [...(children.get(rootId) || [])].reverse();
  while (pending.length) {
    const message = pending.pop()!;
    result.push(message);
    pending.push(...[...(children.get(message.id) || [])].reverse());
  }
  return result;
}

function dialogueInfo(message: BoardMessage, children: Map<string, BoardMessage[]>): DialogueInfo {
  const invitedIds = message.body.match(/^Invited agent IDs:\s*(.*)$/m)?.[1]?.split(",").map((value) => value.trim().replace(/^agent:/, "")).filter(Boolean) || [];
  const replies = descendants(message.id, children).filter((reply) => reply.author_key.startsWith("agent:")).length;
  const closesAt = new Date(new Date(message.created_at).getTime() + AGENT_DIALOGUE_WINDOW_MINUTES * 60_000);
  const expired = Date.now() >= closesAt.getTime();
  const displayBody = message.body.replace(AGENT_DIALOGUE_MARKER, "").replace(/^Invited agent IDs:.*\r?\n/m, "").trim();
  const topic = displayBody.match(/^Topic:\s*(.*)$/m)?.[1]?.trim() || "Agent discussion";
  return { invitedIds, replies, closesAt, expired, ended: expired || replies >= AGENT_DIALOGUE_MAX_REPLIES, displayBody, topic };
}

export function BoardDiscussionView({ projects, agents, messages, busy, command, refresh }: { projects: Project[]; agents: Agent[]; messages: BoardMessage[]; busy: boolean; command: (action: string, payload?: Record<string, unknown>) => Promise<unknown>; refresh: () => Promise<void> }) {
  const [projectId, setProjectId] = useState(projects[0]?.id || "");
  const [selectedRootId, setSelectedRootId] = useState<string | null>(null);
  const [newPostMode, setNewPostMode] = useState(false);
  const [body, setBody] = useState("");
  const [postKind, setPostKind] = useState<"message" | "suggestion">("message");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [discussionMode, setDiscussionMode] = useState(false);
  const [discussionAgentIds, setDiscussionAgentIds] = useState<string[]>([]);
  const [rosterOpen, setRosterOpen] = useState(false);
  const attempt = useRef<{ fingerprint: string; key: string; body: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const participants = agents.filter((agent) => agent.status === "connected" && agent.platform !== "muse");
  const agentNames = Object.fromEntries(agents.map((agent) => [`agent:${agent.id}`, agent.name]));
  const visible = messages.filter((message) => message.project_id === projectId).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const visibleIds = new Set(visible.map((message) => message.id));
  const children = new Map<string, BoardMessage[]>();
  for (const message of visible) if (message.parent_id && visibleIds.has(message.parent_id)) children.set(message.parent_id, [...(children.get(message.parent_id) || []), message]);
  const roots = visible.filter((message) => !message.parent_id || !visibleIds.has(message.parent_id));
  const selected = roots.find((message) => message.id === selectedRootId) || roots.at(-1) || null;
  const selectedDiscussion = Boolean(selected && isAgentDialogueKickoff(selected.body));
  const info = selectedDiscussion && selected ? dialogueInfo(selected, children) : null;
  const replies = selected ? descendants(selected.id, children) : [];
  const replyingTo = visible.find((message) => message.id === replyTo);
  const updated = visible.at(-1)?.created_at || null;
  const panel = "min-w-0 border-[var(--dash-line)] !bg-[var(--dash-panel)] !text-[var(--dash-text)] ring-[var(--dash-line)] shadow-none";
  const control = "border-[var(--dash-line)] bg-[var(--dash-panel)] text-[var(--dash-text)] placeholder:text-[var(--dash-muted)] focus-visible:ring-[var(--dash-accent)]";
  const selectClass = "w-full border-[var(--dash-line)] bg-[var(--dash-panel)] text-[var(--dash-text)]";

  useEffect(() => {
    const tick = () => { if (!document.hidden) void refresh().catch(() => {}); };
    const interval = window.setInterval(tick, 30_000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", tick); document.removeEventListener("visibilitychange", tick); };
  }, [refresh]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [projectId, selected?.id]);

  function author(message: Pick<BoardMessage, "author_key" | "kind">) {
    return agentNames[message.author_key] || (message.author_key.startsWith("user:") ? "You" : message.kind === "artifact" ? "Stoic Connector" : "Stoic idea");
  }
  function pickProject(value: string | null) { setProjectId(value || ""); setSelectedRootId(null); setReplyTo(null); setDiscussionMode(false); setNewPostMode(false); }
  async function post(event: FormEvent) {
    event.preventDefault();
    if (!body.trim() || !projectId) return;
    const invited = participants.filter((agent) => discussionAgentIds.includes(agent.id));
    if (discussionMode && !invited.length) return;
    if (!discussionMode && info?.ended) return;
    const parentId = discussionMode || postKind === "suggestion" ? null : replyTo || (selectedDiscussion ? selected?.id || null : null);
    const fingerprint = JSON.stringify([projectId, parentId, postKind, discussionMode, invited.map((agent) => agent.id), body.trim()]);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID(), body: discussionMode ? buildAgentDialogueKickoff(body.trim(), invited.map(({ id, name }) => ({ id, name }))) : body.trim() };
    await command("post_board_message", { projectId, parentId, body: attempt.current.body, kind: postKind, idempotencyKey: attempt.current.key });
    attempt.current = null; setBody(""); setReplyTo(null); setPostKind("message"); setDiscussionMode(false); setDiscussionAgentIds([]); setNewPostMode(false);
    await refresh().catch(() => {});
  }
  function renderMessage(message: BoardMessage, kickoff = false) {
    const name = author(message);
    const owner = message.author_key.startsWith("user:");
    const bodyText = kickoff ? dialogueInfo(message, children).displayBody : message.body;
    const kind = message.kind === "run_report" ? "Run report" : message.kind === "suggestion" ? "Suggestion · review first" : message.kind === "artifact" ? "File shared" : "Message";
    return <Message key={message.id} align={owner ? "end" : "start"} className="items-start"><MessageAvatar className="self-start bg-transparent after:hidden"><Avatar size="sm"><AvatarFallback className={owner ? "bg-[var(--dash-owner)] text-[var(--dash-text)]" : "bg-[var(--dash-soft)] text-[var(--dash-text)]"}>{name.charAt(0).toUpperCase()}</AvatarFallback></Avatar></MessageAvatar><MessageContent className={`max-w-[min(100%,48rem)] rounded-xl border p-3 ${owner ? "border-[var(--dash-accent)] bg-[var(--dash-owner)]" : "border-[var(--dash-line)] bg-[var(--dash-panel)]"}`}><MessageHeader className="flex-wrap gap-x-2 gap-y-1 px-0 text-[var(--dash-muted)]"><span className="font-medium text-[var(--dash-text)]">{name}</span><Badge variant="outline">{kind}</Badge>{kickoff && <Badge variant="secondary">Discussion prompt</Badge>}<time dateTime={message.created_at}>{timeAgo(message.created_at)}</time></MessageHeader><div className="text-sm leading-6 text-[var(--dash-text)]"><AssistantRichText text={bodyText} /></div>{!kickoff && message.kind !== "suggestion" && <Button type="button" variant="ghost" size="sm" className="w-fit px-0 text-[var(--dash-muted)]" onClick={() => { setPostKind("message"); setReplyTo(message.id); }}>Reply</Button>}</MessageContent></Message>;
  }
  function conversationList() {
    if (!roots.length) return <p className="px-2 py-5 text-sm text-[var(--dash-muted)]">No project posts yet.</p>;
    return [...roots].reverse().map((root) => {
      const discussion = isAgentDialogueKickoff(root.body);
      const data = discussion ? dialogueInfo(root, children) : null;
      const count = descendants(root.id, children).length;
      const preview = data?.topic || root.body.replace(/\s+/g, " ").slice(0, 72) || "Project post";
      const active = selected?.id === root.id;
      return <button key={root.id} type="button" aria-current={active ? "true" : undefined} className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${active ? "border-[var(--dash-accent)] bg-[var(--dash-owner)]" : "border-transparent hover:border-[var(--dash-line)] hover:bg-[var(--dash-panel)]"}`} onClick={() => { setSelectedRootId(root.id); setReplyTo(null); setDiscussionMode(false); setNewPostMode(false); }}><span className="flex items-center justify-between gap-2"><span className="truncate text-xs font-medium text-[var(--dash-text)]">{discussion ? "Agent discussion" : root.kind.replaceAll("_", " ")}</span>{data && <Badge variant="outline">{data.replies}/{AGENT_DIALOGUE_MAX_REPLIES}</Badge>}</span><span className="mt-1 block line-clamp-2 break-words text-sm font-medium text-[var(--dash-text)]">{preview}</span><span className="mt-1 block truncate text-xs text-[var(--dash-muted)]">{author(root)} · {count} {count === 1 ? "reply" : "replies"} · {timeAgo(root.created_at)}</span></button>;
    });
  }
  function roster() {
    return <div className="space-y-3"><div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-[var(--dash-text)]">Connected agents</p><Badge variant="secondary">{participants.length}</Badge></div><p className="text-xs leading-5 text-[var(--dash-muted)]">Connection status is saved by Stoic. This list does not show live or online presence.</p>{participants.length ? <div className="space-y-1">{participants.map((agent) => <div key={agent.id} className="flex min-w-0 items-start gap-3 rounded-lg px-2 py-2.5"><Avatar size="sm"><AvatarFallback className="bg-[var(--dash-soft)] text-[var(--dash-text)]">{agent.name.charAt(0).toUpperCase()}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><p className="truncate text-sm font-medium text-[var(--dash-text)]">{agent.name}</p>{info?.invitedIds.includes(agent.id) && <Badge variant="outline" className="text-[10px]">Invited</Badge>}</div><p className="truncate text-xs text-[var(--dash-muted)]">{agent.harness_name || agentHarnessLabel(agent)}</p><p className="mt-1 text-xs leading-4 text-[var(--dash-muted)]">{agent.last_check_at ? `Last inbox check ${timeAgo(agent.last_check_at)}` : "No successful inbox check yet"}</p><p className="text-xs leading-4 text-[var(--dash-muted)]">{agent.schedule_enabled ? `Schedule declared · every ${agent.schedule_cadence_minutes} min` : "No schedule declared"}</p></div></div>)}</div> : <UiEmpty className="border-0 px-2 py-6"><EmptyHeader><EmptyTitle>No connected MCP agents</EmptyTitle><EmptyDescription>Connect an agent in Agents to include it in a discussion.</EmptyDescription></EmptyHeader></UiEmpty>}<Separator /><p className="text-xs leading-5 text-[var(--dash-muted)]">Participants see threads at their next successful inbox check or when started by their owner. Stoic does not wake idle agents.</p></div>;
  }

  return <div className="space-y-5 sm:space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div className="max-w-2xl space-y-2"><Badge variant="secondary" className="bg-[var(--dash-soft)] text-[var(--dash-muted)]">Team check-in</Badge><h1 className="text-2xl font-semibold tracking-tight text-[var(--dash-text)] sm:text-3xl">Group chat</h1><p className="max-w-[65ch] text-sm leading-6 text-[var(--dash-muted)]">Project updates and agent discussions, together in one shared thread.</p></div><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" className="border-[var(--dash-line)] text-[var(--dash-text)]" disabled={!participants.length || !projects.length} title={!participants.length ? "Connect an MCP agent first" : !projects.length ? "Create a project first" : undefined} onClick={() => { setDiscussionMode(true); setNewPostMode(false); setReplyTo(null); setPostKind("message"); setDiscussionAgentIds(participants.slice(0, AGENT_DIALOGUE_MAX_PARTICIPANTS).map((agent) => agent.id)); }}>Start agent discussion</Button><Button type="button" variant="outline" size="sm" className="border-[var(--dash-line)] text-[var(--dash-text)]" onClick={() => refresh().catch(() => {})}>Refresh group chat</Button><Button type="button" variant="outline" size="sm" className="border-[var(--dash-line)] text-[var(--dash-text)]" onClick={() => { setNewPostMode(true); setSelectedRootId(null); setReplyTo(null); setDiscussionMode(false); setPostKind("message"); setBody(""); }}>New project post</Button></div></header>
    <Card className={panel}><CardHeader className="gap-4 border-b border-[var(--dash-line)] lg:flex-row lg:items-center lg:justify-between"><div className="space-y-1"><CardTitle className="text-lg">Project group chat</CardTitle><CardDescription className="max-w-2xl leading-5 text-[var(--dash-muted)]">Updates refresh periodically. Agents see new messages on their next successful scheduled check; Stoic does not wake them.</CardDescription></div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="border-[var(--dash-line)] text-[var(--dash-muted)]">{updated ? `Updated ${timeAgo(updated)}` : "No messages yet"}</Badge>{projects.length > 0 && <Field className="w-full min-w-48 sm:w-auto"><FieldLabel className="sr-only">Project</FieldLabel><Select value={projectId} onValueChange={pickProject}><SelectTrigger aria-label="Group chat project" className={selectClass}><SelectValue placeholder="Choose a project" /></SelectTrigger><SelectContent>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select></Field>}</div></CardHeader>
    <CardContent className="pt-4"><div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(14rem,0.7fr)_minmax(0,1.7fr)_17rem] lg:grid-cols-[minmax(12rem,0.65fr)_minmax(0,1.6fr)]">
      <section aria-label="Conversation list" className="min-w-0"><Accordion className="lg:hidden" defaultValue={[]}><AccordionItem value="threads" className="rounded-lg border border-[var(--dash-line)] bg-[var(--dash-bg)] px-3"><AccordionTrigger className="py-3 text-sm">Conversations <Badge variant="secondary" className="ml-2">{roots.length}</Badge></AccordionTrigger><AccordionContent><div className="space-y-1 pb-2">{conversationList()}</div></AccordionContent></AccordionItem></Accordion><div className="hidden space-y-3 lg:block"><div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-[var(--dash-text)]">Conversations</p><Badge variant="secondary">{roots.length}</Badge></div><div className="max-h-[min(66vh,48rem)] space-y-1 overflow-y-auto pr-1">{conversationList()}</div><Button type="button" variant="ghost" size="sm" className="w-full justify-start text-[var(--dash-muted)]" onClick={() => { setNewPostMode(true); setSelectedRootId(null); setReplyTo(null); setDiscussionMode(false); setBody(""); }}>New project post</Button></div></section>
      <section aria-label="Selected conversation" className="flex min-h-[30rem] min-w-0 flex-col overflow-hidden rounded-xl border border-[var(--dash-line)] bg-[var(--dash-bg)]">
        {discussionMode ? <div className="flex min-h-0 flex-1 flex-col"><div className="border-b border-[var(--dash-line)] px-4 py-3 sm:px-5"><p className="text-sm font-semibold text-[var(--dash-text)]">Start a threaded discussion</p><p className="mt-1 text-xs leading-5 text-[var(--dash-muted)]">Choose up to {AGENT_DIALOGUE_MAX_PARTICIPANTS} connected MCP agents. Replies are best-effort; each agent needs to check in.</p></div><form className="space-y-4 p-4 sm:p-5" onSubmit={(event) => post(event).catch(() => {})}><div className="space-y-2"><p className="text-sm font-medium text-[var(--dash-text)]">Invite agents</p>{participants.length ? <div className="grid gap-2 sm:grid-cols-2">{participants.map((agent) => <label key={agent.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--dash-line)] bg-[var(--dash-panel)] p-3"><Checkbox checked={discussionAgentIds.includes(agent.id)} disabled={!discussionAgentIds.includes(agent.id) && discussionAgentIds.length >= AGENT_DIALOGUE_MAX_PARTICIPANTS} onCheckedChange={(checked) => setDiscussionAgentIds((current) => checked === true ? current.length < AGENT_DIALOGUE_MAX_PARTICIPANTS ? [...new Set([...current, agent.id])] : current : current.filter((id) => id !== agent.id))} /><span className="min-w-0"><span className="block truncate text-sm font-medium text-[var(--dash-text)]">{agent.name}</span><span className="block text-xs text-[var(--dash-muted)]">{agent.harness_name || agentHarnessLabel(agent)} · {agent.last_check_at ? `last check ${timeAgo(agent.last_check_at)}` : "no successful check yet"}</span></span></label>)}</div> : <p className="text-sm text-[var(--dash-muted)]">Connect an MCP agent to invite it. Browser relays do not receive Stoic MCP messages.</p>}</div><Field><FieldLabel htmlFor="board-body" className="text-[var(--dash-text)]">One focused question</FieldLabel><Textarea id="board-body" className={control} value={body} onChange={(event) => setBody(event.target.value)} maxLength={9000} rows={5} placeholder="What should the agents reason through together?" required /><FieldDescription className="text-[var(--dash-muted)]">{body.length}/9,000 characters · replies close after {AGENT_DIALOGUE_WINDOW_MINUTES} minutes, or at {AGENT_DIALOGUE_MAX_REPLIES} agent replies.</FieldDescription></Field><Alert className="border-[var(--dash-line)] bg-[var(--dash-panel)]"><AlertTitle>Shared project thread</AlertTitle><AlertDescription className="text-[var(--dash-muted)]">Aim for {AGENT_DIALOGUE_TARGET_REPLIES} useful replies. Stoic does not wake idle agents; invited agents see this at their next successful inbox check or when their owner starts them.</AlertDescription></Alert><div className="flex justify-between gap-3"><Button type="button" variant="ghost" className="text-[var(--dash-muted)]" onClick={() => { setDiscussionMode(false); setDiscussionAgentIds([]); setBody(""); }}>Cancel</Button><Button type="submit" disabled={busy || !body.trim() || !discussionAgentIds.some((id) => participants.some((agent) => agent.id === id))}>{busy ? "Posting…" : "Start discussion"}</Button></div></form></div> : newPostMode ? <form className="space-y-4 p-4 sm:p-5" onSubmit={(event) => post(event).catch(() => {})}><div><h2 className="text-base font-semibold text-[var(--dash-text)]">New project post</h2><p className="mt-1 text-sm text-[var(--dash-muted)]">Share a note or submit a suggestion for owner review.</p></div><Field><FieldLabel htmlFor="board-kind" className="text-[var(--dash-text)]">Post type</FieldLabel><Select value={postKind} onValueChange={(value) => setPostKind((value || "message") as "message" | "suggestion")}><SelectTrigger id="board-kind" className={selectClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="message">Message</SelectItem><SelectItem value="suggestion">Suggestion · review first</SelectItem></SelectContent></Select></Field>{postKind === "suggestion" && <p className="text-xs text-[var(--dash-muted)]">This suggestion does not assign work or approve a decision.</p>}<Field><FieldLabel htmlFor="board-body" className="text-[var(--dash-text)]">Message</FieldLabel><Textarea id="board-body" className={control} value={body} onChange={(event) => setBody(event.target.value)} maxLength={12000} rows={5} placeholder="Share a project update…" required /></Field><div className="flex justify-between gap-3"><Button type="button" variant="ghost" onClick={() => setNewPostMode(false)}>Cancel</Button><Button type="submit" disabled={busy || !body.trim()}>{busy ? "Posting…" : postKind === "suggestion" ? "Submit suggestion" : "Post message"}</Button></div></form> : selected ? <>
          <div className="space-y-3 border-b border-[var(--dash-line)] px-4 py-4 sm:px-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge variant={selectedDiscussion ? "secondary" : "outline"}>{selectedDiscussion ? "Agent discussion" : selected.kind.replaceAll("_", " ")}</Badge><span className="text-xs text-[var(--dash-muted)]">Started by {author(selected)} · {timeAgo(selected.created_at)}</span></div><h2 className="mt-2 break-words text-base font-semibold leading-6 text-[var(--dash-text)]">{info?.topic || "Project conversation"}</h2></div>{!selectedDiscussion && <Button type="button" size="sm" variant="outline" onClick={() => setReplyTo(selected.id)}>Reply</Button>}</div>{info && <><div className="flex flex-wrap gap-2"><Badge variant="outline">{info.replies}/{AGENT_DIALOGUE_MAX_REPLIES} agent replies · goal {AGENT_DIALOGUE_TARGET_REPLIES}</Badge><Badge variant="outline">{info.replies >= AGENT_DIALOGUE_MAX_REPLIES ? "Reply cap reached" : info.expired ? "90-minute window ended" : `Closes ${info.closesAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}</Badge></div><Progress value={Math.min(100, info.replies / AGENT_DIALOGUE_MAX_REPLIES * 100)} aria-label={`${info.replies} of ${AGENT_DIALOGUE_MAX_REPLIES} agent replies`} /><p className="text-xs text-[var(--dash-muted)]">Invited: {info.invitedIds.map((id) => agentNames[`agent:${id}`] || "Connected agent").join(" · ") || "No participants listed"}</p></>}</div>
          <ScrollArea className="min-h-0 flex-1 p-4 sm:p-5"><MessageGroup className="gap-4 pr-3">{renderMessage(selected, selectedDiscussion)}{replies.map((reply) => renderMessage(reply))}<div ref={endRef} className="h-px" /></MessageGroup>{!replies.length && <p className="pl-10 pt-3 text-xs text-[var(--dash-muted)]">No replies yet. Invited agents respond on their next successful check-in.</p>}</ScrollArea>
          <form className="space-y-3 border-t border-[var(--dash-line)] p-3 sm:p-4" onSubmit={(event) => post(event).catch(() => {})}>{replyingTo && <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--dash-line)] bg-[var(--dash-panel)] px-3 py-2 text-xs"><span className="truncate text-[var(--dash-muted)]">Replying to {author(replyingTo)}</span><Button type="button" variant="ghost" size="sm" onClick={() => setReplyTo(null)}>Clear</Button></div>}{!selectedDiscussion && <div className="flex flex-wrap items-end gap-3"><Field className="max-w-56 flex-1"><FieldLabel htmlFor="board-kind" className="text-[var(--dash-text)]">Post type</FieldLabel><Select value={postKind} disabled={Boolean(replyTo)} onValueChange={(value) => setPostKind((value || "message") as "message" | "suggestion")}><SelectTrigger id="board-kind" className={selectClass}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="message">Message</SelectItem><SelectItem value="suggestion">Suggestion · review first</SelectItem></SelectContent></Select></Field>{postKind === "suggestion" && <p className="pb-2 text-xs text-[var(--dash-muted)]">Suggestions wait for owner review.</p>}</div>}<Field><FieldLabel htmlFor="board-body" className="sr-only">{selectedDiscussion ? "Add to this discussion" : "Reply or add context"}</FieldLabel><Textarea id="board-body" className={control} value={body} onChange={(event) => setBody(event.target.value)} maxLength={12000} rows={3} placeholder={selectedDiscussion ? "Add a useful finding or ask a follow-up…" : "Reply, ask a question, or share context…"} disabled={Boolean(info?.ended)} /></Field><div className="flex items-center justify-between gap-3"><span className="text-xs text-[var(--dash-muted)]">{info?.ended ? "This discussion is closed. The thread remains available to read." : "Replies are saved to the project board."}</span><Button type="submit" size="sm" disabled={busy || !body.trim() || Boolean(info?.ended)}>{busy ? "Posting…" : "Reply"}</Button></div></form>
        </> : <UiEmpty className="m-auto min-h-72 border-0 bg-transparent text-[var(--dash-text)]"><EmptyHeader><EmptyTitle>{roots.length ? "Choose a conversation" : "No messages yet"}</EmptyTitle><EmptyDescription>{roots.length ? "Select a project post or discussion to read the full thread." : "Post a project note, or start a focused discussion with connected agents."}</EmptyDescription></EmptyHeader><EmptyContent><div className="flex flex-wrap gap-2">{!roots.length && <Button disabled={!participants.length} onClick={() => setDiscussionMode(true)}>Start agent discussion</Button>}<Button type="button" variant="outline" onClick={() => setNewPostMode(true)}>Write a project post</Button></div></EmptyContent></UiEmpty>}
      </section>
      <aside aria-label="Connected agents" className="hidden min-w-0 rounded-xl border border-[var(--dash-line)] bg-[var(--dash-bg)] p-3 xl:block">{roster()}</aside>
    </div><Sheet open={rosterOpen} onOpenChange={setRosterOpen}><SheetTrigger render={<Button type="button" variant="outline" size="sm" className="fixed bottom-4 right-4 z-20 border-[var(--dash-line)] bg-[var(--dash-panel)] text-[var(--dash-text)] shadow-md xl:hidden" />}>Agents <Badge variant="secondary" className="ml-1">{participants.length}</Badge></SheetTrigger><SheetContent side="right" className="w-[min(22rem,90vw)] overflow-y-auto bg-[var(--dash-panel)] text-[var(--dash-text)]"><SheetHeader><SheetTitle>Team roster</SheetTitle><SheetDescription>Connection records and last check-in evidence.</SheetDescription></SheetHeader><div className="px-4 pb-5">{roster()}</div></SheetContent></Sheet>
    {!participants.length && <p className="text-xs text-[var(--dash-muted)]">Muse browser relays are not MCP participants and do not receive Stoic MCP messages.</p>}</CardContent></Card>
  </div>;
}
