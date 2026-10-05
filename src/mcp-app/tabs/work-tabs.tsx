"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  Check,
  ChevronDown,
  CircleCheck,
  Clock3,
  MessageSquareText,
  RefreshCw,
  Send,
  UsersRound,
} from "lucide-react";

import type { McpTabProps } from "@/mcp-app/ui-contract";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

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
}: McpTabProps & { eyebrow: string; title: string; description: string; onRefresh?: () => void }) {
  return (
    <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">{eyebrow}</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {(context.projects.length > 0 || onRefresh) && (
        <div className="flex w-full items-end gap-2 sm:w-auto">
          {context.projects.length > 0 && (
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:w-56 sm:flex-none">
              <Label htmlFor="work-project-select" className="text-xs text-muted-foreground">Project</Label>
              <Select value={projectId || context.projects[0]?.id || ""} onValueChange={(value) => value && runtime.selectProject(value)}>
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
      <PageHeading {...props} onRefresh={retry} eyebrow="YOUR COMMAND CENTER" title="Good to see you." description="A clear view of agent check-ins, active assignments, and work that needs your attention." />
      {loading ? <LoadingCards /> : error ? <LoadError message={error} onRetry={retry} /> : (
        <>
          <section className="grid gap-3 sm:grid-cols-3" aria-label="Workspace summary">
            <MetricCard icon={UsersRound} value={connected} label="Connected agents" detail="Ready for their next scheduled check" />
            <MetricCard icon={Activity} value={active} label="Active handoffs" detail="Shared work in progress" />
            <MetricCard icon={CircleCheck} value={submitted} label="Needs your review" detail="Agent results waiting for the boss" />
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
                <CardDescription>A successful inbox check records activity; it does not mean work was completed.</CardDescription>
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
                }) : <EmptyProject title="No connected agents yet" description="Connect a profile from the Agents page to begin coordinating work." />}
              </CardContent>
            </Card>
          </section>

          <Alert className="border-primary/20 bg-primary/5">
            <Clock3 />
            <AlertTitle>Let the team work at its own pace</AlertTitle>
            <AlertDescription>Agents receive handoffs on their next successful scheduled check. Stoic does not wake an offline agent.</AlertDescription>
          </Alert>
        </>
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
      <PageHeading {...props} onRefresh={retry} eyebrow="WORK" title="Handoffs" description="Assignments and results stay together, so the team can pick up the next step without replaying old chats." />
      {loading ? <LoadingCards /> : error ? <LoadError message={error} onRetry={retry} /> : !projectId ? (
        <EmptyProject title="Choose a project" description="Select a project above to see its assignments and history." />
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-3" aria-label="Handoff summary">
            <MetricCard icon={Activity} value={active} label="In progress" detail="Assigned, claimed, or blocked" />
            <MetricCard icon={CircleCheck} value={needsReview} label="Needs review" detail="Submitted work from agents" />
            <MetricCard icon={Clock3} value={handoffs.length} label="Project history" detail="Recent handoffs" />
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
                <EmptyProject title="No handoffs yet" description={context.self.role === "boss" && context.workspace.delegationLevel !== "observe" ? "Create a clear task from Stoic chat when the team is ready." : "Assigned work will appear here when available."} />
              )}
            </CardContent>
          </Card>
          <Alert className="border-primary/20 bg-primary/5">
            <Clock3 /><AlertTitle>Work arrives on the agent’s next check</AlertTitle>
            <AlertDescription>Stoic keeps assignments and review history together. It does not wake an offline agent.</AlertDescription>
          </Alert>
        </>
      )}
    </div>
  );
}

function authorName(message: BoardMessage, context: McpTabProps["context"]) {
  const agent = context.agents.find((item) => message.author_key === `agent:${item.id}`);
  if (agent) return agent.name;
  return message.author_key.startsWith("user:") ? "Workspace owner" : "Stoic Connector";
}

function MessageCard({
  message,
  children,
  depth,
  context,
  onReply,
}: {
  message: BoardMessage;
  children: React.ReactNode;
  depth: number;
  context: McpTabProps["context"];
  onReply: (message: BoardMessage) => void;
}) {
  const author = authorName(message, context);
  return (
    <div className={depth > 0 ? "ml-3 border-l-2 border-primary/15 pl-3 sm:ml-5 sm:pl-4" : ""}>
      <Card size="sm" className="min-w-0">
        <CardHeader className="flex-row items-center gap-3">
          <Avatar aria-hidden="true" className="size-8"><AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{author.slice(0, 1).toUpperCase()}</AvatarFallback></Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><CardTitle className="truncate text-sm">{author}</CardTitle><Badge variant="outline">{message.kind.replaceAll("_", " ")}</Badge></div>
            <time className="text-xs text-muted-foreground">{formatDate(message.created_at)}</time>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.body}</p>
          <Button variant="ghost" size="sm" onClick={() => onReply(message)}><ArrowDownRight /> Reply</Button>
        </CardContent>
      </Card>
      {children}
    </div>
  );
}

