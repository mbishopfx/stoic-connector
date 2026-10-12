"use client";

import * as React from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Bot,
  Check,
  Clock3,
  FileText,
  FolderKanban,
  FolderPlus,
  Info,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { AgentInstallation } from "@/components/agent-installation";
import type { Agent, McpTabProps, Project } from "../ui-contract";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../../components/ui/empty";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { ScrollArea } from "../../components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Textarea } from "../../components/ui/textarea";

type ToolError = { error?: string };
type BriefResult = { brief?: string; brief_version?: number; name?: string } & ToolError;
type KnowledgeSummary = {
  id: string;
  title: string;
  path: string;
  kind: string;
  status: string;
  confidence?: string;
  updated_at?: string;
  source_agent?: string;
  source_user?: string;
  source_handoff?: string;
  evidence?: string[];
  stale?: boolean;
};
type KnowledgePage = { notes?: KnowledgeSummary[]; nextOffset?: number | null } & ToolError;
type KnowledgeRead = { note?: KnowledgeSummary & { body?: string; markdown?: string }; error?: string };
type EvidenceResult = { evidence?: unknown[]; guidance?: string; error?: string };
type Artifact = { id: string; name: string; mime_type: string; size_bytes: number; created_at: string };
type ArtifactPage = { artifacts?: Artifact[]; nextOffset?: number | null } & ToolError;
type ArtifactDownload = { downloadUrl?: string; expiresInSeconds?: number; error?: string };

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function dateLabel(value?: string | null) {
  if (!value) return "No successful check recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function fileSize(value: number) {
  if (!Number.isFinite(value) || value < 0) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function statusVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  if (status === "connected" || status === "current") return "default";
  if (["revoked", "conflicted", "archived"].includes(status)) return "destructive";
  if (["stale", "superseded", "browser_relay_only"].includes(status)) return "secondary";
  return "outline";
}

