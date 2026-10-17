"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Platform } from "@/lib/config";
import { AGENT_DIALOGUE_MARKER, AGENT_GROUP_DISCUSSION_MARKER, AGENT_DIALOGUE_MAX_PARTICIPANTS, AGENT_DIALOGUE_MAX_REPLIES, AGENT_DIALOGUE_TARGET_REPLIES, AGENT_DIALOGUE_WINDOW_MINUTES, buildAgentDialogueKickoff, isAgentDialogueKickoff } from "@/lib/agent-dialogue";
import { agentChatColor } from "@/lib/agent-chat-color";
import { AssistantRichText } from "@/components/rich-text";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty as UiEmpty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ArrowPathIcon, ArrowUpIcon, ChatBubbleLeftRightIcon, EllipsisHorizontalIcon, FolderIcon, MagnifyingGlassIcon, PlusIcon, SparklesIcon, UserGroupIcon, XMarkIcon } from "@heroicons/react/24/outline";

type Agent = { id: string; name: string; platform: Platform; status: string; created_at: string };
type Project = { id: string; name: string; brief: string; brief_version: number; default_agent_id: string | null; created_at: string };
type BoardMessage = { id: string; project_id: string; parent_id: string | null; author_key: string; kind: "message" | "run_report" | "suggestion" | "artifact"; body: string; created_at: string };
type DialogueInfo = { invitedIds: string[]; replies: number; ended: boolean; ongoing: boolean; displayBody: string; topic: string };

function timeAgo(value: string | null) {
  if (!value) return "No messages yet";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 2) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function messageTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function dayKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (dayKey(value) === dayKey(today)) return `Today · ${new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(date)}`;
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(value) === dayKey(yesterday)) return `Yesterday · ${new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(date)}`;
  return new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(date);
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
  const ongoing = message.body.startsWith(AGENT_GROUP_DISCUSSION_MARKER);
  const closesAt = new Date(new Date(message.created_at).getTime() + AGENT_DIALOGUE_WINDOW_MINUTES * 60_000);
  const expired = !ongoing && Date.now() >= closesAt.getTime();
  const displayBody = message.body.replace(ongoing ? AGENT_GROUP_DISCUSSION_MARKER : AGENT_DIALOGUE_MARKER, "").replace(/^Invited agent IDs:.*\r?\n/m, "").trim();
  const topic = displayBody.match(/^Topic:\s*(.*)$/m)?.[1]?.trim() || "Agent discussion";
  return { invitedIds, replies, ongoing, ended: expired || (!ongoing && replies >= AGENT_DIALOGUE_MAX_REPLIES), displayBody, topic };
}