export function BoardTab(props: McpTabProps) {
  const { context, projectId, runtime } = props;
  const [messages, setMessages] = useState<BoardMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<BoardMessage | null>(null);
  const [posting, setPosting] = useState(false);
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
      setError(cause instanceof Error ? cause.message : "Stoic could not load the project board.");
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [projectId, runtime]);

  useEffect(() => { void Promise.resolve().then(load); }, [load, reloadKey]);

  const messageTree = useMemo(() => {
    const ids = new Set(messages.map((message) => message.id));
    const childrenByParent = new Map<string, BoardMessage[]>();
    for (const message of messages) {
      if (message.parent_id && ids.has(message.parent_id)) {
        const children = childrenByParent.get(message.parent_id) || [];
        children.push(message);
        childrenByParent.set(message.parent_id, children);
      }
    }
    return {
      roots: messages.filter((message) => !message.parent_id || !ids.has(message.parent_id)),
      childrenByParent,
    };
  }, [messages]);

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
      runtime.notify("Your message is on the project board.", "success");
      await load();
      await runtime.refreshContext().catch(() => undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not post the project message.");
    } finally {
      setPosting(false);
    }
  };

  const renderMessage = (message: BoardMessage, depth = 0): React.ReactNode => {
    const replies = messageTree.childrenByParent.get(message.id) || [];
    return (
      <MessageCard key={message.id} message={message} depth={depth} context={context} onReply={onReply}>
        {replies.length > 0 && <div className="mt-3 space-y-3">{replies.map((reply) => renderMessage(reply, depth + 1))}</div>}
      </MessageCard>
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 sm:gap-7 sm:p-6 lg:p-8">
      <PageHeading {...props} eyebrow="WORK" title="Message board" description="Project updates, questions, and run reports live in one shared conversation." />
      {!projectId ? <EmptyProject title="Create a project first" description="The project board becomes available after you add a workspace project." /> : (
        <>
          <Alert className="border-amber-500/25 bg-amber-500/5">
            <AlertTriangle /><AlertTitle>Shared project context</AlertTitle>
            <AlertDescription>Messages are visible to connected agents and are context, not approved decisions. Confirm authoritative decisions in the project brief.</AlertDescription>
          </Alert>
          <Card id="board-message-composer">
            <CardHeader className="border-b">
              <CardTitle>{context.projects.find((project) => project.id === projectId)?.name || "Project conversation"}</CardTitle>
              <CardDescription>Share a question, answer, or project update with the team.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <form className="space-y-3" onSubmit={(event) => void submit(event)}>
                {replyTo && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2">
                    <p className="min-w-0 text-xs text-muted-foreground">Replying to <span className="font-medium text-foreground">{authorName(replyTo, context)}</span>: <span className="inline-block max-w-56 truncate align-bottom">{replyTo.body}</span></p>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setReplyTo(null)}>Cancel reply</Button>
                  </div>
                )}
                <Label className="sr-only" htmlFor="board-message-body">Project message</Label>
                <Textarea
                  id="board-message-body"
                  value={body}
                  required
                  maxLength={12000}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="Share a question, answer, or project update…"
                  className="min-h-24 resize-y"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{body.length.toLocaleString()} / 12,000 characters</span>
                  <Button type="submit" disabled={posting || !body.trim()}>{posting ? <RefreshCw className="animate-spin" /> : <Send />} Post message</Button>
                </div>
              </form>
            </CardContent>
          </Card>
          {error && <LoadError message={error} onRetry={retry} />}
          {loading ? <LoadingCards count={2} /> : (
            <section className="space-y-3" aria-label="Project conversation">
              <div className="flex items-center justify-between gap-3">
                <div><h2 className="text-lg font-semibold tracking-tight">Recent conversation</h2><p className="text-sm text-muted-foreground">{messages.length} {messages.length === 1 ? "message" : "messages"} in the latest page</p></div>
                <Button variant="outline" size="sm" onClick={retry}><RefreshCw /> Refresh</Button>
              </div>
              {messageTree.roots.length ? <div className="space-y-3">{messageTree.roots.map((message) => renderMessage(message))}</div> : <EmptyProject title="No project conversation yet" description="A concise update here gives every connected agent the same context." />}
            </section>
          )}
        </>
      )}
    </div>
  );
}
