"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Platform } from "@/lib/config";
import { AGENT_DIALOGUE_MARKER, AGENT_DIALOGUE_MAX_PARTICIPANTS, AGENT_DIALOGUE_MAX_REPLIES, AGENT_DIALOGUE_TARGET_REPLIES, AGENT_DIALOGUE_WINDOW_MINUTES, buildAgentDialogueKickoff, isAgentDialogueKickoff } from "@/lib/agent-dialogue";
import { agentChatColor } from "@/lib/agent-chat-color";
import { AssistantRichText } from "@/components/rich-text";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty as UiEmpty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Message, MessageAvatar, MessageContent, MessageGroup, MessageHeader } from "@/components/ui/message";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Agent = { id: string; name: string; platform: Platform; status: string; created_at: string };
type Project = { id: string; name: string; brief: string; brief_version: number; default_agent_id: string | null; created_at: string };
type BoardMessage = { id: string; project_id: string; parent_id: string | null; author_key: string; kind: "message" | "run_report" | "suggestion" | "artifact"; body: string; created_at: string };
type DialogueInfo = { invitedIds: string[]; replies: number; closesAt: Date; expired: boolean; ended: boolean; displayBody: string; topic: string };

function timeAgo(value: string | null) {
  if (!value) return "Never";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 2) return "Just now";
  if (minutes < 60) return minutes + "m ago";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + "h ago";
  return Math.floor(hours / 24) + "d ago";
}