function InlineError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <Alert variant="destructive">
      <Info />
      <AlertTitle>Could not complete that request</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function EmptyPanel({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <Empty className="min-h-52 rounded-xl border border-dashed bg-muted/20">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function ProjectCard({
  project,
  agents,
  selected,
  isBoss,
  bossAgentId,
  onSelect,
  onRoute,
}: {
  project: Project;
  agents: Agent[];
  selected: boolean;
  isBoss: boolean;
  bossAgentId: string | null;
  onSelect: () => void;
  onRoute: (agentId: string | null) => Promise<void>;
}) {
  const [routingBusy, setRoutingBusy] = React.useState(false);
  const [routeError, setRouteError] = React.useState("");
  const defaultAgent = agents.find((agent) => agent.id === project.default_agent_id);
  const workers = agents.filter((agent) => agent.status === "connected" && agent.platform !== "muse" && agent.id !== bossAgentId);

  async function updateRoute(value: string | null) {
    setRoutingBusy(true);
    setRouteError("");
    try {
      await onRoute(value && value !== "none" ? value : null);
    } catch (error) {
      setRouteError(errorMessage(error, "Could not update the default worker."));
    } finally {
      setRoutingBusy(false);
    }
  }

  return (
    <Card size="sm" className={selected ? "border-primary/40 bg-primary/[0.03]" : undefined}>
      <CardHeader>
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <FolderKanban className="size-4" />
          </div>
          <div className="min-w-0 space-y-1">
            <CardTitle className="truncate">{project.name}</CardTitle>
            <CardDescription>{defaultAgent ? `Default worker · ${defaultAgent.name}` : "No default worker selected"}</CardDescription>
          </div>
        </div>
        <CardAction>
          <Badge variant={selected ? "default" : "outline"}>Brief v{project.brief_version}</Badge>
        </CardAction>
      </CardHeader>
      {isBoss && (
        <CardContent className="space-y-2">
          <Label htmlFor={`project-route-${project.id}`} className="text-xs text-muted-foreground">Default worker</Label>
          <Select
            value={project.default_agent_id ?? "none"}
            onValueChange={(value) => void updateRoute(value)}
            disabled={routingBusy}
          >
            <SelectTrigger id={`project-route-${project.id}`} className="w-full" aria-label={`Default worker for ${project.name}`}>
              <SelectValue placeholder="Choose a connected worker" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No default worker</SelectItem>
              {workers.map((agent) => <SelectItem key={agent.id} value={agent.id}>{agent.name} · {agent.harness_name || agent.platform}</SelectItem>)}
            </SelectContent>
          </Select>
          {routeError && <p className="text-xs text-destructive">{routeError}</p>}
        </CardContent>
      )}
      <CardFooter className="justify-between gap-3">
        <span className="text-xs text-muted-foreground">{selected ? "Currently open" : "Shared team space"}</span>
        <Button variant={selected ? "secondary" : "outline"} size="sm" onClick={onSelect} aria-pressed={selected}>
          {selected ? <><Check data-icon="inline-start" /> Open</> : <>Open project <ArrowRight data-icon="inline-end" /></>}
        </Button>
      </CardFooter>
    </Card>
  );
}

export function ProjectsTab({ context, projectId, runtime }: McpTabProps) {
  const isBoss = context.self.role === "boss";
  const currentProject = context.projects.find((project) => project.id === projectId);
  const [name, setName] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState("");
  const [briefState, setBriefState] = React.useState<{ projectId: string; draft: string; version: number; loading: boolean; error: string }>({ projectId: "", draft: "", version: 1, loading: false, error: "" });
  const currentBrief = briefState.projectId === projectId ? briefState : null;
  const brief = currentBrief?.draft || "";
  const briefVersion = currentBrief?.version ?? currentProject?.brief_version ?? 1;
  const briefLoading = Boolean(projectId && (!currentBrief || currentBrief.loading));
  const briefError = currentBrief?.error || "";
  const [briefSaving, setBriefSaving] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    if (!projectId) return () => { active = false; };
    void runtime.callTool<BriefResult>("get_project_brief", { projectId })
      .then((result) => {
        if (!active) return;
        setBriefState({ projectId, draft: result.brief || "", version: result.brief_version || currentProject?.brief_version || 1, loading: false, error: "" });
      })
      .catch((error: unknown) => {
        if (active) setBriefState({ projectId, draft: "", version: currentProject?.brief_version || 1, loading: false, error: errorMessage(error, "Could not load the shared brief.") });
      });
    return () => { active = false; };
  }, [projectId, runtime, currentProject?.brief_version]);

  async function createProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const projectName = name.trim();
    if (projectName.length < 2) return;
    setCreating(true);
    setCreateError("");
    try {
      await runtime.callTool("create_project", { name: projectName, idempotencyKey: crypto.randomUUID() });
      setName("");
      await runtime.refreshContext();
      runtime.notify("Project created.", "success");
    } catch (error) {
      setCreateError(errorMessage(error, "Could not create the project."));
    } finally {
      setCreating(false);
    }
  }

  async function routeProject(project: Project, defaultAgentId: string | null) {
    await runtime.callTool("set_project_routing", { projectId: project.id, defaultAgentId });
    await runtime.refreshContext();
    runtime.notify("Default worker updated.", "success");
  }

  async function saveBrief() {
    if (!currentProject) return;
    setBriefSaving(true);
    setBriefState((current) => ({ ...current, projectId: currentProject.id, error: "" }));
    try {
      const result = await runtime.callTool<BriefResult>("update_project_brief", {
        projectId: currentProject.id,
        brief,
        expectedVersion: briefVersion,
      });
      setBriefState({ projectId: currentProject.id, draft: brief, version: result.brief_version || briefVersion + 1, loading: false, error: "" });
      await runtime.refreshContext();
      runtime.notify("Shared project brief updated.", "success");
    } catch (error) {
      setBriefState((current) => ({ ...current, projectId: currentProject.id, error: errorMessage(error, "Could not save the shared brief.") }));
    } finally {
      setBriefSaving(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 sm:gap-6 sm:p-6">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Workspace</p>
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">Each project keeps briefs, conversations, handoffs, and files together.</p>
      </header>

      {isBoss && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><FolderPlus className="size-4" /></div>
              <div><CardTitle>Start a project</CardTitle><CardDescription>Create a focused shared space for one outcome or ongoing effort.</CardDescription></div>
            </div>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => void createProject(event)}>
              <div className="min-w-0 flex-1">
                <Label htmlFor="new-project-name" className="sr-only">Project name</Label>
                <Input id="new-project-name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={100} placeholder="e.g. Product launch" required />
              </div>
              <Button type="submit" disabled={creating || name.trim().length < 2}>
                {creating ? <><LoaderCircle className="animate-spin" data-icon="inline-start" /> Creating…</> : <><FolderPlus data-icon="inline-start" /> Create project</>}
              </Button>
            </form>
            {createError && <div className="mt-3"><InlineError message={createError} /></div>}
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div><h2 className="text-base font-semibold">Your projects</h2><p className="text-sm text-muted-foreground">{context.projects.length} shared {context.projects.length === 1 ? "space" : "spaces"}</p></div>
          {currentProject && <Badge variant="secondary">Active · {currentProject.name}</Badge>}
        </div>
        {context.projects.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {context.projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                agents={context.agents}
                bossAgentId={context.bossAgentId}
                selected={project.id === projectId}
                isBoss={isBoss}
                onSelect={() => runtime.selectProject(project.id)}
                onRoute={(defaultAgentId) => routeProject(project, defaultAgentId)}
              />
            ))}
          </div>
        ) : (
          <EmptyPanel icon={<FolderKanban />} title="No projects yet" description={isBoss ? "Create a project to give the team one reliable place for decisions and work." : "A project will appear here when the workspace owner creates one."} />
        )}
      </section>

      {currentProject && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground"><BookOpen className="size-4" /></div>
              <div><CardTitle>Shared project brief</CardTitle><CardDescription>{currentProject.name} · Brief version {briefVersion}</CardDescription></div>
            </div>
            <CardAction><Badge variant="outline">{isBoss ? "Owner maintained" : "Read only"}</Badge></CardAction>
          </CardHeader>
          <CardContent className="space-y-3">
            {briefLoading ? <Skeleton className="h-40 w-full" /> : briefError ? <InlineError message={briefError} /> : isBoss ? (
              <>
                <Label htmlFor="project-brief" className="sr-only">Shared project brief</Label>
                <Textarea id="project-brief" value={brief} onChange={(event) => setBriefState((current) => ({ ...current, projectId: currentProject.id, draft: event.target.value, error: "" }))} maxLength={20000} rows={7} placeholder="Record current decisions, constraints, and what success looks like." />
                <p className="text-xs text-muted-foreground">Keep authoritative decisions and constraints here. Board messages and suggestions are context.</p>
              </>
            ) : (
              <ScrollArea className="max-h-72 rounded-lg border bg-muted/20 p-4">
                <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-foreground">{brief || "No shared brief yet."}</pre>
              </ScrollArea>
            )}
          </CardContent>
          {isBoss && <CardFooter className="justify-between gap-3"><span className="text-xs text-muted-foreground">Changes use version checks to protect concurrent edits.</span><Button onClick={() => void saveBrief()} disabled={briefLoading || briefSaving || Boolean(briefError)}>{briefSaving ? <><LoaderCircle className="animate-spin" data-icon="inline-start" /> Saving…</> : "Save brief"}</Button></CardFooter>}
        </Card>
      )}
    </div>
  );
}

