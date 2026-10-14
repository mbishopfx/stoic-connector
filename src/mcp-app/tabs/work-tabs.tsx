"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  Check,
  ChevronDown,
  CircleCheck,
  Clock3,
  Folder,
  MessageSquareText,
  Search,
  RefreshCw,
  Reply,
  Send,
  Sparkles,
  UsersRound,
} from "lucide-react";

import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageGroup,
  MessageHeader,
} from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Bubble, BubbleContent } from "@/components/ui/bubble";

import type { ActivityAnalytics, McpTabProps } from "@/mcp-app/ui-contract";
import { agentChatColor } from "@/lib/agent-chat-color";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ActivityAnalyticsPanel } from "./activity-analytics";

type Handoff = {
  id: string;
  project_id: string;
  title: string;
  goal?: string | null;
  constraints?: string | null;
  status: string;
  assigned_agent_id: string | null;
  created_at?: string;
  updated_at?: string;
};

type HandoffEvent = {
  id?: string;
  actor_key?: string;
  event_type?: string;
  body?: string;
  created_at?: string;
};

type Approval = {
  id?: string;
  action_summary?: string;
  status?: string;
  created_at?: string;
  decided_at?: string | null;
};

type HandoffDetail = {
  handoff?: Handoff & Record<string, unknown>;
  events?: HandoffEvent[];
  approvals?: Approval[];
};

type BoardMessage = {
  id: string;
  project_id?: string;
  parent_id: string | null;
  author_key: string;
  kind: string;
  body: string;
  created_at: string;
};

type CheckRecord = {
  id?: string;
  actor_key?: string;
  details?: { handoffCount?: number; unreadProjectCount?: number };
  created_at?: string;
};

function formatDate(value?: string | null) {
  if (!value) return "No successful check recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "No successful check recorded"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatMessageDay(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Earlier" : date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const variant = ["blocked", "changes_requested", "proposed", "pending"].includes(normalized)
    ? "destructive"
    : ["connected", "submitted", "accepted", "completed", "ready"].includes(normalized)
      ? "default"
      : "secondary";
  return <Badge variant={variant}>{normalized.replaceAll("_", " ")}</Badge>;
}

function PageHeading({
  eyebrow,
  title,
  description,
  context,
  projectId,
  runtime,
  onRefresh,
  onAction,
  actionLabel,
}: McpTabProps & { eyebrow: string; title: string; description: string; onRefresh?: () => void; onAction?: () => void; actionLabel?: string }) {
  return (
    <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">{eyebrow}</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {(context.projects.length > 0 || onRefresh || onAction) && (
        <div className="flex w-full items-end gap-2 sm:w-auto">
          {context.projects.length > 0 && (
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:w-56 sm:flex-none">
              <Label htmlFor="work-project-select" className="text-xs text-muted-foreground">Project</Label>
              <Select items={context.projects.map((project) => ({ value: project.id, label: project.name }))} value={projectId || context.projects[0]?.id || ""} onValueChange={(value) => value && runtime.selectProject(value)}>
                <SelectTrigger id="work-project-select" className="w-full">
                  <SelectValue placeholder="Choose a project" />
                </SelectTrigger>
                <SelectContent>
                  {context.projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {onRefresh && <Button variant="outline" onClick={onRefresh}><RefreshCw />Refresh</Button>}
          {onAction && <Button variant="outline" onClick={onAction}>{actionLabel || "Open"}</Button>}
        </div>
      )}
    </header>
  );
}

function LoadingCards({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Loading workspace data">
      {Array.from({ length: count }, (_, index) => (
        <Card key={index} size="sm">
          <CardHeader>
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/4" />
          </CardHeader>
          <CardContent><Skeleton className="h-8 w-1/3" /></CardContent>
        </Card>
      ))}
    </div>
  );
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertTriangle />
      <AlertTitle>Could not load this view</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-2">
        <span>{message}</span>
        <Button variant="outline" size="sm" onClick={onRetry}><RefreshCw /> Try again</Button>
      </AlertDescription>
    </Alert>
  );
}