function descendants(rootId: string, children: Map<string, BoardMessage[]>) {
  const result: BoardMessage[] = [];
  const pending = [...(children.get(rootId) || [])];
  while (pending.length) {
    const message = pending.shift()!;
    result.push(message);
    pending.push(...(children.get(message.id) || []));
  }
  return result.sort((left, right) => left.created_at.localeCompare(right.created_at));
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

export function BoardDiscussionView({ projects, agents, messages, busy, command, refresh, onPlan }: { projects: Project[]; agents: Agent[]; messages: BoardMessage[]; busy: boolean; command: (action: string, payload?: Record<string, unknown>) => Promise<unknown>; refresh: () => Promise<void>; onPlan?: () => void }) {
  const [projectId, setProjectId] = useState(projects[0]?.id || "");
  const [body, setBody] = useState("");
  const [postKind, setPostKind] = useState<"message" | "suggestion">("message");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [discussionMode, setDiscussionMode] = useState(false);
  const [discussionAgentIds, setDiscussionAgentIds] = useState<string[]>([]);
  const attempt = useRef<{ fingerprint: string; key: string; body: string } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const participants = agents.filter((agent) => agent.status === "connected" && agent.platform !== "muse");
  const colorAgentIds = agents.filter((agent) => agent.status !== "revoked").map((agent) => agent.id);
  const agentNames = Object.fromEntries(agents.map((agent) => ["agent:" + agent.id, agent.name]));
  const visible = messages.filter((message) => message.project_id === projectId).sort((left, right) => left.created_at.localeCompare(right.created_at));
  const visibleById = new Map(visible.map((message) => [message.id, message]));
  const children = new Map<string, BoardMessage[]>();
  for (const message of visible) {
    if (message.parent_id && visibleById.has(message.parent_id)) {
      children.set(message.parent_id, [...(children.get(message.parent_id) || []), message]);
    }
  }
  const replyingTo = replyTo ? visibleById.get(replyTo) || null : null;
  const updated = visible.at(-1)?.created_at || null;
  const selectedProject = projects.find((project) => project.id === projectId);
  const control = "border-[var(--dash-line)] bg-[var(--dash-panel)] text-[var(--dash-text)] placeholder:text-[var(--dash-muted)] focus-visible:ring-[var(--dash-accent)]";
  const selectClass = "w-full border-[var(--dash-line)] bg-[var(--dash-panel)] text-[var(--dash-text)]";

  function discussionRootFor(messageId: string | null) {
    let current = messageId ? visibleById.get(messageId) : undefined;
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      if (!current.parent_id) return isAgentDialogueKickoff(current.body) ? current : null;
      current = visibleById.get(current.parent_id);
    }
    return null;
  }
  const replyingDiscussion = discussionRootFor(replyTo);
  const replyInfo = replyingDiscussion ? dialogueInfo(replyingDiscussion, children) : null;

  useEffect(() => {
    const tick = () => { if (!document.hidden) void refresh().catch(() => {}); };
    const interval = window.setInterval(tick, 30_000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [projectId, visible.length]);

  function author(message: Pick<BoardMessage, "author_key" | "kind">) {
    return agentNames[message.author_key] || (message.author_key.startsWith("user:") ? "You" : message.kind === "artifact" ? "Stoic Connector" : "Stoic idea");
  }

  function pickProject(value: string | null) {
    setProjectId(value || "");
    setReplyTo(null);
    setDiscussionMode(false);
    setBody("");
  }

  async function post(event: FormEvent) {
    event.preventDefault();
    if (!body.trim() || !projectId) return;
    const invited = participants.filter((agent) => discussionAgentIds.includes(agent.id));
    if (discussionMode && !invited.length) return;
    if (!discussionMode && replyInfo?.ended) return;
    const kind = discussionMode ? "message" : postKind;
    const parentId = discussionMode || kind === "suggestion" ? null : replyTo;
    const fingerprint = JSON.stringify([projectId, parentId, kind, discussionMode, invited.map((agent) => agent.id), body.trim()]);
    if (attempt.current?.fingerprint !== fingerprint) {
      attempt.current = {
        fingerprint,
        key: crypto.randomUUID(),
        body: discussionMode ? buildAgentDialogueKickoff(body.trim(), invited.map(({ id, name }) => ({ id, name }))) : body.trim(),
      };
    }
    await command("post_board_message", { projectId, parentId, body: attempt.current.body, kind, idempotencyKey: attempt.current.key });
    attempt.current = null;
    setBody("");
    setReplyTo(null);
    setPostKind("message");
    setDiscussionMode(false);
    setDiscussionAgentIds([]);
    await refresh().catch(() => {});
  }

  function renderMessage(message: BoardMessage) {
    const name = author(message);
    const owner = message.author_key.startsWith("user:");
    const agentId = message.author_key.startsWith("agent:") ? message.author_key.slice("agent:".length) : null;
    const tint = agentId ? agentChatColor(agentId, colorAgentIds) : null;
    const kickoff = isAgentDialogueKickoff(message.body);
    const info = kickoff ? dialogueInfo(message, children) : null;
    const bodyText = info?.displayBody || message.body;
    const kind = message.kind === "run_report" ? "Run report" : message.kind === "suggestion" ? "Suggestion · review first" : message.kind === "artifact" ? "File shared" : "Message";
    return (
      <Message key={message.id} align={owner ? "end" : "start"} className="items-start">
        <MessageAvatar className="self-start bg-transparent after:hidden">
          <Avatar size="sm">
            <AvatarFallback
              className={owner ? "bg-[var(--dash-owner)] text-[var(--dash-text)]" : "border"}
              style={tint ? { backgroundColor: tint.avatar, borderColor: tint.border, color: tint.accent } : undefined}
            >
              {name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </MessageAvatar>
        <MessageContent
          className={"max-w-[min(100%,76rem)] rounded-xl border p-3 sm:p-4 " + (owner ? "border-[var(--dash-accent)] bg-[var(--dash-owner)]" : "border-[var(--dash-line)] bg-[var(--dash-panel)]")}
          style={tint ? { borderColor: tint.border, backgroundColor: tint.background } : undefined}
        >
          <MessageHeader className="flex-wrap gap-x-2 gap-y-1 px-0 text-[var(--dash-muted)]">
            {tint && <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: tint.accent }} />}
            <span className="font-medium text-[var(--dash-text)]">{name}</span>
            <Badge variant="outline">{kind}</Badge>
            {kickoff && <Badge variant="secondary">Focused discussion</Badge>}
            <time dateTime={message.created_at}>{timeAgo(message.created_at)}</time>
          </MessageHeader>
          <div className="text-sm leading-6 text-[var(--dash-text)]"><AssistantRichText text={bodyText} /></div>
          {info && (
            <div className="space-y-2 border-t border-[var(--dash-line)]/60 pt-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{info.replies}/{AGENT_DIALOGUE_MAX_REPLIES} agent replies · goal {AGENT_DIALOGUE_TARGET_REPLIES}</Badge>
                <Badge variant="outline">{info.ended ? "Discussion closed" : "Open for 90 minutes"}</Badge>
              </div>
              <p className="text-xs text-[var(--dash-muted)]">Invited: {info.invitedIds.map((id) => agentNames["agent:" + id] || "Connected agent").join(" · ") || "No participants listed"}</p>
            </div>
          )}
          {!kickoff && message.kind !== "suggestion" && (
            <Button type="button" variant="ghost" size="sm" className="w-fit px-0 text-[var(--dash-muted)]" onClick={() => { setPostKind("message"); setReplyTo(message.id); }}>
              Reply
            </Button>
          )}
        </MessageContent>
      </Message>
    );
  }

  return (
    <div className="board-discussion-layout flex min-h-0 flex-1 flex-col gap-4 sm:gap-5">
      <header className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl space-y-2">
          <Badge variant="secondary" className="bg-[var(--dash-soft)] text-[var(--dash-muted)]">Team check-in</Badge>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--dash-text)] sm:text-3xl">Stoic Chat</h1>
          <p className="max-w-[65ch] text-sm leading-6 text-[var(--dash-muted)]">One shared project conversation. All messages appear here in time order.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onPlan && <Button type="button" variant="outline" size="sm" className="border-[var(--dash-line)] text-[var(--dash-text)]" onClick={onPlan}>Plan with Stoic</Button>}
          <Button type="button" variant="outline" size="sm" className="border-[var(--dash-line)] text-[var(--dash-text)]" disabled={!participants.length || !projects.length} title={!participants.length ? "Connect an MCP agent first" : !projects.length ? "Create a project first" : undefined} onClick={() => { setDiscussionMode((current) => !current); setReplyTo(null); setPostKind("message"); }}>
            {discussionMode ? "Cancel focused discussion" : "Start agent discussion"}
          </Button>
          <Button type="button" variant="outline" size="sm" className="border-[var(--dash-line)] text-[var(--dash-text)]" onClick={() => refresh().catch(() => {})}>Refresh Stoic Chat</Button>
        </div>
      </header>
      <Card className="flex min-h-0 min-w-0 flex-1 flex-col border-[var(--dash-line)] !bg-[var(--dash-panel)] !text-[var(--dash-text)] shadow-none">
        <CardHeader className="shrink-0 gap-4 border-b border-[var(--dash-line)] sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">{selectedProject?.name || "Project room"}</CardTitle>
            <CardDescription className="max-w-2xl leading-5 text-[var(--dash-muted)]">Messages share project context with connected agents. General messages join this room; use Reply when a post needs a direct response. Confirm decisions in the project brief.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-[var(--dash-line)] text-[var(--dash-muted)]">{updated ? "Updated " + timeAgo(updated) : "No messages yet"}</Badge>
            {projects.length > 0 && (
              <Field className="w-full min-w-48 sm:w-auto">
                <FieldLabel className="sr-only">Project</FieldLabel>
                <Select value={projectId} onValueChange={pickProject}>
                  <SelectTrigger aria-label="Stoic Chat project" className={selectClass}><SelectValue placeholder="Choose a project" /></SelectTrigger>
                  <SelectContent>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col pt-4">
          <section aria-label="Shared project conversation" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--dash-line)] bg-[var(--dash-bg)]">
            <ScrollArea className="min-h-0 flex-1 overscroll-contain p-4 sm:p-6">
              {visible.length ? (
                <MessageGroup className="gap-4 pr-3">
                  {visible.map(renderMessage)}
                  <div ref={endRef} className="h-px" />
                </MessageGroup>
              ) : (
                <UiEmpty className="min-h-[18rem] border-0 bg-transparent text-[var(--dash-text)]">
                  <EmptyHeader>
                    <EmptyTitle>The Stoic Chat room is ready</EmptyTitle>
                    <EmptyDescription>Your first message starts the shared room. General project updates will keep appearing in this conversation.</EmptyDescription>
                  </EmptyHeader>
                </UiEmpty>
              )}
            </ScrollArea>
            {discussionMode && (
              <div className="shrink-0 space-y-3 border-t border-[var(--dash-line)] px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-[var(--dash-text)]">Invite agents to a focused discussion</p>
                  <Badge variant="secondary">{discussionAgentIds.length}/{AGENT_DIALOGUE_MAX_PARTICIPANTS}</Badge>
                </div>
                {participants.length ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {participants.map((agent) => (
                      <label key={agent.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--dash-line)] bg-[var(--dash-panel)] p-3">
                        <Checkbox checked={discussionAgentIds.includes(agent.id)} disabled={!discussionAgentIds.includes(agent.id) && discussionAgentIds.length >= AGENT_DIALOGUE_MAX_PARTICIPANTS} onCheckedChange={(checked) => setDiscussionAgentIds((current) => checked === true ? current.length < AGENT_DIALOGUE_MAX_PARTICIPANTS ? [...new Set([...current, agent.id])] : current : current.filter((id) => id !== agent.id))} />
                        <span className="min-w-0 truncate text-sm font-medium text-[var(--dash-text)]">{agent.name}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--dash-muted)]">Connect an MCP agent to invite it. Browser relays do not receive Stoic MCP messages.</p>
                )}
                <Alert className="border-[var(--dash-line)] bg-[var(--dash-panel)] py-2">
                  <AlertTitle className="text-sm">This prompt will appear in the shared conversation</AlertTitle>
                  <AlertDescription className="text-xs text-[var(--dash-muted)]">Invited agents can reply at their next inbox check. Discussion replies close after {AGENT_DIALOGUE_WINDOW_MINUTES} minutes or {AGENT_DIALOGUE_MAX_REPLIES} agent replies.</AlertDescription>
                </Alert>
              </div>
            )}
            <form className="shrink-0 space-y-3 border-t border-[var(--dash-line)] p-3 sm:p-4" onSubmit={(event) => post(event).catch(() => {})}>
              {replyingTo && (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--dash-line)] bg-[var(--dash-panel)] px-3 py-2 text-xs">
                  <span className="truncate text-[var(--dash-muted)]">Replying to {author(replyingTo)}: {replyingTo.body}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setReplyTo(null)}>Clear</Button>
                </div>
              )}
              {!discussionMode && (
                <div className="flex flex-wrap items-end gap-3">
                  <Field className="max-w-56 flex-1">
                    <FieldLabel htmlFor="board-kind" className="text-[var(--dash-text)]">Post type</FieldLabel>
                    <Select value={postKind} disabled={Boolean(replyTo)} onValueChange={(value) => setPostKind((value || "message") as "message" | "suggestion")}>
                      <SelectTrigger id="board-kind" className={selectClass}><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="message">Message</SelectItem><SelectItem value="suggestion">Suggestion · review first</SelectItem></SelectContent>
                    </Select>
                    {postKind === "suggestion" && <FieldDescription className="text-[var(--dash-muted)]">Suggestions remain separate from ordinary chat for owner review.</FieldDescription>}
                  </Field>
                </div>
              )}
              <Field>
                <FieldLabel htmlFor="board-body" className="sr-only">{discussionMode ? "Focused discussion question" : "Project message"}</FieldLabel>
                <Textarea id="board-body" className={control} value={body} onChange={(event) => setBody(event.target.value)} maxLength={discussionMode ? 9000 : 12000} rows={3} placeholder={discussionMode ? "What should the agents reason through together?" : "Write a message to the project group…"} required />
                {discussionMode && <FieldDescription className="text-[var(--dash-muted)]">A focused prompt is added to this same conversation. Aim for {AGENT_DIALOGUE_TARGET_REPLIES} useful replies.</FieldDescription>}
              </Field>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-[var(--dash-muted)]">{replyInfo?.ended ? "This focused discussion is closed." : body.length.toLocaleString() + " / " + (discussionMode ? "9,000" : "12,000") + " characters"}</span>
                <Button type="submit" size="sm" disabled={busy || !body.trim() || Boolean(replyInfo?.ended) || (discussionMode && !discussionAgentIds.length)}>
                  {busy ? "Posting…" : discussionMode ? "Start discussion" : postKind === "suggestion" ? "Submit suggestion" : "Send message"}
                </Button>
              </div>
            </form>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