export function AgentsTab({ context, runtime }: McpTabProps) {
  const connected = context.agents.filter((agent) => agent.status === "connected").length;
  const scheduled = context.agents.filter((agent) => agent.schedule_enabled).length;
  const [refreshing, setRefreshing] = React.useState(false);

  async function refresh() {
    setRefreshing(true);
    try { await runtime.refreshContext(); } finally { setRefreshing(false); }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 sm:gap-6 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1"><p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Team</p><h1 className="text-2xl font-semibold tracking-tight">Agents</h1><p className="max-w-2xl text-sm text-muted-foreground">Connected profiles and scheduled check-ins.</p></div>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={refreshing}>{refreshing ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />} Refresh roster</Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card size="sm"><CardContent className="flex items-center gap-3 pt-(--card-spacing)"><div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><Users className="size-4" /></div><div><p className="text-xl font-semibold">{connected}</p><p className="text-xs text-muted-foreground">Connected profiles</p></div></CardContent></Card>
        <Card size="sm"><CardContent className="flex items-center gap-3 pt-(--card-spacing)"><div className="flex size-9 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400"><Clock3 className="size-4" /></div><div><p className="text-xl font-semibold">{scheduled}</p><p className="text-xs text-muted-foreground">Scheduled check-ins</p></div></CardContent></Card>
        <Card size="sm"><CardContent className="flex items-center gap-3 pt-(--card-spacing)"><div className="flex size-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400"><ShieldCheck className="size-4" /></div><div><p className="text-xl font-semibold">{context.self.role === "boss" ? "Owner" : "Worker"}</p><p className="text-xs text-muted-foreground">This profile’s role</p></div></CardContent></Card>
      </div>

      {context.agents.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {context.agents.map((agent) => {
            const isBoss = agent.id === context.bossAgentId;
            const isSelf = agent.id === context.self.agentId;
            return (
              <Card key={agent.id}>
                <CardHeader>
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar><AvatarFallback>{agent.name.trim().slice(0, 2).toUpperCase() || <Bot className="size-4" />}</AvatarFallback></Avatar>
                    <div className="min-w-0 space-y-1"><CardTitle className="truncate">{agent.name}</CardTitle><CardDescription className="truncate">{agent.harness_name || agent.platform}</CardDescription></div>
                  </div>
                  <CardAction className="flex flex-wrap justify-end gap-1.5">
                    <Badge variant={statusVariant(agent.status)}>{agent.status.replaceAll("_", " ")}</Badge>
                    {isBoss && <Badge variant="secondary">Boss</Badge>}
                    {isSelf && <Badge variant="outline">This profile</Badge>}
                  </CardAction>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs font-medium text-muted-foreground">Inbox schedule</p><p className="mt-1 text-sm">{agent.schedule_enabled ? `Every ${agent.schedule_cadence_minutes || "scheduled"} minutes` : "Paused"}</p></div>
                  <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs font-medium text-muted-foreground">Last successful check</p><p className="mt-1 text-sm">{dateLabel(agent.last_check_at)}</p></div>
                  {agent.access_notes && <div className="sm:col-span-2"><p className="text-xs font-medium text-muted-foreground">Owner notes</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{agent.access_notes}</p></div>}
                </CardContent>
                <CardFooter className="gap-2 text-xs text-muted-foreground"><Info className="size-3.5" /> Stoic does not wake offline agents; each checks for work on its own schedule.</CardFooter>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="space-y-5">
          <EmptyPanel icon={<Bot />} title="No agent profiles connected" description="Generate a setup prompt to connect an agent host to this workspace." />
          <AgentInstallation endpoint="https://stoic.bishoptech.dev/api/mcp" />
        </div>
      )}
    </div>
  );
}

export function KnowledgeTab({ context, projectId, runtime }: McpTabProps) {
  const project = context.projects.find((item) => item.id === projectId);
  const [searchText, setSearchText] = React.useState("");
  const [query, setQuery] = React.useState("");
  const pageKey = `${projectId}:${query}`;
  const [pageState, setPageState] = React.useState<{ key: string; notes: KnowledgeSummary[]; nextOffset: number | null; loading: boolean; error: string }>({ key: "", notes: [], nextOffset: null, loading: false, error: "" });
  const currentPage = pageState.key === pageKey ? pageState : null;
  const notes = currentPage?.notes || [];
  const nextOffset = currentPage?.nextOffset ?? null;
  const loading = Boolean(projectId && (!currentPage || currentPage.loading));
  const error = currentPage?.error || "";
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [selectedState, setSelectedState] = React.useState<{ key: string; note: (KnowledgeSummary & { body?: string; markdown?: string }) | null }>({ key: "", note: null });
  const selected = selectedState.key === pageKey ? selectedState.note : null;
  const [readingId, setReadingId] = React.useState("");
  const [evidenceState, setEvidenceState] = React.useState<{ key: string; items: unknown[] | null; error: string }>({ key: "", items: null, error: "" });
  const evidenceKey = `${pageKey}:${selected?.id || ""}`;
  const evidence = evidenceState.key === evidenceKey ? evidenceState.items : null;
  const evidenceError = evidenceState.key === evidenceKey ? evidenceState.error : "";
  const [loadingEvidence, setLoadingEvidence] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    if (!projectId) return () => { active = false; };
    const toolName = query ? "search_project_knowledge" : "list_project_knowledge";
    const args = query ? { projectId, query, offset: 0 } : { projectId, offset: 0 };
    void runtime.callTool<KnowledgePage>(toolName, args)
      .then((result) => {
        if (!active) return;
        setPageState({ key: pageKey, notes: result.notes || [], nextOffset: result.nextOffset ?? null, loading: false, error: "" });
      })
      .catch((reason: unknown) => { if (active) setPageState({ key: pageKey, notes: [], nextOffset: null, loading: false, error: errorMessage(reason, "Could not load project knowledge.") }); });
    return () => { active = false; };
  }, [projectId, query, runtime, pageKey]);

  React.useEffect(() => {
    if (!projectId) return;
    let active = true;
    const refreshWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      const toolName = query ? "search_project_knowledge" : "list_project_knowledge";
      const args = query ? { projectId, query, offset: 0 } : { projectId, offset: 0 };
      void runtime.callTool<KnowledgePage>(toolName, args).then((result) => {
        if (!active) return;
        setPageState((current) => {
          if (current.key !== pageKey) return current;
          const merged = new Map((result.notes || []).map((note) => [note.id, note]));
          for (const note of current.notes) if (!merged.has(note.id)) merged.set(note.id, note);
          return { ...current, notes: [...merged.values()], nextOffset: result.nextOffset ?? current.nextOffset, error: "" };
        });
      }).catch((reason: unknown) => {
        if (active) setPageState((current) => current.key === pageKey && !current.notes.length
          ? { ...current, error: errorMessage(reason, "Could not refresh project knowledge.") }
          : current);
      });
    };
    const timer = window.setInterval(refreshWhenVisible, 60_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [projectId, query, runtime, pageKey]);

  async function readNote(noteId: string) {
    if (!projectId) return;
    setReadingId(noteId);
    setEvidenceState({ key: `${pageKey}:${noteId}`, items: null, error: "" });
    try {
      const result = await runtime.callTool<KnowledgeRead>("read_knowledge_note", { projectId, noteId });
      setSelectedState({ key: pageKey, note: result.note || null });
    } catch (reason) {
      setPageState((current) => current.key === pageKey ? { ...current, error: errorMessage(reason, "Could not read that knowledge note.") } : current);
    } finally { setReadingId(""); }
  }

  async function loadMore() {
    if (!projectId || nextOffset === null) return;
    setLoadingMore(true);
    try {
      const toolName = query ? "search_project_knowledge" : "list_project_knowledge";
      const args = query ? { projectId, query, offset: nextOffset } : { projectId, offset: nextOffset };
      const result = await runtime.callTool<KnowledgePage>(toolName, args);
      setPageState((current) => current.key === pageKey ? { ...current, notes: [...current.notes, ...(result.notes || [])], nextOffset: result.nextOffset ?? null } : current);
    } catch (reason) {
      setPageState((current) => current.key === pageKey ? { ...current, error: errorMessage(reason, "Could not load more notes.") } : current);
    } finally { setLoadingMore(false); }
  }

  async function resolveEvidence() {
    if (!projectId || !selected) return;
    setLoadingEvidence(true);
    const key = `${pageKey}:${selected.id}`;
    try {
      const result = await runtime.callTool<EvidenceResult>("get_knowledge_evidence", { projectId, noteId: selected.id });
      setEvidenceState({ key, items: result.evidence || [], error: "" });
    } catch (reason) {
      setEvidenceState({ key, items: null, error: errorMessage(reason, "Could not resolve this note’s evidence.") });
    } finally { setLoadingEvidence(false); }
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(searchText.trim().slice(0, 120));
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 sm:gap-6 sm:p-6">
      <header className="space-y-1"><p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Team</p><h1 className="text-2xl font-semibold tracking-tight">Knowledge</h1><p className="max-w-2xl text-sm text-muted-foreground">Project notes with source provenance.</p></header>

      {!projectId ? <EmptyPanel icon={<BookOpen />} title="Choose a project first" description="Project knowledge is scoped to a shared workspace project." /> : (
        <>
          <Alert>
            <Info />
            <AlertTitle>Nightly agent diary · 11:30 PM</AlertTitle>
            <AlertDescription>Agents can save one short, attributed entry per project and local date. Diaries are self-reported context for future ideas; the host must run its own schedule and Stoic does not wake offline agents.</AlertDescription>
          </Alert>
          <Card>
            <CardHeader>
              <div><CardTitle>Project knowledge</CardTitle><CardDescription>{project?.name || "Current project"} · Search validated note titles and content</CardDescription></div>
              <CardAction><Badge variant="outline">{notes.length}{nextOffset !== null ? "+" : ""} notes</Badge></CardAction>
            </CardHeader>
            <CardContent>
              <form onSubmit={submitSearch} className="flex flex-col gap-2 sm:flex-row">
                <div className="relative min-w-0 flex-1"><Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" /><Label htmlFor="knowledge-search" className="sr-only">Search project knowledge</Label><Input id="knowledge-search" className="pl-9" value={searchText} maxLength={120} onChange={(event) => setSearchText(event.target.value)} placeholder="Search project knowledge" /></div>
                <Button type="submit" disabled={loading}><Search data-icon="inline-start" /> Search</Button>
                {query && <Button type="button" variant="outline" onClick={() => { setSearchText(""); setQuery(""); }}>Clear</Button>}
              </form>
            </CardContent>
          </Card>

          <InlineError message={error} />
          {loading ? (
            <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"><Skeleton className="h-96" /><Skeleton className="h-96" /></div>
          ) : notes.length ? (
            <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <Card className="min-w-0">
                <CardHeader><div><CardTitle>Notes</CardTitle><CardDescription>{query ? `Matches for “${query}”` : "Most recently updated first"}</CardDescription></div></CardHeader>
                <CardContent className="space-y-2">
                  <ScrollArea className="max-h-[31rem] pr-3">
                    <div className="space-y-2">
                      {notes.map((note) => (
                        <Card size="sm" key={note.id} className={selected?.id === note.id ? "border-primary/40 bg-primary/[0.03]" : undefined}>
                          <CardContent className="space-y-2 pt-(--card-spacing)">
                            <div className="flex min-w-0 items-start justify-between gap-2"><h3 className="min-w-0 font-medium leading-5">{note.title || "Untitled note"}</h3><Badge variant={statusVariant(note.status)}>{note.status}</Badge></div>
                            <p className="break-all text-xs text-muted-foreground">{note.kind.replaceAll("_", " ")} · {note.path}</p>
                            <div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">Updated {dateLabel(note.updated_at)}</span><Button size="xs" variant={selected?.id === note.id ? "secondary" : "outline"} onClick={() => void readNote(note.id)} disabled={Boolean(readingId)}>{readingId === note.id ? <LoaderCircle className="animate-spin" /> : "Read note"}</Button></div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                  {nextOffset !== null && <Button variant="outline" className="w-full" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? <><LoaderCircle className="animate-spin" data-icon="inline-start" /> Loading…</> : "Load more notes"}</Button>}
                </CardContent>
              </Card>

              {selected ? (
                <Card className="min-w-0">
                  <CardHeader>
                    <div className="flex min-w-0 items-start gap-3"><div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><FileText className="size-4" /></div><div className="min-w-0"><CardTitle className="break-words">{selected.title}</CardTitle><CardDescription className="break-all">{selected.path}</CardDescription></div></div>
                    <CardAction><Badge variant={statusVariant(selected.status)}>{selected.status}</Badge></CardAction>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-1.5"><Badge variant="outline">{selected.kind}</Badge>{selected.confidence && <Badge variant="secondary">{selected.confidence} confidence</Badge>}{selected.stale && <Badge variant="destructive">Stale</Badge>}</div>
                    <ScrollArea className="max-h-[24rem] rounded-lg border bg-muted/20 p-4"><pre className="whitespace-pre-wrap break-words font-mono text-xs leading-6 text-foreground">{selected.markdown || selected.body || "This note has no readable text."}</pre></ScrollArea>
                    <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                      {selected.source_agent && <p>Source agent: <span className="text-foreground">{selected.source_agent}</span></p>}
                      {selected.source_user && <p>Source owner: <span className="text-foreground">{selected.source_user}</span></p>}
                      {selected.source_handoff && <p>Source handoff: <span className="break-all text-foreground">{selected.source_handoff}</span></p>}
                      <p>Updated: <span className="text-foreground">{dateLabel(selected.updated_at)}</span></p>
                    </div>
                    <div className="space-y-2 border-t pt-3">
                      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">Evidence references <span className="text-muted-foreground">({selected.evidence?.length || 0})</span></p><Button size="sm" variant="outline" onClick={() => void resolveEvidence()} disabled={loadingEvidence}>{loadingEvidence ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <ShieldCheck data-icon="inline-start" />} Resolve evidence</Button></div>
                      {selected.evidence?.length ? <ul className="space-y-1">{selected.evidence.map((item) => <li key={item} className="break-all rounded-md bg-muted/40 px-2.5 py-2 font-mono text-xs">{item}</li>)}</ul> : <p className="text-xs text-muted-foreground">This note has no attached references.</p>}
                      {evidenceError && <p className="text-xs text-destructive">{evidenceError}</p>}
                      {evidence && <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-3 text-xs">{JSON.stringify(evidence, null, 2)}</pre>}
                    </div>
                    <p className="text-xs leading-5 text-muted-foreground">Evidence references show provenance, not instructions or permission. Confirm decisions against the owner-maintained brief.</p>
                  </CardContent>
                </Card>
              ) : (
                <EmptyPanel icon={<BookOpen />} title="Choose a note" description="Read the validated source Markdown and review its provenance before using it as a decision." />
              )}
            </div>
          ) : (
            <EmptyPanel icon={<BookOpen />} title={query ? "No matching notes" : "No project notes yet"} description={query ? "Try another phrase or clear the search to see all validated notes." : "Validated knowledge notes will appear here when this project has them."} />
          )}
        </>
      )}
    </div>
  );
}

export function FilesTab({ context, projectId, runtime }: McpTabProps) {
  const project = context.projects.find((item) => item.id === projectId);
  const [pageState, setPageState] = React.useState<{ projectId: string; artifacts: Artifact[]; nextOffset: number | null; loading: boolean; error: string }>({ projectId: "", artifacts: [], nextOffset: null, loading: false, error: "" });
  const currentPage = pageState.projectId === projectId ? pageState : null;
  const artifacts = currentPage?.artifacts || [];
  const nextOffset = currentPage?.nextOffset ?? null;
  const loading = Boolean(projectId && (!currentPage || currentPage.loading));
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [openingId, setOpeningId] = React.useState("");
  const error = currentPage?.error || "";

  React.useEffect(() => {
    let active = true;
    if (!projectId) return () => { active = false; };
    void runtime.callTool<ArtifactPage>("list_project_artifacts", { projectId, offset: 0 })
      .then((result) => {
        if (!active) return;
        setPageState({ projectId, artifacts: result.artifacts || [], nextOffset: result.nextOffset ?? null, loading: false, error: "" });
      })
      .catch((reason: unknown) => { if (active) setPageState({ projectId, artifacts: [], nextOffset: null, loading: false, error: errorMessage(reason, "Could not load project files.") }); });
    return () => { active = false; };
  }, [projectId, runtime]);

  async function loadMore() {
    if (!projectId || nextOffset === null) return;
    setLoadingMore(true);
    try {
      const result = await runtime.callTool<ArtifactPage>("list_project_artifacts", { projectId, offset: nextOffset });
      setPageState((current) => current.projectId === projectId ? { ...current, artifacts: [...current.artifacts, ...(result.artifacts || [])], nextOffset: result.nextOffset ?? null, error: "" } : current);
    } catch (reason) {
      setPageState((current) => current.projectId === projectId ? { ...current, error: errorMessage(reason, "Could not load more files.") } : current);
    } finally { setLoadingMore(false); }
  }

  async function openArtifact(artifactId: string) {
    setOpeningId(artifactId);
    try {
      const file = await runtime.callTool<ArtifactDownload>("get_artifact", { artifactId });
      if (!file.downloadUrl) throw new Error("Stoic did not return a download link.");
      await runtime.openLink(file.downloadUrl);
      runtime.notify(`Secure download link opened. It expires in ${file.expiresInSeconds || 300} seconds.`, "success");
    } catch (reason) {
      setPageState((current) => current.projectId === projectId ? { ...current, error: errorMessage(reason, "Could not create a download link.") } : current);
    } finally { setOpeningId(""); }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 sm:gap-6 sm:p-6">
      <header className="space-y-1"><p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Team</p><h1 className="text-2xl font-semibold tracking-tight">Files</h1><p className="max-w-2xl text-sm text-muted-foreground">Project files with secure download links.</p></header>

      {!projectId ? <EmptyPanel icon={<FileText />} title="Choose a project first" description="Shared files are attached to a project or to a specific handoff." /> : (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground"><FolderKanban className="size-4" /></div><div><CardTitle>Project files</CardTitle><CardDescription>{project?.name || "Current project"} · Project-level files only</CardDescription></div></div>
            <CardAction><Badge variant="outline">{artifacts.length}{nextOffset !== null ? "+" : ""} files</Badge></CardAction>
          </CardHeader>
          <CardContent className="space-y-3">
            <InlineError message={error} />
            {loading ? <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div> : artifacts.length ? (
              <>
                <Table>
                  <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Type · size</TableHead><TableHead>Added</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {artifacts.map((artifact) => (
                      <TableRow key={artifact.id}>
                        <TableCell><div className="flex min-w-0 items-center gap-2"><FileText className="size-4 shrink-0 text-muted-foreground" /><span className="max-w-56 truncate font-medium" title={artifact.name}>{artifact.name}</span></div></TableCell>
                        <TableCell><span className="text-xs text-muted-foreground">{artifact.mime_type}</span><span className="ml-2 text-xs">{fileSize(artifact.size_bytes)}</span></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{dateLabel(artifact.created_at)}</TableCell>
                        <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => void openArtifact(artifact.id)} disabled={Boolean(openingId)}>{openingId === artifact.id ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <ArrowDownToLine data-icon="inline-start" />} Download</Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {nextOffset !== null && <Button variant="outline" className="w-full" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? <><LoaderCircle className="animate-spin" data-icon="inline-start" /> Loading…</> : "Load more files"}</Button>}
              </>
            ) : <EmptyPanel icon={<FileText />} title="No project files yet" description="Files attached to a specific assignment appear in that handoff’s history." />}
          </CardContent>
          {artifacts.length > 0 && <CardFooter className="gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-3.5" /> Download links expire after five minutes.</CardFooter>}
        </Card>
      )}
    </div>
  );
}