export function BoardDiscussionView({ projects, agents, messages, busy, command, refresh, onPlan, onManageProjects }: {
  projects: Project[];
  agents: Agent[];
  messages: BoardMessage[];
  busy: boolean;
  command: (action: string, payload?: Record<string, unknown>) => Promise<unknown>;
  refresh: () => Promise<void>;
  onPlan?: () => void;
  onManageProjects?: () => void;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id || "");
  const [projectSearch, setProjectSearch] = useState("");
  const [roomsOpen, setRoomsOpen] = useState(false);
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

  useEffect(() => {
    if (!projectId || !projects.some((project) => project.id === projectId)) setProjectId(projects[0]?.id || "");
  }, [projectId, projects]);

  const latestByProject = new Map<string, BoardMessage>();
  for (const message of messages) {
    const latest = latestByProject.get(message.project_id);
    if (!latest || latest.created_at.localeCompare(message.created_at) < 0) latestByProject.set(message.project_id, message);
  }
  const filteredProjects = projects
    .filter((project) => {
      const latest = latestByProject.get(project.id);
      const query = projectSearch.trim().toLocaleLowerCase();
      return !query || project.name.toLocaleLowerCase().includes(query) || latest?.body.toLocaleLowerCase().includes(query);
    })
    .sort((left, right) => (latestByProject.get(right.id)?.created_at || right.created_at).localeCompare(latestByProject.get(left.id)?.created_at || left.created_at));

  const visible = messages.filter((message) => message.project_id === projectId).sort((left, right) => left.created_at.localeCompare(right.created_at));
  const visibleById = new Map(visible.map((message) => [message.id, message]));
  const children = new Map<string, BoardMessage[]>();
  for (const message of visible) {
    if (message.parent_id && visibleById.has(message.parent_id)) {
      children.set(message.parent_id, [...(children.get(message.parent_id) || []), message]);
    }
  }
  const replyingTo = replyTo ? visibleById.get(replyTo) || null : null;
  const selectedProject = projects.find((project) => project.id === projectId);
  const control = "border-[var(--dash-line)] bg-[var(--dash-panel)] text-[var(--dash-text)] placeholder:text-[var(--dash-muted)] focus-visible:ring-[var(--dash-accent)]";

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

  function pickProject(value: string) {
    setProjectId(value);
    setReplyTo(null);
    setDiscussionMode(false);
    setBody("");
    setProjectSearch("");
    setRoomsOpen(false);
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

  function renderMessage(message: BoardMessage, index: number) {
    const name = author(message);
    const owner = message.author_key.startsWith("user:");
    const previous = visible[index - 1];
    const followsSameAuthor = Boolean(previous && previous.author_key === message.author_key && dayKey(previous.created_at) === dayKey(message.created_at) && new Date(message.created_at).getTime() - new Date(previous.created_at).getTime() < 5 * 60_000);
    const startsNewDay = !previous || dayKey(previous.created_at) !== dayKey(message.created_at);
    const agentId = message.author_key.startsWith("agent:") ? message.author_key.slice("agent:".length) : null;
    const tint = agentId ? agentChatColor(agentId, colorAgentIds) : null;
    const kickoff = isAgentDialogueKickoff(message.body);
    const info = kickoff ? dialogueInfo(message, children) : null;
    const bodyText = info?.displayBody || message.body;
    const kind = message.kind === "run_report" ? "Run report" : message.kind === "suggestion" ? "Suggestion" : message.kind === "artifact" ? "File shared" : null;

    return <Fragment key={message.id}>
      {startsNewDay && <div className="room-day-divider"><span>{dayLabel(message.created_at)}</span></div>}
      <article className={`room-message ${owner ? "is-owner" : "is-agent"} ${followsSameAuthor ? "is-grouped" : ""}`} aria-label={`${name}, ${messageTime(message.created_at)}`}>
        {!owner && (followsSameAuthor ? <span className="room-message-avatar-spacer" aria-hidden="true" /> : <Avatar size="sm" className="room-message-avatar"><AvatarFallback style={tint ? { backgroundColor: tint.avatar, borderColor: tint.border, color: tint.accent } : undefined}>{name.charAt(0).toUpperCase()}</AvatarFallback></Avatar>)}
        <div className="room-message-stack">
          {!followsSameAuthor && <div className="room-message-meta">
            <strong>{name}</strong>
            {kind && <Badge variant="outline" className={`room-message-kind kind-${message.kind}`}>{kind}</Badge>}
            {kickoff && <Badge variant="secondary" className="room-message-kind">Focused discussion</Badge>}
            <time dateTime={message.created_at}>{messageTime(message.created_at)}</time>
          </div>}
          <div className="room-message-bubble">
            <div className="room-message-copy"><AssistantRichText text={bodyText} /></div>
          </div>
          {info && <div className="room-discussion-info">
            <div className="room-discussion-status">
              <Badge variant="outline">{info.ongoing ? `${info.replies} agent replies` : `${info.replies}/${AGENT_DIALOGUE_MAX_REPLIES} agent replies · goal ${AGENT_DIALOGUE_TARGET_REPLIES}`}</Badge>
              <Badge variant="outline">{info.ongoing ? "Ongoing discussion" : info.ended ? "Discussion closed" : "Open for 90 minutes"}</Badge>
            </div>
            <p>Invited: {info.invitedIds.map((id) => agentNames["agent:" + id] || "Connected agent").join(" · ") || "No participants listed"}</p>
          </div>}
          {(!kickoff || info?.ongoing) && message.kind !== "suggestion" && <Button type="button" variant="ghost" size="sm" className="room-reply-action" onClick={() => { setPostKind("message"); setReplyTo(message.id); }}>
            Reply
          </Button>}
        </div>
        {owner && <span className="room-owner-avatar" aria-hidden="true">Y</span>}
      </article>
    </Fragment>;
  }

  return (
    <div className="room-finder-layout">
      <aside className={`room-finder-projects ${roomsOpen ? "is-open" : ""}`} aria-label="Project conversations">
        <div className="room-finder-list-header">
          <div className="room-finder-list-title-row">
            <div>
              <p className="room-finder-eyebrow">Shared rooms</p>
              <h2>Projects</h2>
            </div>
            <div className="room-finder-list-actions">
              {onManageProjects && <Button type="button" variant="ghost" size="icon" aria-label="Manage projects" title="Manage projects" onClick={onManageProjects}><PlusIcon aria-hidden="true" /></Button>}
              <Button type="button" variant="ghost" size="icon" className="room-finder-close" aria-label="Close project list" onClick={() => setRoomsOpen(false)}><XMarkIcon aria-hidden="true" /></Button>
            </div>
          </div>
          <label className="room-finder-search">
            <MagnifyingGlassIcon aria-hidden="true" />
            <span className="sr-only">Search project conversations</span>
            <input value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} placeholder="Search projects" />
            {projectSearch && <button type="button" aria-label="Clear project search" onClick={() => setProjectSearch("")}><XMarkIcon aria-hidden="true" /></button>}
          </label>
        </div>
        <ScrollArea className="room-finder-project-scroll">
          <div className="room-finder-project-list">
            {filteredProjects.map((project) => {
              const latest = latestByProject.get(project.id);
              const preview = latest?.body.replace(/^Invited agent IDs:.*\r?\n/m, "").replace(/\s+/g, " ").trim();
              return <button key={project.id} type="button" className={`room-finder-project-row ${project.id === projectId ? "is-selected" : ""}`} aria-current={project.id === projectId ? "true" : undefined} onClick={() => pickProject(project.id)}>
                <span className="room-finder-project-icon"><FolderIcon aria-hidden="true" /></span>
                <span className="room-finder-project-copy">
                  <span className="room-finder-project-heading"><strong>{project.name}</strong><time dateTime={latest?.created_at || project.created_at}>{latest ? timeAgo(latest.created_at) : "New"}</time></span>
                  <span className="room-finder-project-preview">{preview ? preview : "Start the project conversation"}</span>
                </span>
              </button>;
            })}
            {!filteredProjects.length && <div className="room-finder-project-empty">{projects.length ? "No projects match that search." : "Your project rooms will appear here."}</div>}
          </div>
        </ScrollArea>
        {!projects.length && onManageProjects && <div className="room-finder-no-projects"><Button type="button" variant="outline" size="sm" onClick={onManageProjects}>Create a project</Button></div>}
      </aside>
      {roomsOpen && <button type="button" className="room-finder-scrim" aria-label="Close project list" onClick={() => setRoomsOpen(false)} />}
      <section className="room-finder-chat" aria-label="Shared project group chat">
        <header className="room-chat-header">
          <div className="room-chat-heading">
            <Button type="button" variant="ghost" size="icon" className="room-chat-mobile-rooms" aria-label="Open project list" aria-expanded={roomsOpen} onClick={() => setRoomsOpen(true)}><FolderIcon aria-hidden="true" /></Button>
            <div className="room-chat-title-copy">
              <p className="room-finder-eyebrow">Stoic Chat</p>
              <h1>{selectedProject?.name || "Choose a project"}</h1>
            </div>
          </div>
          <div className="room-chat-header-actions">
            <div className="room-member-stack" aria-label={`${participants.length + 1} members in this room`}>
              {participants.slice(0, 3).map((agent) => {
                const tint = agentChatColor(agent.id, colorAgentIds);
                return <Avatar key={agent.id} size="sm" className="room-member-avatar"><AvatarFallback style={{ backgroundColor: tint.avatar, borderColor: tint.border, color: tint.accent }}>{agent.name.charAt(0).toUpperCase()}</AvatarFallback></Avatar>;
              })}
              <Avatar size="sm" className="room-member-avatar room-member-owner"><AvatarFallback>Y</AvatarFallback></Avatar>
              {participants.length > 3 && <span className="room-member-overflow">+{participants.length - 3}</span>}
            </div>
            <span className="room-member-count">{participants.length + 1} members</span>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon" aria-label="More room actions" title="More room actions" disabled={!selectedProject}><EllipsisHorizontalIcon aria-hidden="true" /></Button>} />
              <DropdownMenuContent align="end" className="min-w-52">
                {onPlan && <DropdownMenuItem onClick={onPlan}><SparklesIcon aria-hidden="true" />Plan with Stoic</DropdownMenuItem>}
                <DropdownMenuItem disabled={!participants.length || !projects.length} onClick={() => { setDiscussionMode((current) => !current); setReplyTo(null); setPostKind("message"); }}>{discussionMode ? <XMarkIcon aria-hidden="true" /> : <UserGroupIcon aria-hidden="true" />}{discussionMode ? "Cancel focused discussion" : "Start agent discussion"}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => refresh().catch(() => {})}><ArrowPathIcon aria-hidden="true" />Refresh this room</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <ScrollArea className="room-timeline-scroll" aria-label="Messages">
          {visible.length ? <div className="room-timeline" role="log" aria-label={`Messages in ${selectedProject?.name || "project room"}`} aria-live="polite">
            {visible.map(renderMessage)}
            <div ref={endRef} className="h-px" />
          </div> : <UiEmpty className="room-chat-empty border-0 bg-transparent">
            <EmptyHeader>
              <ChatBubbleLeftRightIcon className="room-empty-icon" aria-hidden="true" />
              <EmptyTitle>{selectedProject ? "Your project room is ready" : "Choose a project room"}</EmptyTitle>
              <EmptyDescription>{selectedProject ? "Send a message to start the shared conversation. Connected agents can reply during their next inbox check." : "Select a project from the list to see its shared conversation."}</EmptyDescription>
            </EmptyHeader>
          </UiEmpty>}
        </ScrollArea>
        {discussionMode && <section className="room-discussion-picker" aria-label="Focused discussion participants">
          <div className="room-discussion-picker-header">
            <div><p className="room-finder-eyebrow">Focused discussion</p><strong>Choose the agents to invite</strong></div>
            <Badge variant="secondary">{discussionAgentIds.length}/{AGENT_DIALOGUE_MAX_PARTICIPANTS}</Badge>
          </div>
          {participants.length ? <div className="room-discussion-agents">
            {participants.map((agent) => <label key={agent.id} className="room-discussion-agent">
              <Checkbox checked={discussionAgentIds.includes(agent.id)} disabled={!discussionAgentIds.includes(agent.id) && discussionAgentIds.length >= AGENT_DIALOGUE_MAX_PARTICIPANTS} onCheckedChange={(checked) => setDiscussionAgentIds((current) => checked === true ? current.length < AGENT_DIALOGUE_MAX_PARTICIPANTS ? [...new Set([...current, agent.id])] : current : current.filter((id) => id !== agent.id))} />
              <span>{agent.name}</span>
            </label>)}
          </div> : <p className="room-no-agents">Connect an MCP agent to invite it. Browser relays do not receive Stoic MCP messages.</p>}
          <Alert className="room-discussion-note">
            <AlertTitle>This prompt appears in the shared room</AlertTitle>
            <AlertDescription>Invited agents can reply at their next inbox check. The discussion closes after {AGENT_DIALOGUE_WINDOW_MINUTES} minutes or {AGENT_DIALOGUE_MAX_REPLIES} agent replies.</AlertDescription>
          </Alert>
        </section>}
        <form className="room-composer" onSubmit={(event) => post(event).catch(() => {})}>
          {replyingTo && <div className="room-reply-context">
            <span><strong>Replying to {author(replyingTo)}</strong><span>{replyingTo.body}</span></span>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Cancel reply" onClick={() => setReplyTo(null)}><XMarkIcon aria-hidden="true" /></Button>
          </div>}
          {postKind === "suggestion" && !discussionMode && <div className="room-composer-state"><Badge variant="secondary">Suggestion · owner review</Badge><button type="button" onClick={() => setPostKind("message")}>Switch back to message</button></div>}
          <div className="room-composer-field">
            <Button type="button" variant="ghost" size="icon" className="room-composer-add" aria-label={postKind === "message" ? "Write a suggestion" : "Write a regular message"} title={postKind === "message" ? "Switch to suggestion" : "Switch to message"} onClick={() => setPostKind((current) => current === "message" ? "suggestion" : "message")}><PlusIcon aria-hidden="true" /></Button>
            <Field className="room-composer-input">
              <FieldLabel htmlFor="board-body" className="sr-only">{discussionMode ? "Focused discussion question" : postKind === "suggestion" ? "Project suggestion" : "Project message"}</FieldLabel>
              <Textarea id="board-body" className={control} value={body} onChange={(event) => setBody(event.target.value)} maxLength={discussionMode ? 9000 : 12000} rows={2} placeholder={discussionMode ? "What should the agents reason through together?" : postKind === "suggestion" ? "Share a suggestion for owner review…" : "Message the project group…"} disabled={!selectedProject} required />
            </Field>
            <Button type="submit" size="icon" className="room-composer-send" aria-label={discussionMode ? "Start focused discussion" : postKind === "suggestion" ? "Submit suggestion" : "Send message"} disabled={busy || !body.trim() || !selectedProject || Boolean(replyInfo?.ended) || (discussionMode && !discussionAgentIds.length)}>
              {busy ? <ArrowPathIcon className="animate-spin" aria-hidden="true" /> : <ArrowUpIcon aria-hidden="true" />}
            </Button>
          </div>
          <div className="room-composer-footer">
            <button type="button" onClick={() => setPostKind((current) => current === "message" ? "suggestion" : "message")}>{postKind === "message" ? "Message" : "Suggestion"}</button>
            <span>{replyInfo?.ended ? "This focused discussion is closed." : `${body.length.toLocaleString()} / ${discussionMode ? "9,000" : "12,000"}`}</span>
          </div>
        </form>
      </section>
    </div>
  );
}