function EmptyProject({ title, description }: { title: string; description: string }) {
  return (
    <Empty className="min-h-56 border bg-card">
      <EmptyHeader>
        <EmptyMedia variant="icon"><MessageSquareText /></EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function MetricCard({
  icon: Icon,
  value,
  label,
  detail,
}: {
  icon: typeof UsersRound;
  value: number;
  label: string;
  detail: string;
}) {
  return (
    <Card size="sm" className="min-w-0">
      <CardContent className="flex items-start gap-3 pt-(--card-spacing)">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" /></div>
        <div className="min-w-0">
          <p className="text-2xl leading-none font-semibold tabular-nums">{value}</p>
          <p className="mt-1 text-sm font-medium">{label}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function OverviewTab(props: McpTabProps) {
  const { context, projectId, runtime } = props;
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [checks, setChecks] = useState<CheckRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError("");
    try {
      const [handoffResult, checkResult] = await Promise.all([
        projectId
          ? runtime.callTool<{ handoffs?: Handoff[] }>("list_project_handoffs", { projectId, offset: 0 })
          : Promise.resolve({ handoffs: [] as Handoff[] }),
        runtime.callTool<{ checks?: CheckRecord[] }>("get_team_check_history"),
      ]);
      if (requestId !== requestRef.current) return;
      setHandoffs(handoffResult.handoffs || []);
      setChecks(checkResult.checks || []);
    } catch (cause) {
      if (requestId !== requestRef.current) return;
      setError(cause instanceof Error ? cause.message : "Stoic could not load workspace activity.");
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [projectId, runtime]);

  useEffect(() => { void Promise.resolve().then(load); }, [load, reloadKey]);

  const connected = context.agents.filter((agent) => agent.status === "connected").length;
  const active = handoffs.filter((item) => ["assigned", "claimed", "blocked", "changes_requested"].includes(item.status)).length;
  const submitted = handoffs.filter((item) => item.status === "submitted").length;
  const activeRows = handoffs.filter((item) => ["assigned", "claimed", "blocked", "changes_requested", "submitted"].includes(item.status)).slice(0, 5);
  const projectName = context.projects.find((item) => item.id === projectId)?.name || "Current project";

  const retry = () => {
    void runtime.refreshContext().catch(() => undefined);
    setReloadKey((key) => key + 1);
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:gap-7 sm:p-6 lg:p-8">
      <PageHeading {...props} onRefresh={retry} eyebrow="OVERVIEW" title="Workspace" description="" />
      {loading ? <LoadingCards /> : error ? <LoadError message={error} onRetry={retry} /> : (
        <>
          <section className="grid gap-3 sm:grid-cols-3" aria-label="Workspace summary">
            <MetricCard icon={UsersRound} value={connected} label="Connected agents" detail="" />
            <MetricCard icon={Activity} value={active} label="Active handoffs" detail="" />
            <MetricCard icon={CircleCheck} value={submitted} label="Needs review" detail="" />
          </section>

          <section className="grid min-w-0 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <Card className="min-w-0">
              <CardHeader className="border-b">
                <CardTitle>Handoffs in motion</CardTitle>
                <CardDescription>{projectName}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                {activeRows.length ? activeRows.map((handoff) => (
                  <div key={handoff.id} className="flex min-w-0 flex-col gap-2 rounded-lg border bg-background/60 p-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{handoff.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{context.agents.find((agent) => agent.id === handoff.assigned_agent_id)?.name || "Team queue"} <span aria-hidden="true">·</span> {formatDate(handoff.updated_at)}</p>
                    </div>
                    <StatusBadge status={handoff.status} />
                  </div>
                )) : <EmptyProject title="Nothing in motion" description="New assignments and completed results will appear here." />}
              </CardContent>
            </Card>

            <Card className="min-w-0">
              <CardHeader className="border-b">
                <CardTitle>Agent check-ins</CardTitle>
                <CardDescription>Last successful check-in</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                {context.agents.length ? context.agents.map((agent) => {
                  const latestCheck = checks.find((check) => check.actor_key === `agent:${agent.id}`);
                  return (
                    <div key={agent.id} className="flex min-w-0 items-start gap-3 rounded-lg border bg-background/60 p-3">
                      <Avatar className="size-9"><AvatarFallback className="bg-muted text-sm font-semibold text-muted-foreground">{agent.name.slice(0, 1).toUpperCase()}</AvatarFallback></Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium">{agent.name}{agent.id === context.bossAgentId ? " · Boss" : ""}</p>
                          <StatusBadge status={agent.status} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{agent.harness_name || agent.platform} <span aria-hidden="true">·</span> {agent.schedule_enabled ? `Scheduled every ${agent.schedule_cadence_minutes || "—"} min` : "Schedule paused"}</p>
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="size-3" /> Last check: {formatDate(agent.last_check_at)}</p>
                        {latestCheck?.created_at && <p className="mt-1 text-xs text-muted-foreground">Activity recorded {formatDate(latestCheck.created_at)}</p>}
                      </div>
                    </div>
                  );
                }) : (
                  <div className="rounded-lg border-2 border-dashed p-6 text-center">
                    <p className="text-sm font-medium">No agents connected</p>
                    <p className="mt-1 text-xs text-muted-foreground">Connect agent profiles to start coordinating work.</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => runtime.notify("Open the Agents tab to add a profile.", "success")}>
                      Open Agents
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}

export function AnalyticsTab({ context, runtime }: McpTabProps) {
  const [analytics, setAnalytics] = useState<ActivityAnalytics>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestRef = useRef(0);
  const hasAnalyticsRef = useRef(false);

  const load = useCallback(async (quiet = false) => {
    const requestId = ++requestRef.current;
    if (!quiet || !hasAnalyticsRef.current) setLoading(true);
    if (!quiet) setError("");
    try {
      const result = await runtime.callTool<ActivityAnalytics>("get_team_activity_analytics");
      if (requestId !== requestRef.current) return;
      hasAnalyticsRef.current = true;
      setAnalytics(result);
      setError("");
    } catch (cause) {
      if (requestId !== requestRef.current) return;
      if (!hasAnalyticsRef.current) setError(cause instanceof Error ? cause.message : "Stoic could not load activity analytics.");
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [runtime]);

  useEffect(() => {
    void Promise.resolve().then(() => load());
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    const timer = window.setInterval(refreshWhenVisible, 30_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);
    return () => {
      requestRef.current += 1;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [load]);

  const retry = () => {
    void runtime.refreshContext({ quiet: true, refreshInbox: false }).catch(() => undefined);
    void load();
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:gap-7 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">TEAM ACTIVITY</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Analytics</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">Six-hour agent activity and 30-day trends. The latest workspace data refreshes while this view is open.</p>
        </div>
        <Button variant="outline" onClick={retry}><RefreshCw />Refresh</Button>
      </header>
      {error && !analytics ? <LoadError message={error} onRetry={retry} /> : (
        <ActivityAnalyticsPanel
          analytics={analytics}
          loading={loading}
          workspaceAgentCount={context.agents.filter((agent) => agent.status !== "revoked").length}
        />
      )}
    </div>
  );
}

function HandoffSummary({ handoff, context }: { handoff: Handoff; context: McpTabProps["context"] }) {
  const assigned = context.agents.find((agent) => agent.id === handoff.assigned_agent_id);
  const project = context.projects.find((item) => item.id === handoff.project_id);
  return (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h3 className="break-words text-sm font-medium leading-snug">{handoff.title}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{assigned?.name || "Team queue"} <span aria-hidden="true">·</span> {project?.name || "Project"}</p>
        {handoff.updated_at && <p className="mt-1 text-xs text-muted-foreground">Updated {formatDate(handoff.updated_at)}</p>}
      </div>
      <StatusBadge status={handoff.status} />
    </div>
  );
}

function HandoffCard({
  handoff,
  context,
  runtime,
  onUpdated,
}: {
  handoff: Handoff;
  context: McpTabProps["context"];
  runtime: McpTabProps["runtime"];
  onUpdated: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<HandoffDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [actionBody, setActionBody] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [actionError, setActionError] = useState("");

  const loadDetail = useCallback(async (force = false) => {
    if (detail && !force) return;
    setDetailLoading(true);
    setDetailError("");
    try {
      setDetail(await runtime.callTool<HandoffDetail>("get_handoff", { handoffId: handoff.id }));
    } catch (cause) {
      setDetailError(cause instanceof Error ? cause.message : "Could not read this handoff.");
    } finally {
      setDetailLoading(false);
    }
  }, [detail, handoff.id, runtime]);

  const act = async (tool: string, body: string, success: string, bodyRequired = false) => {
    if (bodyRequired && !body.trim()) {
      setActionError(tool === "request_changes" ? "Explain what needs to change." : "Add a short update first.");
      return;
    }
    setActionError("");
    setBusyAction(tool);
    try {
      await runtime.callTool(tool, { handoffId: handoff.id, body: body.trim(), idempotencyKey: crypto.randomUUID() });
      runtime.notify(success, "success");
      setActionBody("");
      await onUpdated();
      await loadDetail(true);
      await runtime.refreshContext().catch(() => undefined);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Stoic could not complete that action.");
    } finally {
      setBusyAction("");
    }
  };

  const fullHandoff = detail?.handoff || handoff;
  const status = String(fullHandoff.status || handoff.status);
  const assignedToSelf = fullHandoff.assigned_agent_id === context.self.agentId;
  const claimableQueueItem = status === "assigned" && !fullHandoff.assigned_agent_id;
  const isWorker = context.self.role === "worker";
  const canClaim = isWorker && ["assigned", "changes_requested"].includes(status) && (assignedToSelf || claimableQueueItem);
  const canUpdate = isWorker && ["claimed", "blocked", "changes_requested"].includes(status) && assignedToSelf;
  const canReview = context.self.role === "boss" && status === "submitted";
  const events = detail?.events || [];
  const approvals = detail?.approvals || [];

  return (
    <Card size="sm" className="min-w-0">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1"><HandoffSummary handoff={handoff} context={context} /></div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Collapsible
          open={open}
          onOpenChange={(nextOpen) => {
            setOpen(nextOpen);
            if (nextOpen) void loadDetail();
          }}
        >
          <CollapsibleTrigger className="group inline-flex min-h-8 items-center gap-2 rounded-lg px-2 text-sm font-medium text-primary outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
            <span>{open ? "Hide task and timeline" : "View task and timeline"}</span>
            <ChevronDown className="size-4 transition-transform group-data-[open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            {detailLoading && <div className="space-y-2"><Skeleton className="h-4 w-1/4" /><Skeleton className="h-16 w-full" /></div>}
            {detailError && <LoadError message={detailError} onRetry={() => void loadDetail(true)} />}
            {detail && !detailLoading && (
              <div className="space-y-4 border-t pt-4">
                <section className="space-y-2">
                  <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Goal</h4>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{String(fullHandoff.goal || handoff.goal || "No task description was returned.")}</p>
                  {Boolean(fullHandoff.constraints || handoff.constraints) && (
                    <p className="whitespace-pre-wrap rounded-lg bg-muted/60 p-3 text-sm leading-relaxed"><span className="font-medium">Constraints: </span>{String(fullHandoff.constraints || handoff.constraints)}</p>
                  )}
                </section>

                {(events.length > 0 || approvals.length > 0) && (
                  <section className="space-y-3">
                    <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">History</h4>
                    <div className="space-y-2">
                      {events.map((event, index) => (
                        <div key={event.id || `${event.event_type}-${index}`} className="flex gap-3 rounded-lg border p-3">
                          <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><Activity className="size-3.5" /></div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">{(event.event_type || "Update").replaceAll("_", " ")}</p><time className="text-xs text-muted-foreground">{formatDate(event.created_at)}</time></div>
                            {event.body && <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{event.body}</p>}
                          </div>
                        </div>
                      ))}
                      {approvals.map((approval, index) => (
                        <div key={approval.id || `approval-${index}`} className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                          <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">Approval {approval.status || "requested"}</p><time className="text-xs text-muted-foreground">{formatDate(approval.created_at)}</time></div>
                          {approval.action_summary && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{approval.action_summary}</p>}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {isWorker && status === "proposed" && <Alert><Clock3 /><AlertTitle>Waiting for owner review</AlertTitle><AlertDescription>This proposal is waiting for the workspace owner to review it in Stoic.</AlertDescription></Alert>}

                {canClaim && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
                    <p className="text-sm text-muted-foreground">Claim this assignment to take ownership of the work.</p>
                    <Button disabled={Boolean(busyAction)} onClick={() => void act("claim_handoff", "Claimed from the Stoic workspace.", "Handoff claimed.")}>
                      {busyAction === "claim_handoff" ? <RefreshCw className="animate-spin" /> : <Check />} Claim handoff
                    </Button>
                  </div>
                )}

                {(canUpdate || canReview) && (
                  <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
                    <div className="space-y-1.5">
                      <Label htmlFor={`handoff-update-${handoff.id}`}>{canReview ? "Review the submitted result" : "Share a considered update"}</Label>
                      <Textarea
                        id={`handoff-update-${handoff.id}`}
                        value={actionBody}
                        maxLength={20000}
                        onChange={(event) => setActionBody(event.target.value)}
                        placeholder={canReview ? "Optional feedback for the worker…" : "Progress, blocker, or completed result…"}
                        className="min-h-24 resize-y"
                      />
                    </div>
                    {actionError && <Alert variant="destructive"><AlertTriangle /><AlertDescription>{actionError}</AlertDescription></Alert>}
                    <div className="flex flex-wrap gap-2">
                      {canUpdate && <>
                        <Button variant="outline" disabled={Boolean(busyAction)} onClick={() => void act("post_update", actionBody, "Progress added to the handoff.", true)}>{busyAction === "post_update" ? <RefreshCw className="animate-spin" /> : <MessageSquareText />} Post update</Button>
                        <Button variant="outline" disabled={Boolean(busyAction)} onClick={() => void act("mark_blocked", actionBody, "Blocker added to the handoff.", true)}>{busyAction === "mark_blocked" ? <RefreshCw className="animate-spin" /> : <AlertTriangle />} Mark blocked</Button>
                        <Button disabled={Boolean(busyAction)} onClick={() => void act("submit_result", actionBody, "Result sent to the boss for review.", true)}>{busyAction === "submit_result" ? <RefreshCw className="animate-spin" /> : <Check />} Submit result</Button>
                      </>}
                      {canReview && <>
                        <Button disabled={Boolean(busyAction)} onClick={() => void act("accept_result", actionBody, "Result accepted.")}>{busyAction === "accept_result" ? <RefreshCw className="animate-spin" /> : <Check />} Accept result</Button>
                        <Button variant="outline" disabled={Boolean(busyAction)} onClick={() => void act("request_changes", actionBody, "Changes requested.", true)}>{busyAction === "request_changes" ? <RefreshCw className="animate-spin" /> : <ArrowDownRight />} Request changes</Button>
                      </>}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

export function HandoffsTab(props: McpTabProps) {
  const { context, projectId, runtime } = props;
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError("");
    if (!projectId) {
      if (requestId !== requestRef.current) return;
      setHandoffs([]);
      setLoading(false);
      return;
    }
    try {
      const result = await runtime.callTool<{ handoffs?: Handoff[] }>("list_project_handoffs", { projectId, offset: 0 });
      if (requestId !== requestRef.current) return;
      setHandoffs(result.handoffs || []);
    } catch (cause) {
      if (requestId !== requestRef.current) return;
      setError(cause instanceof Error ? cause.message : "Stoic could not load project handoffs.");
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [projectId, runtime]);

  useEffect(() => { void Promise.resolve().then(load); }, [load, reloadKey]);

  const active = handoffs.filter((item) => ["assigned", "claimed", "blocked", "changes_requested"].includes(item.status)).length;
  const needsReview = handoffs.filter((item) => item.status === "submitted").length;
  const retry = () => {
    void runtime.refreshContext().catch(() => undefined);
    setReloadKey((key) => key + 1);
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 sm:gap-7 sm:p-6 lg:p-8">
      <PageHeading {...props} onRefresh={retry} eyebrow="WORK" title="Handoffs" description="" />
      {loading ? <LoadingCards /> : error ? <LoadError message={error} onRetry={retry} /> : !projectId ? (
        <EmptyProject title="Choose a project" description="Select a project above to see its assignments and history." />
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-3" aria-label="Handoff summary">
            <MetricCard icon={Activity} value={active} label="In progress" detail="Assigned, claimed, or blocked" />
            <MetricCard icon={CircleCheck} value={needsReview} label="Needs review" detail="Submitted work from agents" />
            <MetricCard icon={Clock3} value={handoffs.length} label="Total" detail="" />
          </section>
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Project handoffs</CardTitle>
              <CardDescription>{context.projects.find((project) => project.id === projectId)?.name || "Selected project"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              {handoffs.length ? handoffs.map((handoff) => (
                <HandoffCard key={handoff.id} handoff={handoff} context={context} runtime={runtime} onUpdated={load} />
              )) : (
                <EmptyProject title="No handoffs yet" description={context.self.role === "boss" && context.workspace.delegationLevel !== "observe" ? "Create a task from the Chat tab." : "Assigned work will appear here."} />
              )}
            </CardContent>
          </Card>
          <Alert>
            <Clock3 /><AlertTitle>Work arrives on the agent’s next check</AlertTitle>
            <AlertDescription>Stoic does not wake an offline agent.</AlertDescription>
          </Alert>
        </>
      )}
    </div>
  );
}

function authorName(message: BoardMessage, context: McpTabProps["context"]) {
  const agent = context.agents.find((item) => message.author_key === `agent:${item.id}`);
  if (agent) return agent.name;
  return message.author_key.startsWith("user:") ? "You" : "Stoic";
}

function isOwnMessage(message: BoardMessage, context: McpTabProps["context"]) {
  return message.author_key.startsWith("user:") || message.author_key === context.self.agentId;
}

function ChatMessage({
  message,
  context,
  onReply,
  isGrouped,
}: {
  message: BoardMessage;
  context: McpTabProps["context"];
  onReply: (message: BoardMessage) => void;
  isGrouped: boolean;
}) {
  const author = authorName(message, context);
  const own = isOwnMessage(message, context);
  const agentId = message.author_key.startsWith("agent:") ? message.author_key.slice("agent:".length) : null;
  const agentIds = context.agents.filter((item) => item.status !== "revoked").map((item) => item.id);
  const tint = agentId ? agentChatColor(agentId, agentIds) : null;
  const initials = author.slice(0, 1).toUpperCase();

  return (
    <Message align={own ? "end" : "start"} className="mcp-room-message">
      {!own && <MessageAvatar className="mcp-room-message-avatar">
        {isGrouped ? <div className="w-8" /> : (
          <Avatar aria-hidden="true" className="size-8">
            <AvatarFallback
              className="border text-xs font-semibold"
              style={tint ? { backgroundColor: tint.avatar, borderColor: tint.border, color: tint.accent } : undefined}
            >
              {initials}
            </AvatarFallback>
          </Avatar>
        )}
      </MessageAvatar>}
      <MessageContent className="mcp-room-message-content">
        {!isGrouped && (
          <MessageHeader className="mcp-room-message-header">
            <span>{author}</span>
            <time dateTime={message.created_at}>{formatMessageTime(message.created_at)}</time>
          </MessageHeader>
        )}
        <Bubble variant={own ? "default" : "muted"} className="mcp-room-bubble">
          <BubbleContent className="mcp-room-bubble-copy">{message.body}</BubbleContent>
        </Bubble>
        <MessageFooter className="mcp-room-message-footer">
          <Button type="button" variant="ghost" size="icon-xs" className="mcp-room-reply" aria-label={`Reply to ${author}`} title={`Reply to ${author}`} onClick={() => onReply(message)}>
            <Reply aria-hidden="true" />
            <span className="sr-only">Reply to {author}</span>
          </Button>
        </MessageFooter>
      </MessageContent>
    </Message>
  );
}

export function BoardTab(props: McpTabProps & { onPlan?: () => void }) {
  const { context, projectId, runtime } = props;
  const [messages, setMessages] = useState<BoardMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<BoardMessage | null>(null);
  const [posting, setPosting] = useState(false);
  const [roomPickerOpen, setRoomPickerOpen] = useState(false);
  const [roomSearch, setRoomSearch] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError("");
    if (!projectId) {
      if (requestId !== requestRef.current) return;
      setMessages([]);
      setLoading(false);
      return;
    }
    try {
      const result = await runtime.callTool<{ messages?: BoardMessage[] }>("read_project_board", { projectId, offset: 0 });
      if (requestId !== requestRef.current) return;
      setMessages((result.messages || []).slice().sort((left, right) => left.created_at.localeCompare(right.created_at)));
    } catch (cause) {
      if (requestId !== requestRef.current) return;
      setError(cause instanceof Error ? cause.message : "Could not load messages.");
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [projectId, runtime]);

  useEffect(() => { void Promise.resolve().then(load); }, [load, reloadKey]);

  const retry = () => {
    void runtime.refreshContext().catch(() => undefined);
    setReloadKey((key) => key + 1);
  };

  const onReply = (message: BoardMessage) => {
    setReplyTo(message);
    document.getElementById("board-message-composer")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || !projectId || posting) return;
    setPosting(true);
    setError("");
    try {
      await runtime.callTool("post_project_message", {
        projectId,
        ...(replyTo ? { parentId: replyTo.id } : {}),
        body: trimmed,
        idempotencyKey: crypto.randomUUID(),
      });
      setBody("");
      setReplyTo(null);
      runtime.notify("Message posted.", "success");
      await load();
      await runtime.refreshContext().catch(() => undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not post message.");
    } finally {
      setPosting(false);
    }
  };

  const selectedProject = context.projects.find((project) => project.id === projectId);
  const projectName = selectedProject?.name || "";
  const memberCount = context.agents.filter((agent) => agent.status !== "revoked").length + 1;
  const normalizedRoomSearch = roomSearch.trim().toLowerCase();
  const filteredProjects = context.projects.filter((project) => !normalizedRoomSearch || project.name.toLowerCase().includes(normalizedRoomSearch) || project.brief?.toLowerCase().includes(normalizedRoomSearch));

  const groupedMessages = messages.reduce<{ message: BoardMessage; isGrouped: boolean; startsNewDay: boolean }[]>((acc, msg) => {
    const prev = acc[acc.length - 1];
    const messageDate = new Date(msg.created_at);
    const previousDate = prev ? new Date(prev.message.created_at) : null;
    const sameDay = Boolean(previousDate && messageDate.toDateString() === previousDate.toDateString());
    const elapsed = previousDate ? messageDate.getTime() - previousDate.getTime() : Number.POSITIVE_INFINITY;
    const isGrouped = Boolean(prev && prev.message.author_key === msg.author_key && sameDay && elapsed >= 0 && elapsed < 5 * 60_000);
    acc.push({ message: msg, isGrouped, startsNewDay: !sameDay });
    return acc;
  }, []);

  return (
    <div className="mcp-room-chat">
      <header className="mcp-room-header">
        <div className="mcp-room-title-group">
          <Button type="button" variant="ghost" size="icon" className="mcp-room-picker-trigger" aria-label="Browse project conversations" title="Browse project conversations" onClick={() => setRoomPickerOpen(true)}>
            <Folder aria-hidden="true" />
          </Button>
          <div className="min-w-0">
            <p className="mcp-room-eyebrow">Shared room</p>
            <h1 className="mcp-room-title">{projectName || "Choose a project"}</h1>
          </div>
        </div>
        <div className="mcp-room-header-actions">
          {projectId && <span className="mcp-room-member-count" aria-label={`${memberCount} group members`} title={`${memberCount} group members`}><UsersRound aria-hidden="true" /><span>{memberCount}</span></span>}
          <Button type="button" variant="ghost" size="icon" aria-label="Refresh room" title="Refresh room" onClick={retry} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} aria-hidden="true" /></Button>
          {props.onPlan && <Button type="button" variant="ghost" size="icon" aria-label="Plan with Stoic" title="Plan with Stoic" onClick={props.onPlan}><Sparkles aria-hidden="true" /></Button>}
        </div>
      </header>

      {error && <div className="mcp-room-error"><LoadError message={error} onRetry={retry} /></div>}

      {!projectId ? <div className="mcp-room-empty-state"><EmptyProject title="Choose a project room" description="Browse your project conversations to open a shared room." /></div> : <>
        <MessageScrollerProvider autoScroll defaultScrollPosition="end" scrollEdgeThreshold={80}>
          <MessageScroller className="mcp-room-scroller">
            <MessageScrollerViewport role="log" aria-label={`${projectName} group chat`} aria-busy={loading} className="mcp-room-transcript focus-visible:outline-none">
              <MessageScrollerContent className="mcp-room-transcript-content">
                {loading ? (
                  <div className="flex items-center justify-center py-12"><p className="text-sm text-muted-foreground">Loading messages…</p></div>
                ) : !groupedMessages.length ? (
                  <EmptyProject title="Your room is ready" description="Send a message to start the shared conversation." />
                ) : groupedMessages.map(({ message, isGrouped, startsNewDay }, index) => (
                  <MessageScrollerItem key={message.id} messageId={message.id} scrollAnchor={index === groupedMessages.length - 1} className={`mcp-room-scroller-item ${isGrouped ? "is-grouped" : ""}`}>
                    {startsNewDay && <div className="mcp-room-day-divider"><span>{formatMessageDay(message.created_at)}</span></div>}
                    {isGrouped ? <ChatMessage message={message} context={context} onReply={onReply} isGrouped={true} /> : (
                      <MessageGroup className="mcp-room-message-group"><ChatMessage message={message} context={context} onReply={onReply} isGrouped={false} /></MessageGroup>
                    )}
                  </MessageScrollerItem>
                ))}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton direction="end" className="left-1/2" />
          </MessageScroller>
        </MessageScrollerProvider>

        <form id="board-message-composer" className="mcp-room-composer" onSubmit={(event) => void submit(event)}>
          {replyTo && <div className="mcp-room-replying"><span>Replying to <strong>{authorName(replyTo, context)}</strong></span><Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setReplyTo(null)}>Cancel</Button></div>}
          <Label htmlFor="board-message-body" className="sr-only">Message the project group</Label>
          <div className="mcp-room-composer-row">
            <Textarea
              id="board-message-body"
              value={body}
              required
              maxLength={12000}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Message the project group…"
              className="mcp-room-composer-input"
              rows={1}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <Button type="submit" variant="default" size="icon-lg" className="mcp-room-send" aria-label="Send message" title="Send message" disabled={posting || !body.trim()}>
              {posting ? <RefreshCw className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
            </Button>
          </div>
        </form>
      </>}

      <Sheet open={roomPickerOpen} onOpenChange={setRoomPickerOpen}>
        <SheetContent side="left" className="mcp-room-picker">
          <SheetHeader className="mcp-room-picker-header">
            <SheetTitle>Project conversations</SheetTitle>
            <SheetDescription>Switch to a shared room and keep its project context together.</SheetDescription>
          </SheetHeader>
          <label className="mcp-room-search-label">
            <Search aria-hidden="true" />
            <span className="sr-only">Search project conversations</span>
            <input value={roomSearch} onChange={(event) => setRoomSearch(event.target.value)} placeholder="Search projects" />
          </label>
          <div className="mcp-room-picker-list" role="group" aria-label="Project rooms">
            {filteredProjects.length ? filteredProjects.map((project) => {
              const summary = project.brief?.replace(/\s+/g, " ").trim();
              const preview = summary ? `${summary.slice(0, 100)}${summary.length > 100 ? "…" : ""}` : `Shared brief · version ${project.brief_version}`;
              return <button key={project.id} type="button" className="mcp-room-option" aria-current={project.id === projectId ? "true" : undefined} onClick={() => { runtime.selectProject(project.id); setRoomSearch(""); setRoomPickerOpen(false); }}>
                <span className="mcp-room-option-icon"><Folder aria-hidden="true" /></span>
                <span className="mcp-room-option-copy"><span className="mcp-room-option-heading"><strong>{project.name}</strong><small>v{project.brief_version}</small></span><span className="mcp-room-option-preview">{preview}</span></span>
              </button>;
            }) : <p className="mcp-room-picker-empty">{context.projects.length ? "No project rooms match your search." : "No project rooms yet. Create one from Projects to start a shared conversation."}</p>}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
