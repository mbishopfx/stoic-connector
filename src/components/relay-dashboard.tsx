"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { createBrowserClient } from "@supabase/ssr";
import {
  BookOpenIcon,
  ChartBarIcon,
  ChatBubbleLeftRightIcon,
  ChatBubbleOvalLeftEllipsisIcon,
  ClipboardDocumentListIcon,
  CreditCardIcon,
  FolderIcon,
  LightBulbIcon,
  PaperClipIcon,
  QueueListIcon,
  Squares2X2Icon,
  UserCircleIcon,
  UserGroupIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type Plan, type Platform } from "@/lib/config";
import { AGENT_HARNESSES, agentHarnessLabel, agentScheduleSetupLabel, harnessHasDocumentedScheduler, harnessSupports90MinuteCadence, isGrokBotHarness, type AgentHarnessId } from "@/lib/agent-harness";
import { agentConnectionGuide } from "@/lib/agent-connection-guidance";
import { agentConnectionSummary, agentHealth, FIRST_INBOX_CHECK_PROMPT } from "@/lib/agent-health";
import { hermesInstallPrompt } from "@/lib/agent-setup-guidance";
import { agentInstallPrompt, stoicAgentInstructions } from "@/lib/agent-install-guidance";
import { agentRunReportPrompt, schedulePromptFor } from "@/lib/agent-run-guidance";
import { museRelayPrompt } from "@/lib/muse-browser-guidance";
import { canPreviewImageArtifact, canPreviewTextArtifact, safeArtifactMime } from "@/lib/artifact-mime";
import { getDashboardGuidance, type DashboardGuidance, type DashboardGuideTab } from "@/lib/dashboard-guidance";
import { StoicIntake } from "@/components/stoic-intake";
import { AssistantRichInline, AssistantRichText } from "@/components/rich-text";
import { StoicMark } from "@/components/stoic-mark";
import { DashboardAppearanceControl, useDashboardAppearance } from "@/components/dashboard-appearance";
import { AgentSetupProgress } from "@/components/agent-setup-progress";
import { KnowledgeCenter } from "@/components/knowledge-center";
import { PromptLibraryView } from "@/components/prompt-library";
import { ContactsWorkspace } from "@/components/contacts-workspace";
import { BoardDiscussionView } from "@/components/board-discussion";
import { AgentInstallation } from "@/components/agent-installation";
import { ActivityAnalyticsPanel } from "@/mcp-app/tabs/activity-analytics";
import type { ActivityAnalytics } from "@/mcp-app/ui-contract";
import { useTheme } from "next-themes";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty as UiEmpty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Message, MessageContent, MessageGroup, MessageHeader } from "@/components/ui/message";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

type Agent = { id: string; name: string; platform: Platform; harness_name?: string | null; status: string; oauth_client_id: string | null; access_notes: string; schedule_enabled: boolean; schedule_cadence_minutes: number; last_check_at: string | null; created_at: string };
type Project = { id: string; name: string; brief: string; brief_version: number; default_agent_id: string | null; group_chat_root_id?: string | null; created_at: string };
type Handoff = { id: string; project_id: string; assigned_agent_id: string | null; created_by_agent_id: string | null; title: string; goal: string; constraints: string; status: string; created_at: string; updated_at: string };
type Approval = { id: string; handoff_id: string; action_summary: string; status: string; created_at: string };
type Artifact = { id: string; project_id: string; handoff_id: string | null; name: string; mime_type: string; size_bytes: number; created_at: string };
type Event = { id: string; handoff_id: string; actor_key: string; event_type: string; body: string; created_at: string };
type HandoffHistoryFilters = { q: string; projectId: string; agentId: string; status: string };
type HandoffHistoryPage = { items: Handoff[]; nextCursor: string | null; hasMore: boolean; pageSize: number };
type HandoffHistoryDetail = { handoff: Handoff; events: Event[]; artifacts: Artifact[] };
type BoardMessage = { id: string; project_id: string; parent_id: string | null; author_key: string; kind: "message" | "run_report" | "suggestion" | "artifact"; body: string; created_at: string };
type Idea = { id: string; workspace_id: string; project_id: string; run_id: string; title: string; summary: string; why_now: string; next_step: string; evidence_ids: string[]; status: "pending" | "accepted" | "archived"; accepted_handoff_id: string | null; accepted_at: string | null; archived_at: string | null; created_at: string; updated_at: string };

type CheckActivity = { id: number; actor_key: string; details: { handoffCount?: number; unreadProjectCount?: number }; created_at: string };
type Workspace = { id: string; name: string; plan: Plan; stripe_customer_id: string | null; delegation_level: "observe" | "propose" | "delegate"; boss_agent_id: string | null; ideas_timezone: string | null };
type DashboardState = { user: { id: string; email: string }; workspace: Workspace | null; agents?: Agent[]; projects?: Project[]; handoffs?: Handoff[]; approvals?: Approval[]; artifacts?: Artifact[]; events?: Event[]; board?: BoardMessage[]; activity?: CheckActivity[]; ideas?: Idea[]; activityAnalytics?: ActivityAnalytics; monthlyPrice?: number | null; usage?: { handoffs: number; storageBytes: number } };
type Tab = "analytics" | "assistant" | "ideas" | "overview" | "handoffs" | "board" | "contacts" | "prompts" | "agents" | "install" | "projects" | "knowledge" | "files" | "billing";

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

const navSections: { label: string; items: { id: Tab; label: string; icon: typeof Squares2X2Icon }[] }[] = [
  { label: "START", items: [
    { id: "analytics", label: "Analytics", icon: ChartBarIcon },
    { id: "assistant", label: "Stoic chat", icon: ChatBubbleOvalLeftEllipsisIcon },
    { id: "ideas", label: "Ideas", icon: LightBulbIcon },
  ] },
  { label: "WORK", items: [
    { id: "overview", label: "Overview", icon: Squares2X2Icon },
    { id: "handoffs", label: "Handoffs", icon: ClipboardDocumentListIcon },
    { id: "board", label: "Group chat", icon: ChatBubbleLeftRightIcon },
    { id: "contacts", label: "Contacts", icon: UserCircleIcon },
    { id: "projects", label: "Projects", icon: FolderIcon },
  ] },
  { label: "TEAM", items: [
    { id: "agents", label: "Agents", icon: UserGroupIcon },
    { id: "install", label: "Installation", icon: WrenchScrewdriverIcon },
    { id: "prompts", label: "Prompt library", icon: QueueListIcon },
    { id: "knowledge", label: "Knowledge", icon: BookOpenIcon },
    { id: "files", label: "Artifacts", icon: PaperClipIcon },
  ] },
  { label: "ACCOUNT", items: [
    { id: "billing", label: "Plan & billing", icon: CreditCardIcon },
  ] },
];
const nav = navSections.flatMap((section) => section.items);

function timeAgo(value: string | null) {
  if (!value) return "Never";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 2) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function displayedAgentHealth(agent: Agent) {
  if (agent.platform !== "muse") return agentHealth(agent);
  if (agent.status === "revoked") return { label: "Revoked", tone: "muted" as const };
  if (agent.status === "connected") return { label: "Browser relay only", tone: "neutral" as const };
  return { label: "Browser setup", tone: "neutral" as const };
}

function DashboardSidebarNavigation({
  email,
  workspaceName,
  tab,
  activeHandoffs,
  pendingApprovals,
  onSelect,
  onSignOut,
}: {
  email: string;
  workspaceName: string;
  tab: Tab;
  activeHandoffs: number;
  pendingApprovals: number;
  onSelect: (nextTab: Tab) => void;
  onSignOut: () => void;
}) {
  const { setOpenMobile } = useSidebar();

  return <Sidebar variant="inset" collapsible="icon" className="stoic-dashboard-sidebar" aria-label="Primary navigation">
    <SidebarHeader className="stoic-sidebar-header">
      <Link href="/" className="brand" aria-label="Stoic Connector home" title="Stoic Connector">
        <span className="brand-mark"><StoicMark /></span>
        <span className="brand-wordmark">Stoic <strong>Connector</strong></span>
      </Link>
      <div className="workspace-switch" role="group" aria-label={`Workspace: ${workspaceName}`} title={workspaceName}>
        <span className="workspace-initial">{workspaceName.charAt(0).toUpperCase()}</span>
        <div className="workspace-switch-copy"><strong>{workspaceName}</strong><small>Team workspace</small></div>
      </div>
    </SidebarHeader>
    <SidebarSeparator />
    <SidebarContent className="stoic-sidebar-content">
      {navSections.map((section) => <SidebarGroup key={section.label}>
        <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
        <SidebarGroupContent>
          <nav aria-label={section.label}>
            <SidebarMenu>
              {section.items.map((item) => {
                const Icon = item.icon;
                const count = item.id === "handoffs" ? activeHandoffs : item.id === "overview" ? pendingApprovals : 0;
                return <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={tab === item.id}
                    aria-current={tab === item.id ? "page" : undefined}
                    aria-label={item.label}
                    tooltip={item.label}
                    onClick={() => {
                      onSelect(item.id);
                      setOpenMobile(false);
                    }}
                  >
                    <Icon aria-hidden="true" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                  {count > 0 && <SidebarMenuBadge className={item.id === "overview" ? "bg-amber-200 text-amber-950" : "bg-sidebar-accent"}>{count}</SidebarMenuBadge>}
                </SidebarMenuItem>;
              })}
            </SidebarMenu>
          </nav>
        </SidebarGroupContent>
      </SidebarGroup>)}
    </SidebarContent>
    <SidebarFooter className="stoic-sidebar-footer">
      <div className="sidebar-help"><strong>Let the team work at its own pace.</strong><p>Agents pick up handoffs on their next successful schedule. Stoic cannot wake an offline agent.</p></div>
      <button className="user-row" onClick={onSignOut} aria-label={`Sign out ${email}`} title={`Sign out ${email}`}>
        <span className="user-avatar">{email.charAt(0).toUpperCase()}</span>
        <span className="user-row-copy"><strong>{email}</strong><small>Sign out</small></span>
      </button>
    </SidebarFooter>
  </Sidebar>;
}

export function StoicDashboard({ email }: { email: string }) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const { appearance, setAppearance } = useDashboardAppearance();
  const [state, setState] = useState<DashboardState | null>(null);
  const [tab, setTab] = useState<Tab>("analytics");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ agentId: string; value: string; type: "key" | "code" } | null>(null);
  const [intakeSeed, setIntakeSeed] = useState<{ projectId: string; prompt: string } | null>(null);
  const clearIntakeSeed = useCallback(() => setIntakeSeed(null), []);

  const reload = useCallback(async () => {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) { if (response.status === 401) router.push("/login"); throw new Error("Could not load your workspace"); }
    setState(await response.json());
  }, [router]);

  useEffect(() => { void fetch("/api/state", { cache: "no-store" }).then(async (response) => {
    if (!response.ok) throw new Error("Could not load your workspace");
    return response.json();
  }).then(setState).catch((cause) => setError(cause.message)); }, []);
  useEffect(() => {
    if (tab !== "agents" && tab !== "overview" && tab !== "assistant" && tab !== "analytics") return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void reload().catch(() => {});
    };
    if (tab !== "assistant") refreshWhenVisible();
    const refreshInterval = tab === "agents" || tab === "analytics" ? 30_000 : 5 * 60_000;
    const timer = window.setInterval(refreshWhenVisible, refreshInterval);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [tab, reload]);
  useEffect(() => { window.scrollTo(0, 0); }, [tab]);

  async function command(action: string, payload: Record<string, unknown> = {}) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/commands", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Request failed");
      await reload();
      return json.data;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed");
      throw cause;
    } finally { setBusy(false); }
  }

  const timezoneInitialization = useRef<string | null>(null);
  useEffect(() => {
    const workspace = state?.workspace;
    if (!workspace || workspace.ideas_timezone || timezoneInitialization.current === workspace.id) return;
    timezoneInitialization.current = workspace.id;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    void fetch("/api/commands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_ideas_timezone", timezone }),
    }).then(async (response) => {
      if (!response.ok) throw new Error("Could not save the workspace time zone");
      await reload();
    }).catch(() => undefined);
  }, [reload, state?.workspace]);

  async function signOut() {
    const client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
    await client.auth.signOut();
    router.push("/");
  }

  if (!state) return <main className="dashboard-loading"><span className="brand-mark"><StoicMark /></span><p>Loading Stoic…</p>{error && <p role="alert">{error}</p>}</main>;
  if (!state.workspace) return <WorkspaceSetup email={email} busy={busy} onCreate={(name) => command("create_workspace", { name })} error={error} />;

  const workspace = state.workspace;
  if (workspace.plan !== "pro") return <SubscriptionGate workspace={workspace} agents={state.agents || []} email={email} busy={busy} command={command} error={error} />;
  const agents = state.agents || [];
  const projects = state.projects || [];
  const handoffs = state.handoffs || [];
  const approvals = state.approvals || [];
  const artifacts = state.artifacts || [];
  const events = state.events || [];
  const board = state.board || [];
  const activity = state.activity || [];
  const ideas = state.ideas || [];
  const pendingApprovals = approvals.filter((a) => a.status === "pending");
  const activeHandoffs = handoffs.filter((h) => !["accepted", "canceled"].includes(h.status));
  const currentAgent = agents.find((a) => a.id === selectedAgent && a.status !== "revoked") || agents.find((a) => a.status !== "revoked");
  const dashboardGuidance = getDashboardGuidance({ agents, projects, handoffs, bossAgentId: workspace.boss_agent_id });
  const currentNavItem = nav.find((item) => item.id === tab) || nav[0];
  const CurrentNavIcon = currentNavItem.icon;

  function followDashboardGuidance(guidance: DashboardGuidance = dashboardGuidance) {
    if (guidance.agentId) setSelectedAgent(guidance.agentId);
    setTab(guidance.tab);
  }

  return <SidebarProvider className={`dashboard-shell ${tab === "board" ? "board-chat-shell" : ""}`} data-theme={resolvedTheme === "dark" ? "dark" : "light"} data-component-system="shadcn" data-accent={appearance.accent} data-density={appearance.density} data-corners={appearance.corners}>
    <DashboardSidebarNavigation
      email={email}
      workspaceName={workspace.name}
      tab={tab}
      activeHandoffs={activeHandoffs.length}
      pendingApprovals={pendingApprovals.length}
      onSelect={(nextTab) => {
        setTab(nextTab);
        if (nextTab === "board" || nextTab === "ideas") void reload().catch(() => {});
      }}
      onSignOut={signOut}
    />
    <SidebarInset className={`dashboard-main ${tab === "board" ? "board-chat-main" : ""}`}>
      <header className="dashboard-header">
        <div className="dashboard-header-start">
          <SidebarTrigger className="dashboard-sidebar-trigger" aria-label="Toggle navigation" />
          <div className="breadcrumb" role="img" aria-label={`${workspace.name} · ${currentNavItem.label}`} title={`${workspace.name} · ${currentNavItem.label}`}><CurrentNavIcon aria-hidden="true" /><span className="sr-only">{workspace.name} · {currentNavItem.label}</span></div>
        </div>
        <div className="header-right"><DashboardAppearanceControl appearance={appearance} onChange={setAppearance} /><Avatar size="sm" aria-label={`Account: ${email}`} title={email}><AvatarFallback>{email.charAt(0).toUpperCase()}</AvatarFallback></Avatar></div>
      </header>
      <div className={`dashboard-content ${tab === "assistant" ? "assistant-content" : ""} ${tab === "board" ? "board-chat-content" : ""}`}>{error && <Alert variant="destructive" className="mb-3 flex items-center justify-between gap-3"><AlertDescription>{error}</AlertDescription><Button type="button" variant="ghost" size="sm" onClick={() => setError("")}>Dismiss</Button></Alert>}{notice && <Alert role="status" className="mb-3 flex items-center justify-between gap-3 border-primary/30 bg-primary/5"><AlertDescription>{notice}</AlertDescription><Button type="button" variant="ghost" size="sm" onClick={() => setNotice("")}>Dismiss</Button></Alert>}
        {tab === "analytics" && <div className="space-y-5"><header className="space-y-2"><Badge variant="secondary">TEAM ACTIVITY</Badge><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Analytics</h1><p className="max-w-2xl text-sm leading-6 text-muted-foreground">Six-hour agent activity and 30-day trends. The latest workspace data refreshes while this view is open.</p></header><ActivityAnalyticsPanel analytics={state.activityAnalytics} workspaceAgentCount={agents.filter((agent) => agent.status !== "revoked").length} /></div>}
        {tab === "assistant" && <StoicIntake projects={projects} agents={agents} bossAgentId={workspace.boss_agent_id} guidance={dashboardGuidance} command={command} onHandoffCreated={() => { void reload().catch(() => {}); }} onViewHandoffs={() => setTab("handoffs")} onManageAgents={() => setTab("agents")} onOpenGuidance={() => followDashboardGuidance()} initialPrompt={intakeSeed?.prompt} initialProjectId={intakeSeed?.projectId} onPrefillConsumed={clearIntakeSeed} />}
        {tab === "ideas" && <IdeasView projects={projects} agents={agents} ideas={ideas} workspace={workspace} busy={busy} command={command} />}
        {tab === "contacts" && <ContactsWorkspace projects={projects} busy={busy} command={command} onOpenPrompts={() => setTab("prompts")} />}
        {tab === "prompts" && <PromptLibraryView onOpenAgents={() => setTab("agents")} onOpenContacts={() => setTab("contacts")} />}
        {tab === "install" && <AgentInstallation onManageAgents={() => setTab("agents")} />}
        {tab === "overview" && <div className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1"><Badge variant="secondary">Workspace overview</Badge><h1 className="text-2xl font-semibold tracking-tight">Good to see you.</h1><p className="text-sm text-muted-foreground">See what is moving and where your team could use a hand.</p></div>
            <Button onClick={() => setTab("assistant")}>Start with Stoic</Button>
          </div>
          <BridgeGuide guidance={dashboardGuidance} onNavigate={(nextTab, agentId) => followDashboardGuidance({ ...dashboardGuidance, tab: nextTab, agentId })} />
          <section aria-label="Workspace summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Card size="sm"><CardHeader><CardDescription>Active MCP credentials</CardDescription></CardHeader><CardContent><p className="text-3xl font-semibold tabular-nums">{agents.filter((agent) => agent.status === "connected" && agent.platform !== "muse").length}</p><p className="mt-1 text-xs text-muted-foreground">A successful inbox check verifies each connection.</p></CardContent></Card>
            <Card size="sm"><CardHeader><CardDescription>Active handoffs</CardDescription></CardHeader><CardContent><p className="text-3xl font-semibold tabular-nums">{activeHandoffs.length}</p><p className="mt-1 text-xs text-muted-foreground">{state.usage?.handoffs || 0} created this month.</p></CardContent></Card>
            <Card size="sm"><CardHeader><CardDescription>Needs your review</CardDescription></CardHeader><CardContent><p className="text-3xl font-semibold tabular-nums">{pendingApprovals.length}</p><p className="mt-1 text-xs text-muted-foreground">Agents cannot approve requests on your behalf.</p></CardContent></Card>
          </section>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Handoffs in motion</CardTitle><CardDescription>Work your team is handling now.</CardDescription><CardAction><Button variant="ghost" size="sm" onClick={() => setTab("handoffs")}>View all</Button></CardAction></CardHeader>
              <Separator />
              <CardContent className="pt-4">{activeHandoffs.length ? <div className="divide-y">{activeHandoffs.slice(0, 5).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="min-w-0"><p className="truncate text-sm font-medium"><AssistantRichInline text={item.title} /></p><p className="mt-1 truncate text-xs text-muted-foreground">{(item.assigned_agent_id ? agents.find((agent) => agent.id === item.assigned_agent_id)?.name : null) || "Team queue"} · {projects.find((project) => project.id === item.project_id)?.name || "Project"}</p></div><Badge variant="outline" className="shrink-0">{item.status.replaceAll("_", " ")}</Badge></div>)}</div> : <UiEmpty className="border-0 px-0 py-8"><EmptyHeader><EmptyTitle>Nothing in motion</EmptyTitle><EmptyDescription>Active assignments will appear here. You can review completed work in Handoffs.</EmptyDescription></EmptyHeader><EmptyContent><Button variant="outline" size="sm" onClick={() => setTab("handoffs")}>Open handoffs</Button></EmptyContent></UiEmpty>}</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Agent check-ins</CardTitle><CardDescription>Know who is ready to receive work.</CardDescription><CardAction><Button variant="ghost" size="sm" onClick={() => setTab("agents")}>Manage agents</Button></CardAction></CardHeader>
              <Separator />
              <CardContent className="pt-4">{agents.filter((agent) => agent.status !== "revoked").length ? <div className="divide-y">{agents.filter((agent) => agent.status !== "revoked").slice(0, 5).map((agent) => { const health = displayedAgentHealth(agent); return <div key={agent.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><Avatar><AvatarFallback>{agent.name.charAt(0).toUpperCase()}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{agent.name}{workspace.boss_agent_id === agent.id && <Badge variant="secondary" className="ml-2">Lead</Badge>}</p><p className="mt-1 truncate text-xs text-muted-foreground">{agentHarnessLabel(agent)} · {agent.platform === "muse" ? "browser relay" : `last check ${timeAgo(agent.last_check_at)}`}</p></div><Badge variant={health.tone === "good" ? "secondary" : "outline"} className="shrink-0">{health.label}</Badge></div>; })}</div> : <UiEmpty className="border-0 px-0 py-8"><EmptyHeader><EmptyTitle>Build your team</EmptyTitle><EmptyDescription>Add your first agent, then give it an identity in Stoic.</EmptyDescription></EmptyHeader><EmptyContent><Button variant="outline" size="sm" onClick={() => setTab("agents")}>Set up an agent</Button></EmptyContent></UiEmpty>}</CardContent>
            </Card>
          </div>
          {pendingApprovals.length > 0 && <Card>
            <CardHeader><CardTitle>Needs your decision</CardTitle><CardDescription>Review each request; agents cannot approve these on your behalf.</CardDescription></CardHeader><Separator />
            <CardContent className="divide-y pt-1">{pendingApprovals.map((approval) => <div key={approval.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="text-sm font-medium"><AssistantRichInline text={approval.action_summary} /></p><p className="mt-1 text-xs text-muted-foreground">For {handoffs.find((handoff) => handoff.id === approval.handoff_id)?.title || "a handoff"}</p></div><div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => command("decide_approval", { approvalId: approval.id, decision: "approved" }).catch(() => {})}>Approve</Button><Button size="sm" variant="destructive" disabled={busy} onClick={() => command("decide_approval", { approvalId: approval.id, decision: "denied" }).catch(() => {})}>Deny</Button></div></div>)}</CardContent>
          </Card>}
        </div>}
        {tab === "handoffs" && <HandoffsView agents={agents} projects={projects} handoffs={handoffs} events={events} artifacts={artifacts} bossAgentId={workspace.boss_agent_id} busy={busy} command={command} />}
        {tab === "board" && <BoardView projects={projects} agents={agents} messages={board} busy={busy} command={command} refresh={reload} />}
        {tab === "agents" && <><AgentsView agents={agents} workspace={workspace} handoffs={handoffs} busy={busy} selected={currentAgent} secret={secret} onSelect={setSelectedAgent} onSecret={setSecret} onNavigate={(nextTab) => setTab(nextTab)} command={command} /><ScheduleGuide agent={currentAgent} workspace={workspace} /><AgentCheckHistory agent={currentAgent} activity={activity} /></>}
        {tab === "projects" && <><ProjectsView projects={projects} handoffs={handoffs} agents={agents} busy={busy} command={command} onNavigate={setTab} /><RoutingView projects={projects} agents={agents} bossAgentId={workspace.boss_agent_id} busy={busy} command={command} /></>}
        {tab === "knowledge" && <KnowledgeCenter projects={projects} agents={agents} onManageProjects={() => setTab("projects")} />}
        {tab === "files" && <FilesView projects={projects} handoffs={handoffs} artifacts={artifacts} busy={busy} command={command} setNotice={setNotice} onManageProjects={() => setTab("projects")} />}
        {tab === "billing" && <BillingView workspace={workspace} monthlyPrice={state.monthlyPrice} usage={state.usage || { handoffs: 0, storageBytes: 0 }} busy={busy} command={command} />}
      </div>
    </SidebarInset>
  </SidebarProvider>;
}


function BridgeGuide({ guidance, onNavigate }: { guidance: DashboardGuidance; onNavigate: (tab: DashboardGuideTab, agentId?: string) => void }) {
  const progress = Math.round((guidance.completedSteps / Math.max(1, guidance.steps.length)) * 100);
  return <Card aria-label="Get your agent team working together" className="border-primary/15 bg-primary/[0.035]">
    <CardContent className="grid gap-5 p-5 md:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)] md:items-center md:p-6">
      <div className="space-y-3"><Badge variant="secondary">One useful next step</Badge><div className="space-y-1.5"><CardTitle className="text-xl">{guidance.title}</CardTitle><CardDescription className="max-w-prose leading-relaxed">{guidance.detail}</CardDescription></div><Button size="sm" onClick={() => onNavigate(guidance.tab, guidance.agentId)}>{guidance.buttonLabel}</Button></div>
      <div className="space-y-3"><div className="flex items-center justify-between gap-3 text-sm"><span className="font-medium">Team setup</span><span className="text-muted-foreground">{guidance.completedSteps} of {guidance.steps.length} steps</span></div><Progress value={progress} aria-label="Team setup progress" />
        <Accordion defaultValue={[]}><AccordionItem value="team-setup"><AccordionTrigger className="py-2 text-sm">See setup progress</AccordionTrigger><AccordionContent><ol className="space-y-2">{guidance.steps.map((step) => <li key={step.label} className="flex items-center justify-between gap-3 text-sm"><span>{step.label}</span><Badge variant={step.complete ? "secondary" : "outline"}>{step.complete ? "Done" : "Next"}</Badge></li>)}</ol><p className="mt-3 text-xs leading-relaxed text-muted-foreground">Access notes are optional. Add them only when they help the team understand an agent&apos;s available tools; never include credentials.</p></AccordionContent></AccordionItem></Accordion>
      </div>
    </CardContent>
  </Card>;
}

function SubscriptionGate({ workspace, agents, email, busy, command, error }: { workspace: Workspace; agents: Agent[]; email: string; busy: boolean; command: (action: string, payload?: Record<string, unknown>) => Promise<unknown>; error: string }) {
  async function checkout() {
    const result = await command("checkout") as { url: string };
    window.location.href = result.url;
  }
  async function portal() {
    const result = await command("billing_portal") as { url: string };
    window.location.href = result.url;
  }
  return <main className="setup-page"><section className="setup-card subscription-gate">
    <Link href="/" className="brand"><span className="brand-mark"><StoicMark /></span><span>Stoic <strong>Connector</strong></span></Link>
    <div className="setup-progress"><span className="active" /><span className="active" /><span /></div>
    <span className="eyebrow muted">ONE SUBSCRIPTION · ALL YOUR AGENTS</span>
    <h1>Unlock {workspace.name}.</h1>
    <p>Stoic membership is required to connect agents and coordinate their work. Your agents keep using their own accounts, models, and schedules.</p>
    <ul className="subscription-benefits"><li> No plan-based caps on agents, projects, or handoffs</li><li> Private shared files and complete work history</li><li> Human approval controls stay included</li></ul>
    <button className="button" disabled={busy} onClick={() => checkout().catch(() => {})}>Subscribe · $5/month</button>
    {workspace.stripe_customer_id && <button className="button button-outline" disabled={busy} onClick={() => portal().catch(() => {})}>Manage existing billing</button>}
    <a className="subscription-export" href="/api/export">Export existing workspace data </a>
    {agents.some((agent) => agent.status !== "revoked") && <div className="locked-agents"><strong>Connected profiles</strong>{agents.filter((agent) => agent.status !== "revoked").map((agent) => <div key={agent.id}><span>{agent.name} · {agentHarnessLabel(agent)}</span><button className="danger-link" disabled={busy} onClick={() => command("revoke_agent", { agentId: agent.id }).catch(() => {})}>Revoke</button></div>)}</div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <small>{email} · Cancel through Stripe billing settings. Provider and model charges are separate.</small>
  </section></main>;
}

function WorkspaceSetup({ email, busy, onCreate, error }: { email: string; busy: boolean; onCreate: (name: string) => Promise<unknown>; error: string }) {
  const [name, setName] = useState("");
  return <main className="setup-page"><div className="setup-card"><Link href="/" className="brand"><span className="brand-mark"><StoicMark /></span><span>Stoic <strong>Connector</strong></span></Link><div className="setup-progress"><span className="active" /><span /><span /></div><span className="eyebrow muted">STEP 1 OF 3 · YOUR SPACE</span><h1>Give your team a home.</h1><p>Your agents will share projects, handoffs and files here. You can change the name later.</p><form onSubmit={(event) => { event.preventDefault(); onCreate(name).catch(() => {}); }}><label htmlFor="workspace-name">Workspace name</label><input id="workspace-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Matthew’s agent team" minLength={2} maxLength={80} required /><button className="button" disabled={busy}>Create workspace</button></form>{error && <p className="form-error">{error}</p>}<small>Signed in as {email}</small></div></main>;
}

function historyUrl(filters: HandoffHistoryFilters, cursor?: string | null) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.projectId !== "all") params.set("projectId", filters.projectId);
  if (filters.agentId !== "all") params.set("agentId", filters.agentId);
  if (filters.status !== "all") params.set("status", filters.status);
  if (cursor) params.set("cursor", cursor);
  return `/api/handoffs?${params.toString()}`;
}

async function fetchHandoffHistoryPage(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { cache: "no-store", signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not load handoff history");
  return result as HandoffHistoryPage;
}

function HandoffsView({ agents, projects, handoffs, events, artifacts, bossAgentId, busy, command }: { agents: Agent[]; projects: Project[]; handoffs: Handoff[]; events: Event[]; artifacts: Artifact[]; bossAgentId: string | null; busy: boolean; command: (action: string, payload?: Record<string, unknown>) => Promise<unknown> }) {
  const [selectedId, setSelectedId] = useState<string | null>(handoffs[0]?.id || null);
  const [showForm, setShowForm] = useState(false);
  const [projectId, setProjectId] = useState(projects[0]?.id || "");
  const workers = agents.filter((agent) => agent.status === "connected" && agent.id !== bossAgentId && agent.platform !== "muse");
  const [teamQueue, setTeamQueue] = useState(true);
  const [assignedAgentId, setAssignedAgentId] = useState(() => projects[0]?.default_agent_id && workers.some((agent) => agent.id === projects[0].default_agent_id) ? projects[0].default_agent_id : workers[0]?.id || "");
  const effectiveAssigneeId = workers.some((agent) => agent.id === assignedAgentId) ? assignedAgentId : workers[0]?.id || "";
  const [title, setTitle] = useState(""); const [goal, setGoal] = useState(""); const [constraints, setConstraints] = useState(""); const [body, setBody] = useState("");
  const [filterInput, setFilterInput] = useState<HandoffHistoryFilters>({ q: "", projectId: "all", agentId: "all", status: "all" });
  const [filters, setFilters] = useState<HandoffHistoryFilters>({ q: "", projectId: "all", agentId: "all", status: "all" });
  const [historyItems, setHistoryItems] = useState(handoffs);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyRevision, setHistoryRevision] = useState(0);
  const [detail, setDetail] = useState<HandoffHistoryDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const createAttempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const actionAttempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const selectedFromHistory = historyItems.find((handoff) => handoff.id === selectedId);
  const selected = selectedFromHistory
    || (detail?.handoff.id === selectedId ? detail.handoff : undefined)
    || handoffs.find((handoff) => handoff.id === selectedId)
    || historyItems[0] || null;
  const selectedAssignee = teamQueue ? undefined : workers.find((agent) => agent.id === effectiveAssigneeId);
  const agentNames = Object.fromEntries(agents.map((agent) => [agent.id, agent.name]));

  useEffect(() => {
    const controller = new AbortController();
    void fetchHandoffHistoryPage(historyUrl(filters), controller.signal).then((page) => {
      setHistoryItems(page.items);
      setNextCursor(page.nextCursor);
      setSelectedId((current) => page.items.some((item) => item.id === current) ? current : page.items[0]?.id || null);
    }).catch((error) => {
      if (!controller.signal.aborted) {
        setHistoryItems([]);
        setSelectedId(null);
        setHistoryError(error instanceof Error ? error.message : "Could not load handoff history");
      }
    }).finally(() => { if (!controller.signal.aborted) setHistoryLoading(false); });
    return () => controller.abort();
  }, [filters, historyRevision]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    void fetch(`/api/handoffs?id=${encodeURIComponent(selectedId)}`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load this handoff");
      return result as HandoffHistoryDetail;
    }).then((result) => {
      setDetail(result);
      setDetailError("");
    }).catch((error) => {
      if (!controller.signal.aborted) setDetailError(error instanceof Error ? error.message : "Could not load this handoff");
    });
    return () => controller.abort();
  }, [selectedId, historyRevision]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!teamQueue && !effectiveAssigneeId) return;
    const fingerprint = JSON.stringify([projectId, teamQueue ? "team_queue" : effectiveAssigneeId, title, goal, constraints]);
    if (createAttempt.current?.fingerprint !== fingerprint) createAttempt.current = { fingerprint, key: crypto.randomUUID() };
    await command("create_handoff", { projectId, ...(teamQueue ? { teamQueue: true } : { assignedAgentId: effectiveAssigneeId }), title, goal, constraints, idempotencyKey: createAttempt.current.key });
    createAttempt.current = null;
    setTitle(""); setGoal(""); setConstraints(""); setShowForm(false); setHistoryRevision((value) => value + 1);
    setHistoryLoading(true); setHistoryError("");
  }

  async function act(action: string) {
    if (!selected) return;
    const fingerprint = JSON.stringify([selected.id, action, body]);
    if (actionAttempt.current?.fingerprint !== fingerprint) actionAttempt.current = { fingerprint, key: crypto.randomUUID() };
    await command("task_action", { handoffId: selected.id, action, body, idempotencyKey: actionAttempt.current.key });
    actionAttempt.current = null;
    setBody(""); setHistoryRevision((value) => value + 1);
    setHistoryLoading(true); setHistoryError("");
  }

  async function loadOlder() {
    if (!nextCursor || historyLoadingMore) return;
    setHistoryLoadingMore(true);
    setHistoryError("");
    try {
      const page = await fetchHandoffHistoryPage(historyUrl(filters, nextCursor));
      setHistoryItems((current) => [...current, ...page.items.filter((item) => !current.some((existing) => existing.id === item.id))]);
      setNextCursor(page.nextCursor);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Could not load older handoffs");
    } finally {
      setHistoryLoadingMore(false);
    }
  }

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    setHistoryLoading(true);
    setHistoryError("");
    setFilters({ ...filterInput, q: filterInput.q.trim() });
  }

  function clearFilters() {
    const empty: HandoffHistoryFilters = { q: "", projectId: "all", agentId: "all", status: "all" };
    setFilterInput(empty);
    setHistoryLoading(true);
    setHistoryError("");
    setFilters(empty);
  }

  const selectedProject = selected && projects.find((project) => project.id === selected.project_id);
  const detailForSelected = !!selected && detail?.handoff.id === selected.id;
  const selectedEvents = detail?.handoff.id === selected?.id ? detail.events : events.filter((event) => event.handoff_id === selected?.id);
  const selectedArtifacts = detail?.handoff.id === selected?.id ? detail.artifacts : artifacts.filter((artifact) => artifact.handoff_id === selected?.id);

  const statusBadge = (status: string) => <Badge variant="outline" className="shrink-0 border-[var(--dash-line)] bg-[var(--dash-soft)] text-[var(--dash-text)] capitalize">{status.replaceAll("_", " ")}</Badge>;
  const fieldClass = "text-[var(--dash-text)]";
  const controlClass = "border-[var(--dash-line)] bg-[var(--dash-panel)] text-[var(--dash-text)] placeholder:text-[var(--dash-muted)] focus-visible:ring-[var(--dash-accent)]";
  const selectClass = "w-full border-[var(--dash-line)] bg-[var(--dash-panel)] text-[var(--dash-text)]";
  const cardClass = "min-w-0 border-[var(--dash-line)] !bg-[var(--dash-panel)] !text-[var(--dash-text)] ring-[var(--dash-line)] shadow-none";
  const hasHistoryFilters = Boolean(filters.q || filters.status !== "all" || filters.projectId !== "all" || filters.agentId !== "all");

  return <div className="space-y-5 sm:space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl space-y-2">
        <Badge variant="secondary" className="bg-[var(--dash-soft)] text-[var(--dash-muted)]">Work in motion</Badge>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--dash-text)] sm:text-3xl">Handoffs</h1>
        <p className="max-w-[65ch] text-sm leading-6 text-[var(--dash-muted)]">Search every project assignment, follow its complete timeline, and review the result.</p>
      </div>
      <Button type="button" onClick={() => setShowForm(!showForm)}>{showForm ? "Close form" : "New handoff"}</Button>
    </header>

    {showForm && <Card className={cardClass}>
      <CardHeader className="border-b border-[var(--dash-line)]">
        <CardTitle className="text-lg">Make a handoff</CardTitle>
        <CardDescription className="text-[var(--dash-muted)]">Give a connected worker a clear outcome and enough context to act.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 pt-4">
        {!workers.length && <Alert className="border-amber-700/20 bg-amber-500/10 text-[var(--dash-text)]">
          <AlertTitle>Connect a worker first.</AlertTitle>
          <AlertDescription className="text-[var(--dash-muted)]">Connected workers can claim a shared handoff on their next inbox check. The first claim gives that worker sole ownership.</AlertDescription>
        </Alert>}
        <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => submit(event).catch(() => {})}>
          <Field>
            <FieldLabel htmlFor="handoff-project" className={fieldClass}>Project</FieldLabel>
            <Select value={projectId} onValueChange={(value) => { const next = projects.find((project) => project.id === (value || "")); setProjectId(value || ""); setAssignedAgentId(next?.default_agent_id && workers.some((agent) => agent.id === next.default_agent_id) ? next.default_agent_id : workers[0]?.id || ""); }}>
              <SelectTrigger id="handoff-project" className={selectClass}><SelectValue placeholder="Choose a project" /></SelectTrigger>
              <SelectContent>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="handoff-assignee" className={fieldClass}>Who can take this?</FieldLabel>
            <Select value={teamQueue ? "team_queue" : effectiveAssigneeId} onValueChange={(value) => { const next = value || "team_queue"; setTeamQueue(next === "team_queue"); if (next !== "team_queue") setAssignedAgentId(next); }}>
              <SelectTrigger id="handoff-assignee" className={selectClass}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="team_queue">All connected workers · first claim wins</SelectItem>
                {workers.map((agent) => <SelectItem key={agent.id} value={agent.id}>{agent.name} only</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="md:col-span-2 rounded-lg border border-[var(--dash-line)] bg-[var(--dash-soft)] p-4" role="note">
            <p className="mb-1 text-sm font-medium text-[var(--dash-text)]">{teamQueue ? "Shared team queue" : selectedAssignee ? `${selectedAssignee.name}\u2019s access` : "Connect a worker first"}</p>
            <p className="text-sm leading-6 text-[var(--dash-muted)]">{teamQueue ? "Every connected worker can see this handoff on its next inbox check. The first to claim it becomes its sole owner." : selectedAssignee?.access_notes || "No app access has been described yet. Confirm what this agent can do before assigning work."}</p>
            <p className="mt-2 text-xs leading-5 text-[var(--dash-muted)]">{teamQueue ? "Stoic creates one handoff, so workers cannot accidentally receive duplicate copies." : "Owner-provided notes guide routing; the agent must verify live access and approval requirements."}</p>
          </div>
          <Field className="md:col-span-2">
            <FieldLabel htmlFor="handoff-title" className={fieldClass}>Title</FieldLabel>
            <Input id="handoff-title" className={controlClass} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Research our launch options" minLength={3} maxLength={160} required />
          </Field>
          <Field className="md:col-span-2">
            <FieldLabel htmlFor="handoff-goal" className={fieldClass}>What needs to be done?</FieldLabel>
            <Textarea id="handoff-goal" className={controlClass} value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Describe the outcome the agent should deliver…" minLength={10} maxLength={10000} required rows={4} />
          </Field>
          <Field className="md:col-span-2">
            <FieldLabel htmlFor="handoff-constraints" className={fieldClass}>Constraints or decisions to keep in mind</FieldLabel>
            <Textarea id="handoff-constraints" className={controlClass} value={constraints} onChange={(event) => setConstraints(event.target.value)} placeholder="Budget, scope, approval boundaries…" maxLength={10000} rows={3} />
          </Field>
          <div className="md:col-span-2">
            <Button type="submit" disabled={busy || !projectId || !workers.length}>{busy ? "Creating…" : "Create handoff"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>}

    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(20rem,0.86fr)_minmax(0,1.4fr)]">
      <Card className={cardClass}>
        <CardHeader className="gap-3 border-b border-[var(--dash-line)] sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Handoff history</CardTitle>
            <CardDescription className="text-[var(--dash-muted)]">{historyItems.length} loaded · newest first</CardDescription>
          </div>
          <Badge variant="outline" className="w-fit border-[var(--dash-line)] text-[var(--dash-muted)]">Newest first</Badge>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <form className="grid gap-3" onSubmit={applyFilters}>
            <Field>
              <FieldLabel htmlFor="history-search" className={fieldClass}>Search titles and goals</FieldLabel>
              <Input id="history-search" className={controlClass} value={filterInput.q} onChange={(event) => setFilterInput((current) => ({ ...current, q: event.target.value }))} maxLength={120} placeholder="Try a project or task phrase" disabled={historyLoadingMore} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field>
                <FieldLabel className={fieldClass}>Project</FieldLabel>
                <Select value={filterInput.projectId} onValueChange={(value) => setFilterInput((current) => ({ ...current, projectId: value || "all" }))} disabled={historyLoadingMore}>
                  <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">All projects</SelectItem>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel className={fieldClass}>Agent</FieldLabel>
                <Select value={filterInput.agentId} onValueChange={(value) => setFilterInput((current) => ({ ...current, agentId: value || "all" }))} disabled={historyLoadingMore}>
                  <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">All agents</SelectItem><SelectItem value="unassigned">Team queue</SelectItem>{agents.map((agent) => <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel className={fieldClass}>Status</FieldLabel>
                <Select value={filterInput.status} onValueChange={(value) => setFilterInput((current) => ({ ...current, status: value || "all" }))} disabled={historyLoadingMore}>
                  <SelectTrigger className={selectClass}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem><SelectItem value="proposed">Proposed</SelectItem><SelectItem value="assigned">Assigned</SelectItem><SelectItem value="claimed">Claimed</SelectItem><SelectItem value="blocked">Blocked</SelectItem><SelectItem value="submitted">Submitted</SelectItem><SelectItem value="changes_requested">Changes requested</SelectItem><SelectItem value="accepted">Accepted</SelectItem><SelectItem value="canceled">Canceled</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" size="sm" disabled={historyLoading || historyLoadingMore}>{historyLoading ? "Searching…" : "Search history"}</Button>
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters} disabled={historyLoadingMore}>Clear filters</Button>
            </div>
          </form>

          {historyError && <Alert variant="destructive" className="!bg-[var(--dash-panel)]"><AlertTitle>Could not load handoffs</AlertTitle><AlertDescription>{historyError}</AlertDescription></Alert>}
          {historyLoading && !historyItems.length ? <div className="space-y-2" role="status" aria-label="Loading project handoffs">
            <p className="text-sm text-[var(--dash-muted)]">Loading project handoffs…</p>
            {[0, 1, 2].map((item) => <div key={item} className="space-y-2 rounded-lg border border-[var(--dash-line)] p-3"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-4/5" /></div>)}
          </div> : historyItems.length ? <div aria-busy={historyLoading} className="space-y-2">
            {historyItems.map((task) => <Button key={task.id} type="button" variant="ghost" aria-pressed={selected?.id === task.id} onClick={() => setSelectedId(task.id)} className={`h-auto w-full items-start justify-between gap-3 whitespace-normal rounded-lg border px-3 py-3 text-left transition-colors ${selected?.id === task.id ? "border-[var(--dash-accent)] bg-[var(--dash-soft)]" : "border-[var(--dash-line)] bg-transparent hover:bg-[var(--dash-soft)]"}`}>
              <span className="min-w-0 flex-1 space-y-1">
                <span className="block truncate text-sm font-medium text-[var(--dash-text)]"><AssistantRichInline text={task.title} /></span>
                <span className="block text-xs leading-5 text-[var(--dash-muted)]">{task.assigned_agent_id ? agentNames[task.assigned_agent_id] || "Agent" : task.status === "proposed" ? "Waiting for owner approval" : "Team queue · open to workers"} · {projects.find((project) => project.id === task.project_id)?.name || "Project"} · {timeAgo(task.updated_at)}</span>
              </span>
              {statusBadge(task.status)}
            </Button>)}
          </div> : <UiEmpty className="min-h-44 border border-dashed border-[var(--dash-line)] bg-[var(--dash-bg)] text-[var(--dash-text)]">
            <EmptyHeader><EmptyTitle>{hasHistoryFilters ? "No matching handoffs" : "Nothing handed off yet"}</EmptyTitle><EmptyDescription className="text-[var(--dash-muted)]">{hasHistoryFilters ? "Try a different phrase or clear the filters to see all project work." : "Start with one clear assignment to a connected agent."}</EmptyDescription></EmptyHeader>
            {hasHistoryFilters && <EmptyContent><Button type="button" variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button></EmptyContent>}
          </UiEmpty>}
          {nextCursor && <Button type="button" variant="outline" size="sm" className="w-full border-[var(--dash-line)] text-[var(--dash-text)]" onClick={() => loadOlder().catch(() => {})} disabled={historyLoadingMore}>{historyLoadingMore ? "Loading older handoffs…" : "Load older handoffs"}</Button>}
          {!nextCursor && historyItems.length > 0 && <p className="pt-1 text-center text-xs text-[var(--dash-muted)]">All matching handoffs are loaded.</p>}
        </CardContent>
      </Card>

      <Card className={cardClass}>
        {selected ? <>
          <CardHeader className="gap-3 border-b border-[var(--dash-line)] sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-2">
              <Badge variant="secondary" className="max-w-full truncate bg-[var(--dash-soft)] text-[var(--dash-muted)]">{selectedProject?.name || "Project"}</Badge>
              <CardTitle className="text-xl sm:text-2xl"><AssistantRichInline text={selected.title} /></CardTitle>
              <CardDescription className="text-[var(--dash-muted)]">{selected.assigned_agent_id ? `Assigned to ${agentNames[selected.assigned_agent_id] || "Agent"}` : selected.status === "proposed" ? "Waiting for owner approval before workers can see this" : "Open to connected workers · first claim owns it"}</CardDescription>
            </div>
            <CardAction>{statusBadge(selected.status)}</CardAction>
          </CardHeader>
          <CardContent className="space-y-5 pt-4">
            <div className="grid grid-cols-1 gap-3 rounded-lg bg-[var(--dash-soft)] p-4 sm:grid-cols-3">
              <div><p className="text-xs text-[var(--dash-muted)]">Last activity</p><p className="mt-1 text-sm font-medium text-[var(--dash-text)]">{timeAgo(selected.updated_at)}</p></div>
              <div><p className="text-xs text-[var(--dash-muted)]">Created</p><p className="mt-1 text-sm font-medium text-[var(--dash-text)]">{new Date(selected.created_at).toLocaleString()}</p></div>
              <div><p className="text-xs text-[var(--dash-muted)]">Outcome</p><p className="mt-1 text-sm font-medium capitalize text-[var(--dash-text)]">{selected.status === "accepted" ? "Accepted by the owner" : selected.status === "submitted" ? "Waiting for owner review" : selected.status === "blocked" ? "Blocked · review the latest update" : selected.status === "changes_requested" ? "Changes requested" : selected.status === "canceled" ? "Canceled" : selected.status.replaceAll("_", " ")}</p></div>
            </div>
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--dash-muted)]">Goal</h3>
              <div className="text-sm leading-6 text-[var(--dash-text)]"><AssistantRichText text={selected.goal} /></div>
            </section>
            {selected.constraints && <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--dash-muted)]">Constraints</h3>
              <div className="rounded-lg border border-[var(--dash-line)] p-3 text-sm leading-6 text-[var(--dash-muted)]"><AssistantRichText text={selected.constraints} /></div>
            </section>}
            <Separator className="bg-[var(--dash-line)]" />
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--dash-muted)]">Activity</h3>
                {detailForSelected && <Badge variant="outline" className="border-[var(--dash-line)] text-[var(--dash-muted)]">{selectedEvents.length} updates</Badge>}
              </div>
              {detailError && <Alert variant="destructive" className="!bg-[var(--dash-panel)]"><AlertTitle>Could not load the complete timeline</AlertTitle><AlertDescription>{detailError}</AlertDescription></Alert>}
              {!detailForSelected && !detailError && <p className="text-sm text-[var(--dash-muted)]" role="status">Loading handoff activity…</p>}
              {detailForSelected && selectedEvents.length === 0 && <UiEmpty className="min-h-28 border border-dashed border-[var(--dash-line)] bg-[var(--dash-bg)] text-[var(--dash-text)]"><EmptyHeader><EmptyTitle className="text-sm">No updates yet</EmptyTitle><EmptyDescription className="text-[var(--dash-muted)]">Post context below to keep the handoff moving.</EmptyDescription></EmptyHeader></UiEmpty>}
              {selectedEvents.length > 0 && <MessageGroup className="gap-0 divide-y divide-[var(--dash-line)]">
                {selectedEvents.map((event) => {
                  const actor = event.actor_key.startsWith("agent:") ? agentNames[event.actor_key.slice(6)] || "Agent" : event.actor_key.startsWith("user:") ? "You" : "Stoic";
                  return <Message key={event.id} className="py-3">
                    <MessageContent className="gap-2">
                      <MessageHeader className="gap-2 px-0 text-[var(--dash-muted)]"><Badge variant="outline" className="border-[var(--dash-line)] text-[var(--dash-text)] capitalize">{event.event_type.replaceAll("_", " ")}</Badge><span>{actor} · {timeAgo(event.created_at)}</span></MessageHeader>
                      {event.body && <div className="text-sm leading-6 text-[var(--dash-text)]"><AssistantRichText text={event.body} /></div>}
                    </MessageContent>
                  </Message>;
                })}
              </MessageGroup>}
            </section>
            {selectedArtifacts.length > 0 && <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--dash-muted)]">Files</h3>
              <div className="flex flex-wrap gap-2">{selectedArtifacts.map((artifact) => <Badge key={artifact.id} variant="secondary" className="max-w-full truncate bg-[var(--dash-soft)] text-[var(--dash-text)]">{artifact.name}</Badge>)}</div>
            </section>}
            <Separator className="bg-[var(--dash-line)]" />
            <div className="space-y-3">
              <Field>
                <FieldLabel htmlFor="handoff-update" className={fieldClass}>Add context for your agent</FieldLabel>
                <Textarea id="handoff-update" className={controlClass} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Share a decision, answer a question, or clarify the expected result…" rows={3} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" className="border-[var(--dash-line)] text-[var(--dash-text)]" onClick={() => act("update").catch(() => {})} disabled={busy || body.trim().length < 2}>Post update</Button>
                {selected.status === "submitted" && <>
                  <Button type="button" size="sm" onClick={() => act("accept").catch(() => {})} disabled={busy}>Accept result</Button>
                  <Button type="button" variant="outline" size="sm" className="border-[var(--dash-line)] text-[var(--dash-text)]" onClick={() => act("request_changes").catch(() => {})} disabled={busy || body.trim().length < 2}>Request changes</Button>
                </>}
                {selected.status === "proposed" && <Button type="button" size="sm" onClick={() => act("approve_assignment").catch(() => {})} disabled={busy}>Approve assignment</Button>}
              </div>
            </div>
          </CardContent>
        </> : <UiEmpty className="min-h-96 border-0 bg-transparent p-8 text-[var(--dash-text)]">
          <EmptyHeader><EmptyTitle>Select a handoff</EmptyTitle><EmptyDescription className="text-[var(--dash-muted)]">Choose a task to see its complete trail.</EmptyDescription></EmptyHeader>
        </UiEmpty>}
      </Card>
    </div>
  </div>;
}

function AgentsView({ agents, workspace, handoffs, busy, selected, secret, onSelect, onSecret, onNavigate, command }: { agents: Agent[]; workspace: Workspace; handoffs: Handoff[]; busy: boolean; selected?: Agent; secret: { agentId: string; value: string; type: "key" | "code" } | null; onSelect: (id: string) => void; onSecret: (value: { agentId: string; value: string; type: "key" | "code" } | null) => void; onNavigate: (tab: Tab) => void; command: (action: string, payload?: Record<string, unknown>) => Promise<unknown> }) {
  const [name, setName] = useState("");
  const [harness, setHarness] = useState<AgentHarnessId>("codex");
  const [customHarnessName, setCustomHarnessName] = useState("");
  const [boss, setBoss] = useState(workspace.boss_agent_id || "");
  const [level, setLevel] = useState(workspace.delegation_level);
  const endpoint = typeof window !== "undefined" ? window.location.origin + "/api/mcp" : "/api/mcp";
  const schedulePrompt = selected ? schedulePromptFor(selected, workspace) : "";
  const activeAgents = agents.filter((agent) => agent.status !== "revoked");
  const activeCredentials = agents.filter((agent) => agent.status === "connected" && agent.platform !== "muse").length;

  async function add(event: FormEvent) {
    event.preventDefault();
    const created = await command("add_agent", {
      name,
      harness,
      ...(harness === "other" ? { customHarnessName } : {}),
    }) as { id: string };
    setName("");
    setCustomHarnessName("");
    onSecret(null);
    onSelect(created.id);
  }

  async function issue(type: "key" | "code") {
    if (!selected) return;
    const value = await command(type === "key" ? "issue_key" : "pair_code", { agentId: selected.id }) as { key?: string; code?: string };
    onSecret({ agentId: selected.id, value: (type === "key" ? value.key : value.code) || "", type });
  }

  const isMuse = selected?.platform === "muse";

  return <div className="space-y-5 sm:space-y-6">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <Badge variant="secondary">Your team</Badge>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Agents</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">Connect each agent with its own Stoic profile, then set access notes and team rules.</p>
      </div>
      <Card size="sm" className="sm:min-w-52">
        <CardContent className="flex items-center justify-between gap-4 py-3">
          <span className="text-sm text-muted-foreground">Active MCP credentials</span>
          <span className="text-lg font-semibold tabular-nums">{activeCredentials}</span>
        </CardContent>
      </Card>
    </header>

    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(17rem,0.78fr)_minmax(0,1.65fr)]">
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Team members</CardTitle>
            <CardDescription>Each agent has its own Stoic profile and can be revoked independently.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeAgents.length ? <div className="flex flex-col gap-1" role="group" aria-label="Team members">
              {activeAgents.map((agent) => {
                const health = displayedAgentHealth(agent);
                const isSelected = selected?.id === agent.id;
                return <Button
                  key={agent.id}
                  type="button"
                  variant={isSelected ? "secondary" : "ghost"}
                  className="h-auto w-full justify-start gap-3 whitespace-normal px-3 py-3 text-left"
                  aria-pressed={isSelected}
                  onClick={() => { onSelect(agent.id); onSecret(null); }}
                >
                  <Avatar className="size-9 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary">{agent.name.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                      <span className="truncate">{agent.name}</span>
                      {workspace.boss_agent_id === agent.id && <Badge variant="outline">Boss</Badge>}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{agentHarnessLabel(agent)}</span>
                  </span>
                  <Badge variant={health.tone === "muted" ? "outline" : "secondary"} className="shrink-0">{health.label}</Badge>
                </Button>;
              })}
            </div> : <UiEmpty className="rounded-xl border border-dashed py-7">
              <EmptyHeader>
                <EmptyTitle>No agents connected</EmptyTitle>
                <EmptyDescription>Add an agent below to give your team a Stoic profile.</EmptyDescription>
              </EmptyHeader>
            </UiEmpty>}
          </CardContent>
          <Separator />
          <CardContent className="space-y-4 pt-4">
            <div>
              <h3 className="font-medium">Add an agent</h3>
              <p className="mt-1 text-sm text-muted-foreground">Give the profile a clear name and choose its harness.</p>
            </div>
            <form className="grid gap-4" onSubmit={(event) => add(event).catch(() => {})}>
              <Field>
                <FieldLabel htmlFor="new-agent-name">Agent name</FieldLabel>
                <Input id="new-agent-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="For example, Research assistant" minLength={2} maxLength={80} required />
              </Field>
              <Field>
                <FieldLabel htmlFor="new-agent-harness">Harness</FieldLabel>
                <Select value={harness} onValueChange={(value) => setHarness((value || "codex") as AgentHarnessId)}>
                  <SelectTrigger id="new-agent-harness"><SelectValue placeholder="Choose a harness" /></SelectTrigger>
                  <SelectContent>{AGENT_HARNESSES.map((option) => <SelectItem value={option.id} key={option.id}>{option.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              {harness === "other" && <Field>
                <FieldLabel htmlFor="new-agent-custom-harness">Harness name</FieldLabel>
                <Input id="new-agent-custom-harness" value={customHarnessName} onChange={(event) => setCustomHarnessName(event.target.value)} placeholder="For example, Local assistant" minLength={2} maxLength={60} required />
              </Field>}
              <Button type="submit" disabled={busy}>{busy ? "Adding agent…" : "Add agent"}</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Team rules</CardTitle>
            <CardDescription>These preferences apply to connected MCP agents.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field>
              <FieldLabel htmlFor="team-boss">Who leads?</FieldLabel>
              <Select value={boss || "none"} onValueChange={(value) => setBoss(!value || value === "none" ? "" : value)}>
                <SelectTrigger id="team-boss"><SelectValue placeholder="Choose a lead agent" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No boss yet</SelectItem>
                  {activeAgents.map((agent) => <SelectItem value={agent.id} key={agent.id} disabled={agent.platform === "muse"}>{agent.name}{agent.platform === "muse" ? " · browser relay only" : ""}</SelectItem>)}
                </SelectContent>
              </Select>
              <FieldDescription>Muse is a browser relay and cannot be selected as a boss.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="delegation-level">Delegation level</FieldLabel>
              <Select value={level} onValueChange={(value) => { if (value === "observe" || value === "propose" || value === "delegate") setLevel(value); }}>
                <SelectTrigger id="delegation-level"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="observe">Observe · updates only</SelectItem>
                  <SelectItem value="propose">Propose · owner approves assignments</SelectItem>
                  <SelectItem value="delegate">Delegate · boss assigns directly</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Alert className="border-amber-500/30 bg-amber-500/5">
              <AlertTitle>External actions still need your approval</AlertTitle>
              <AlertDescription>Muse can share browser-based project ideas, but it is not a verified MCP handoff or boss connection.</AlertDescription>
            </Alert>
            <Button type="button" variant="outline" disabled={busy} onClick={() => command("set_policy", { bossAgentId: boss || null, delegationLevel: level }).catch(() => {})}>Save team rules</Button>
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0">
        {selected ? <>
          <CardHeader className="border-b">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Set up {selected.name}</CardTitle>
              <Badge variant={selected.status === "connected" ? "secondary" : "outline"}>{isMuse ? (selected.status === "revoked" ? "Revoked" : selected.status === "connected" ? "Browser relay" : "Setup") : selected.status === "connected" ? (selected.last_check_at ? "Inbox check verified" : "Paired · check pending") : "Not connected"}</Badge>
            </div>
            <CardDescription>{agentHarnessLabel(selected)} · {isMuse ? "Muse does not have an MCP connection through this setup." : selected.status === "connected" ? selected.last_check_at ? "Stoic has received a successful inbox check." : "A key or OAuth profile is paired; the first check is still pending." : "Finish the connection steps to verify this profile."}</CardDescription>
          </CardHeader>
          <CardContent className="min-w-0 space-y-5 pt-5">
            {!isMuse && <AgentProofSummary agent={selected} />}
            {!isMuse && <AgentSetupProgress agent={selected} bossAgentId={workspace.boss_agent_id} handoffs={handoffs} onOpenIntake={() => onNavigate("assistant")} />}
            {isMuse ? <MuseBrowserSetup key={selected.id} dashboardUrl={typeof window !== "undefined" ? window.location.origin + "/login" : "https://stoic.bishoptech.dev/login"} /> : <>
              <AgentAccessEditor key={selected.id} agent={selected} busy={busy} command={command} />
              {selected.platform === "grok" && !isGrokBotHarness(selected.harness_name) && <Alert className="border-amber-500/30 bg-amber-500/5">
                <AlertTitle>Grok web is interactive-first</AlertTitle>
                <AlertDescription>Add Stoic through grok.com/connectors. A Business or Enterprise admin may need to provision it. This setup does not establish an unattended inbox schedule.</AlertDescription>
              </Alert>}
              {selected.platform === "grok" && isGrokBotHarness(selected.harness_name) && <Alert>
                <AlertTitle>Grok Bot routines are personal</AlertTitle>
                <AlertDescription>A routine runs as the person who created it and reports in that person’s Bot conversation. It is not a team-wide schedule; verify the saved routine and a successful Stoic inbox check.</AlertDescription>
              </Alert>}
              <AgentConnectionStep key={selected.id} agent={selected} endpoint={endpoint} busy={busy} secret={secret} issue={issue} />

              <Card id="agent-schedule-setup" size="sm" className="scroll-mt-6">
                <CardHeader className="sm:grid-cols-[1fr_auto]">
                  <div className="space-y-1">
                    <CardTitle>2 · Inbox schedule</CardTitle>
                    <CardDescription>{selected.last_check_at ? "The connection passed a successful server check. Set a cadence in the agent’s own scheduler." : "Complete the one-time check above, then set a cadence in the agent’s own scheduler."} Use {agentScheduleSetupLabel(selected.harness_name, selected.platform)}. The agent uses its provider account and model allowance; Stoic cannot wake an offline host.</CardDescription>
                  </div>
                  <Badge variant={selected.schedule_enabled ? "secondary" : "outline"}>{selected.schedule_enabled ? "Owner declared" : "Not declared"}</Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border border-border/80 bg-muted/30 p-3">
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-foreground"><code>{schedulePrompt}</code></pre>
                    <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => navigator.clipboard.writeText(schedulePrompt)}>Copy schedule prompt</Button>
                  </div>
                  <Accordion defaultValue={[]}>
                    <AccordionItem value="run-report" className="border-b-0">
                      <AccordionTrigger>Also report work outside scheduled checks</AccordionTrigger>
                      <AccordionContent>
                        <p className="mb-3 text-sm leading-6 text-muted-foreground">Add this to the agent’s persistent instructions so work outside its inbox schedule can reach the board.</p>
                        <div className="rounded-lg border border-border/80 bg-muted/30 p-3">
                          <pre className="whitespace-pre-wrap break-words text-xs leading-5 text-foreground"><code>{agentRunReportPrompt}</code></pre>
                          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => navigator.clipboard.writeText(agentRunReportPrompt)}>Copy run-report instruction</Button>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                  <Separator />
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Native schedule declaration</p>
                      <p className="text-xs leading-5 text-muted-foreground">This records your expectation; it does not prove the schedule is running.</p>
                    </div>
                    <Button
                      type="button"
                      variant={selected.schedule_enabled ? "secondary" : "outline"}
                      aria-pressed={selected.schedule_enabled}
                      disabled={!harnessHasDocumentedScheduler(selected.harness_name, selected.platform)}
                      onClick={() => command("set_schedule", { agentId: selected.id, enabled: !selected.schedule_enabled, cadenceMinutes: selected.schedule_cadence_minutes }).catch(() => {})}
                    >{selected.schedule_enabled ? "Schedule marked as set up" : "Mark schedule as set up"}</Button>
                  </div>
                  <Field>
                    <FieldLabel htmlFor="expected-inbox-cadence">Expected check cadence</FieldLabel>
                    <Select
                      value={String(selected.schedule_cadence_minutes)}
                      onValueChange={(value) => command("set_schedule", { agentId: selected.id, enabled: selected.schedule_enabled, cadenceMinutes: Number(value) }).catch(() => {})}
                      disabled={!harnessHasDocumentedScheduler(selected.harness_name, selected.platform)}
                    >
                      <SelectTrigger id="expected-inbox-cadence"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="60">Hourly</SelectItem>
                        {harnessSupports90MinuteCadence(selected.harness_name, selected.platform) && <SelectItem value="90">Every 90 minutes</SelectItem>}
                        <SelectItem value="360">Every 6 hours</SelectItem>
                        <SelectItem value="1440">Daily</SelectItem>
                      </SelectContent>
                    </Select>
                    <FieldDescription>Changing this expectation changes the setup prompt. Update the native schedule to match. Last inbox check: {timeAgo(selected.last_check_at)}.</FieldDescription>
                  </Field>
                  {!harnessHasDocumentedScheduler(selected.harness_name, selected.platform) && <p className="text-sm text-muted-foreground">This harness does not have a documented native scheduler in Stoic’s setup guide.</p>}
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader className="flex-row items-start gap-3">
                  <Badge variant="outline">3</Badge>
                  <div className="space-y-1">
                    <CardTitle>Try one handoff</CardTitle>
                    <CardDescription>Ask this agent to call check_inbox. Then make a small handoff and confirm it claims and reports back.</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            </>}
            <Alert variant="destructive">
              <AlertTitle>Remove this profile</AlertTitle>
              <AlertDescription>Revoking stops future access through this Stoic profile.</AlertDescription>
              <Button type="button" variant="destructive" size="sm" className="mt-3" disabled={busy} onClick={() => { if (confirm("Revoke " + selected.name + "? Its key and OAuth pairing will stop working.")) command("revoke_agent", { agentId: selected.id }).catch(() => {}); }}>Revoke this agent</Button>
            </Alert>
          </CardContent>
        </> : <CardContent className="py-8">
          <UiEmpty className="rounded-xl border border-dashed">
            <EmptyHeader>
              <EmptyTitle>Select an agent to get started</EmptyTitle>
              <EmptyDescription>Choose a team member to see its connection proof, access boundaries, and setup steps.</EmptyDescription>
            </EmptyHeader>
            {!activeAgents.length && <EmptyContent><p>Add your first agent from the form in Team members.</p></EmptyContent>}
          </UiEmpty>
        </CardContent>}
      </Card>
    </div>
  </div>;
}

function MuseBrowserSetup({ dashboardUrl }: { dashboardUrl: string }) {
  const [copyStatus, setCopyStatus] = useState("");
  const prompt = museRelayPrompt(dashboardUrl);
  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyStatus("Copied. Paste this into Muse after saving Stoic in its Secure Credentials.");
    } catch {
      setCopyStatus("Clipboard access failed. Allow clipboard access and try again.");
    }
  }

  return <div className="space-y-4">
    <Alert className="border-amber-500/30 bg-amber-500/5">
      <AlertTitle>Muse uses the browser in this setup</AlertTitle>
      <AlertDescription>This is not a Stoic MCP connection. Save your Stoic username and password in Muse’s stored credentials. The password is not saved in Stoic; Supabase Auth handles browser sign-in. Muse inherits the account’s full Stoic dashboard access. The prompt guides it to read and post project ideas, but that limit is not enforced by a separate Muse permission role. Use an account whose access is appropriate and supervise its first runs.</AlertDescription>
    </Alert>
    <Card size="sm">
      <CardHeader>
        <CardTitle>1 · Save your Stoic login in Muse</CardTitle>
        <CardDescription>After saving this agent profile, open Muse’s stored credentials and add your Stoic username or email and password. Keep them in that credential store only. Do not put either value in the prompt, agent notes, or regular chat.</CardDescription>
      </CardHeader>
    </Card>
    <Card>
      <CardHeader>
        <CardTitle>2 · Copy the relay instructions into Muse</CardTitle>
        <CardDescription>The prompt asks Muse to share concise project ideas three times a day and whenever you ask. Use a recurring browser task only if this Muse account visibly offers one, then verify its saved schedule and run history. Stoic cannot wake Muse or verify those runs.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/80 bg-muted/30 p-3 text-xs leading-5"><code>{prompt}</code></pre>
        <Button type="button" variant="outline" size="sm" onClick={() => copyPrompt().catch(() => {})}>Copy Muse setup prompt</Button>
        {copyStatus && <p className="text-sm text-muted-foreground" role="status" aria-live="polite">{copyStatus}</p>}
      </CardContent>
    </Card>
  </div>;
}

function AgentConnectionStep({ agent, endpoint, busy, secret, issue }: { agent: Agent; endpoint: string; busy: boolean; secret: { agentId: string; value: string; type: "key" | "code" } | null; issue: (type: "key" | "code") => Promise<void> }) {
  const [promptCopyStatus, setPromptCopyStatus] = useState("");
  const guide = agentConnectionGuide(agent.platform, endpoint, agent.harness_name || agentHarnessLabel(agent));
  const installPrompt = agentInstallPrompt(agent.harness_name || agentHarnessLabel(agent), endpoint, agent.schedule_cadence_minutes);
  const oauthCommand = agent.platform === "codex" ? "codex mcp add stoic-connector --url " + endpoint
    : agent.platform === "hermes" ? "hermes mcp add stoic-connector --url " + endpoint + " --auth oauth"
    : agent.platform === "openclaw" ? "openclaw mcp add stoic-connector --url " + endpoint + " --transport streamable-http --auth oauth" : null;

  function generateKey() {
    if (agent.status === "connected" && !confirm("Create a new Stoic key for " + agent.name + "? Its previous key or OAuth pairing will stop working. You will need to test this connection again.")) return;
    void issue("key").catch(() => {});
  }

  async function copyHermesInstallPrompt() {
    try {
      const prompt = agent.platform === "hermes"
        ? hermesInstallPrompt(endpoint) + "\n\nAfter confirming the connection, add these persistent Stoic instructions:\n\n" + stoicAgentInstructions()
        : installPrompt;
      await navigator.clipboard.writeText(prompt);
      setPromptCopyStatus("Copied. Paste it into the " + agentHarnessLabel(agent) + " installation you want to connect.");
    } catch {
      setPromptCopyStatus("Clipboard access failed. Allow clipboard access and try again.");
    }
  }

  return <Card id="agent-connection" className="scroll-mt-6">
    <CardHeader>
      <CardTitle>1 · Connect the MCP server</CardTitle>
      <CardDescription>Give this installation its own Stoic key. Add the server URL in your agent’s MCP settings, then store the key there as an HTTP bearer credential. Stoic never needs credentials for the other apps that agent uses.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="rounded-lg border border-border/80 bg-muted/30 p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">MCP server URL</p>
        <code className="block break-all text-xs">{endpoint}</code>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => navigator.clipboard.writeText(endpoint)}>Copy URL</Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" disabled={busy || agent.platform === "muse"} onClick={generateKey}>{agent.status === "connected" ? "Create or replace agent key" : "Generate agent key"}</Button>
        {agent.status === "connected" && <Badge variant="secondary">Replacing a key or OAuth pairing disconnects the previous installation.</Badge>}
      </div>
      {secret?.agentId === agent.id && secret.type === "key" && <Alert>
        <AlertTitle>Copy this key now. It will not appear again.</AlertTitle>
        <AlertDescription className="break-all font-mono">{secret.value}</AlertDescription>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => navigator.clipboard.writeText(secret.value)}>Copy key</Button>
      </Alert>}
      {guide && <Card size="sm">
        <CardHeader>
          <CardTitle>Set up {agentHarnessLabel(agent)}</CardTitle>
          <CardDescription>{guide.text}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border border-border/80 bg-muted/30 p-3">
            <pre className="whitespace-pre-wrap break-words text-xs leading-5"><code>{guide.code}</code></pre>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => navigator.clipboard.writeText(guide.code)}>Copy setup</Button>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">Or copy a ready-to-paste setup prompt. It includes the shared Stoic rules for ideas and contacts, and only describes scheduling when this harness has a verified native path.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => copyHermesInstallPrompt().catch(() => {})}>Copy {agentHarnessLabel(agent)} setup prompt</Button>
          {promptCopyStatus && <p className="text-sm text-muted-foreground" role="status" aria-live="polite">{promptCopyStatus}</p>}
          <Button type="button" variant="link" size="sm" render={<a href={guide.docs} target="_blank" rel="noopener noreferrer" />}>Platform setup reference</Button>
        </CardContent>
      </Card>}
      <p className="text-sm leading-6 text-muted-foreground">Use a different key for each agent profile. Replacing a key or switching to OAuth disconnects the previous installation. A fresh inbox check verifies the new connection.</p>
      {agent.status !== "revoked" && !agent.last_check_at && <Alert id="first-inbox-check" className="scroll-mt-6">
        <AlertTitle>{agent.status === "connected" ? "Verify the connection once" : "Check in after pairing"}</AlertTitle>
        <AlertDescription>{agent.status === "connected" ? "Paste this into the connected agent. Stoic marks it verified when check_inbox reaches the server; Stoic cannot wake an offline host." : "After you add the MCP server and save this agent’s key, paste this into that agent to confirm the connection."}</AlertDescription>
        <div className="mt-3 rounded-lg border border-border/80 bg-muted/30 p-3">
          <pre className="whitespace-pre-wrap break-words text-xs leading-5"><code>{FIRST_INBOX_CHECK_PROMPT}</code></pre>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => navigator.clipboard.writeText(FIRST_INBOX_CHECK_PROMPT)}>Copy first-check prompt</Button>
        </div>
      </Alert>}
      <Accordion defaultValue={[]}>
        <AccordionItem value="oauth" className="border-b-0">
          <AccordionTrigger>Advanced: OAuth pairing</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3">
              <p className="text-sm leading-6 text-muted-foreground">OAuth requires a client registered with Stoic. Contact support to register your client before using this path. After sign-in, generate a one-time pairing code and ask the agent to call pair_agent. Pairing disables this profile’s previous Stoic key.</p>
              {oauthCommand && <pre className="overflow-auto rounded-lg border border-border/80 bg-muted/30 p-3 text-xs"><code>{oauthCommand}</code></pre>}
              <Button type="button" variant="outline" size="sm" disabled={busy || agent.platform === "muse"} onClick={() => issue("code").catch(() => {})}>Generate pairing code</Button>
              {secret?.agentId === agent.id && secret.type === "code" && <Alert>
                <AlertTitle>Pairing code expires in 15 minutes.</AlertTitle>
                <AlertDescription className="font-mono">{secret.value}</AlertDescription>
                <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => navigator.clipboard.writeText(secret.value)}>Copy code</Button>
              </Alert>}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </CardContent>
  </Card>;
}

function AgentProofSummary({ agent }: { agent: Agent }) {
  const summary = agentConnectionSummary(agent);
  const checkOverdue = summary.proof.label === "Last check received · overdue now";

  return <Card aria-label={"Connection proof for " + agent.name}>
    <CardHeader className="sm:grid-cols-[1fr_auto]">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Connection proof</p>
        <CardTitle>What Stoic knows about this installation</CardTitle>
        <CardDescription>Server evidence, owner declarations, and host guidance stay visibly separate.</CardDescription>
      </div>
      <Badge variant="outline" className="h-auto max-w-full whitespace-normal py-1 text-left">{summary.proof.label}</Badge>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        <ProofItem label="Authentication" value={summary.auth.label} evidence={summary.auth.evidence === "server_record" ? "Server record" : "Not recorded"} />
        <ProofItem label="Stoic transport" value={summary.transport.label} evidence="Product config" />
        <ProofItem label="Host posture" value={summary.host.label} detail={summary.host.note} evidence="Provider guidance" />
        <ProofItem label="Schedule state" value={summary.schedule.label} evidence={summary.schedule.evidence === "owner_declared" ? "Owner declaration" : "Server record"} />
        <ProofItem label="Access notes" value={summary.access.label} evidence={summary.access.evidence === "owner_declared" ? "Owner declaration" : "Not recorded"} />
      </div>
      <Alert>
        <AlertDescription>{summary.proof.detail} A paired Stoic identity does not grant access to the apps, repositories, devices, or provider accounts named in the notes.</AlertDescription>
      </Alert>
      {checkOverdue && <Alert className="border-amber-500/30 bg-amber-500/5" role="status">
        <AlertTitle>Check the native schedule</AlertTitle>
        <AlertDescription>{agent.name} last checked {timeAgo(agent.last_check_at)}. Confirm the schedule is still enabled in its own host, then run one manual check. The schedule command below is specific to this agent.</AlertDescription>
        <div className="mt-3 rounded-lg border border-border/80 bg-muted/30 p-3">
          <pre className="whitespace-pre-wrap break-words text-xs leading-5"><code>{FIRST_INBOX_CHECK_PROMPT}</code></pre>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => navigator.clipboard.writeText(FIRST_INBOX_CHECK_PROMPT)}>Copy manual check prompt</Button>
        </div>
      </Alert>}
    </CardContent>
  </Card>;
}

function ProofItem({ label, value, detail, evidence }: { label: string; value: string; detail?: string; evidence: string }) {
  return <div className="min-w-0 rounded-lg border border-border/80 bg-muted/20 p-3">
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <p className="mt-1 break-words text-sm font-medium">{value}</p>
    {detail && <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>}
    <Badge variant="outline" className="mt-2">{evidence}</Badge>
  </div>;
}

function AgentAccessEditor({ agent, busy, command }: { agent: Agent; busy: boolean; command: (action: string, payload?: Record<string, unknown>) => Promise<unknown> }) {
  const [notes, setNotes] = useState(agent.access_notes || "");
  const changed = notes.trim() !== (agent.access_notes || "");

  async function save(event: FormEvent) {
    event.preventDefault();
    await command("set_agent_access", { agentId: agent.id, accessNotes: notes });
  }

  return <Card size="sm">
    <CardHeader>
      <CardTitle>What can {agent.name} access?</CardTitle>
      <CardDescription>Describe connected apps and the work this agent may do there. Other agents can use this to route work. These notes are owner-provided and do not grant or verify access.</CardDescription>
    </CardHeader>
    <CardContent>
      <form className="space-y-3" onSubmit={(event) => save(event).catch(() => {})}>
        <Field>
          <FieldLabel htmlFor={"access-" + agent.id}>Apps and boundaries</FieldLabel>
          <Textarea id={"access-" + agent.id} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} rows={3} placeholder="Example: GitHub repository access for code review; can open draft PRs. Ask me before merging or deploying." />
          <FieldDescription>Never paste API keys, passwords, tokens, or private account details here. Keep credentials in each agent’s own platform.</FieldDescription>
        </Field>
        <Button type="submit" variant="outline" size="sm" disabled={busy || !changed}>{busy ? "Saving access notes…" : "Save access notes"}</Button>
      </form>
    </CardContent>
  </Card>;
}

function ScheduleGuide({ agent, workspace }: { agent?: Agent; workspace: Workspace }) {
  if (!agent || !["codex", "hermes", "openclaw"].includes(agent.platform)) return null;

  const prompt = schedulePromptFor(agent, workspace);
  const interval = agent.schedule_cadence_minutes === 1440 ? "24h" : agent.schedule_cadence_minutes === 360 ? "6h" : agent.schedule_cadence_minutes === 90 ? "90m" : "1h";
  const cadenceLabel = agent.schedule_cadence_minutes === 1440 ? "day" : agent.schedule_cadence_minutes === 360 ? "6 hours" : agent.schedule_cadence_minutes === 90 ? "90 minutes" : "hour";
  const command = agent.platform === "hermes"
    ? "hermes cron create 'every " + interval + "' " + shellQuote(prompt) + " --name " + shellQuote("Stoic inbox - " + agent.name) + " --deliver local"
    : agent.platform === "openclaw"
      ? "openclaw cron add --every " + interval + " --message " + shellQuote(prompt) + " --name " + shellQuote("Stoic inbox - " + agent.name) + " --session isolated --no-deliver"
      : "In Codex, ask: Create a recurring automation every " + cadenceLabel + " with this prompt: " + prompt;

  return <Card>
    <CardHeader className="sm:grid-cols-[1fr_auto]">
      <div className="space-y-1">
        <CardTitle>Native schedule setup</CardTitle>
        <CardDescription>{agent.last_check_at ? "The first inbox check succeeded. Add this prompt to the agent’s native scheduler for recurring runs." : "Complete the one-time first check in the setup steps above, then add this prompt to the agent’s native scheduler."}</CardDescription>
      </div>
      <Badge variant={agent.last_check_at ? "secondary" : "outline"}>{agent.last_check_at ? "First check complete" : "First check pending"}</Badge>
    </CardHeader>
    <CardContent className="space-y-3">
      <div className="rounded-lg border border-border/80 bg-muted/30 p-3">
        <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words text-xs leading-5"><code>{command}</code></pre>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => navigator.clipboard.writeText(command)}>Copy schedule setup</Button>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">The schedule runs in your agent account. Stoic shows a successful check only after check_inbox reaches the server.</p>
    </CardContent>
  </Card>;
}

function AgentCheckHistory({ agent, activity }: { agent?: Agent; activity: CheckActivity[] }) {
  if (!agent) return null;

  const checks = activity.filter((entry) => entry.actor_key === "agent:" + agent.id).slice(0, 5);

  return <Card>
    <CardHeader>
      <CardTitle>Recent inbox checks</CardTitle>
      <CardDescription>Successful calls to Stoic from {agent.name}. A check does not mean every handoff is complete.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-3">
      {checks.length ? checks.map((entry) => <Card size="sm" key={entry.id}>
        <CardContent className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">{timeAgo(entry.created_at)}</p>
            <p className="text-sm text-muted-foreground">Successful inbox check</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{entry.details.handoffCount ?? 0} active handoffs</Badge>
            <Badge variant="outline">{entry.details.unreadProjectCount ?? 0} projects with unread discussion</Badge>
          </div>
        </CardContent>
      </Card>) : <UiEmpty className="rounded-xl border border-dashed py-6">
        <EmptyHeader>
          <EmptyTitle>{agent.last_check_at ? "Detailed history is unavailable" : "No check-ins yet"}</EmptyTitle>
          <EmptyDescription>{agent.last_check_at ? "Last successful check: " + timeAgo(agent.last_check_at) + ". The next successful check_inbox call will appear here." : "The next successful check_inbox call will appear here."}</EmptyDescription>
        </EmptyHeader>
      </UiEmpty>}
    </CardContent>
  </Card>;
}

function ProjectsView({ projects, handoffs, agents, busy, command, onNavigate }: { projects: Project[]; handoffs: Handoff[]; agents: Agent[]; busy: boolean; command: (action: string, payload?: Record<string, unknown>) => Promise<unknown>; onNavigate: (tab: Tab) => void }) {
  const [selectedId, setSelectedId] = useState(projects[0]?.id || "");
  const [newName, setNewName] = useState("");
  const [brief, setBrief] = useState(projects[0]?.brief || "");
  const selected = useMemo(() => projects.find((project) => project.id === selectedId) || projects[0], [projects, selectedId]);
  const agentNames = Object.fromEntries(agents.map((agent) => [agent.id, agent.name]));
  const projectHandoffs = handoffs.filter((handoff) => handoff.project_id === selected?.id && handoff.status !== "canceled");
  const activeCount = projectHandoffs.filter((handoff) => handoff.status !== "accepted").length;
  const lanes = [
    { label: "Ready", statuses: ["assigned", "proposed"] },
    { label: "In progress", statuses: ["claimed"] },
    { label: "Needs review", statuses: ["submitted", "blocked", "changes_requested"] },
    { label: "Done", statuses: ["accepted"] },
  ];

  async function createProject(event: FormEvent) {
    event.preventDefault();
    if (!newName.trim()) return;
    const created = await command("create_project", { name: newName.trim() }) as Project;
    setSelectedId(created.id);
    setBrief(created.brief || "");
    setNewName("");
  }

  function selectProject(value: string | null) {
    const project = projects.find((item) => item.id === value);
    if (!project) return;
    setSelectedId(project.id);
    setBrief(project.brief);
  }

  return <div className="space-y-5 sm:space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <Badge variant="secondary">Work in motion</Badge>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Projects</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">Follow assignments from the first handoff through review. Each project keeps the shared context and work your agents need.</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:min-w-64">
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Projects</p><p className="mt-1 text-xl font-semibold tabular-nums">{projects.length}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Tasks in this project</p><p className="mt-1 text-xl font-semibold tabular-nums">{projectHandoffs.length}</p></CardContent></Card>
      </div>
    </header>

    <Card>
      <CardHeader className="gap-1">
        <CardTitle>Project space</CardTitle>
        <CardDescription>Choose a project to view its work and shared context, or create a new one.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 sm:items-end">
        {projects.length ? <Field>
          <FieldLabel htmlFor="project-space-select">Current project</FieldLabel>
          <Select value={selected?.id || ""} onValueChange={selectProject}>
            <SelectTrigger id="project-space-select" aria-label="Choose a project"><SelectValue placeholder="Choose a project" /></SelectTrigger>
            <SelectContent>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent>
          </Select>
          <FieldDescription>Switching projects changes the board and shared brief below.</FieldDescription>
        </Field> : <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Create a project to give your agents a shared workspace.</div>}
        <form className="flex min-w-0 items-end gap-2" onSubmit={(event) => createProject(event).catch(() => {})}>
          <Field className="min-w-0 flex-1">
            <FieldLabel htmlFor="new-project-name">New project</FieldLabel>
            <Input id="new-project-name" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Project name" minLength={2} maxLength={100} required />
          </Field>
          <Button type="submit" disabled={busy || newName.trim().length < 2}>Add project</Button>
        </form>
      </CardContent>
    </Card>

    {selected ? <>
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle>{selected.name} · work board</CardTitle>
            <CardDescription>{activeCount} active {activeCount === 1 ? "task" : "tasks"} and {projectHandoffs.length - activeCount} completed</CardDescription>
          </div>
          <Button type="button" variant="outline" onClick={() => onNavigate("handoffs")}>Open handoffs</Button>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {lanes.map((lane) => {
            const items = projectHandoffs.filter((handoff) => lane.statuses.includes(handoff.status)).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
            return <section className="flex min-w-0 flex-col gap-3 rounded-xl border bg-muted/30 p-3" key={lane.label}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">{lane.label}</h3>
                <Badge variant="secondary" className="tabular-nums">{items.length}</Badge>
              </div>
              {items.length ? items.map((handoff) => <Card className="min-w-0 shadow-none" key={handoff.id}>
                <CardHeader className="gap-2 p-3">
                  <Badge variant="outline" className="w-fit capitalize">{handoff.status.replaceAll("_", " ")}</Badge>
                  <CardTitle className="text-sm leading-5"><AssistantRichInline text={handoff.title} /></CardTitle>
                  <CardDescription>{handoff.assigned_agent_id ? agentNames[handoff.assigned_agent_id] || "Assigned agent" : "Team queue · open to workers"} · updated {timeAgo(handoff.updated_at)}</CardDescription>
                </CardHeader>
                <CardFooter className="px-3 pb-3 pt-0">
                  <Button type="button" variant="ghost" size="sm" className="px-0" onClick={() => onNavigate("handoffs")}>View handoff</Button>
                </CardFooter>
              </Card>) : <div className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">No tasks here yet.</div>}
            </section>;
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Shared project brief</CardTitle>
            <Badge variant="secondary">Shared with agents</Badge>
          </div>
          <CardDescription>Version {selected.brief_version} · current decisions and reference information every agent reads.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field>
            <FieldLabel htmlFor="project-brief">What should every agent know?</FieldLabel>
            <Textarea id="project-brief" value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="Project goal, decisions already made, important links, voice or style guidelines, constraints…" maxLength={20000} rows={10} />
            <FieldDescription>{brief.length.toLocaleString()} / 20,000 characters</FieldDescription>
          </Field>
          <div className="flex justify-end">
            <Button type="button" disabled={busy || brief === selected.brief} onClick={() => command("update_brief", { projectId: selected.id, brief, expectedVersion: selected.brief_version }).catch(() => {})}>Save brief</Button>
          </div>
        </CardContent>
      </Card>
    </> : <Card>
      <UiEmpty className="border-0">
        <EmptyHeader>
          <EmptyTitle>Create your first project</EmptyTitle>
          <EmptyDescription>Projects give your agents a shared brief and a place to track handoffs.</EmptyDescription>
        </EmptyHeader>
      </UiEmpty>
    </Card>}
  </div>;
}

function IdeasView({ projects, agents, ideas, workspace, busy, command }: { projects: Project[]; agents: Agent[]; ideas: Idea[]; workspace: Workspace; busy: boolean; command: (action: string, payload?: Record<string, unknown>) => Promise<unknown> }) {
  const [projectId, setProjectId] = useState("all");
  const [status, setStatus] = useState<Idea["status"] | "all">("pending");
  const [timezoneOverride, setTimezoneOverride] = useState<string | null>(null);
  const timezone = timezoneOverride ?? workspace.ideas_timezone ?? "UTC";
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState("__none__");
  const [olderIdeas, setOlderIdeas] = useState<Idea[]>([]);
  const [ideaOverrides, setIdeaOverrides] = useState<Map<string, Idea>>(() => new Map());
  const [nextOffset, setNextOffset] = useState<number | null>(ideas.length === 200 ? 200 : null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const projectNames = Object.fromEntries(projects.map((project) => [project.id, project.name]));
  const workers = agents.filter((agent) => agent.status === "connected" && agent.id !== workspace.boss_agent_id && agent.platform !== "muse");
  const selectedWorker = workers.find((agent) => agent.id === selectedWorkerId);
  const hasWorkers = workers.length > 0;
  const loadedIdeas = useMemo(() => {
    const merged = new Map<string, Idea>();
    for (const idea of olderIdeas) merged.set(idea.id, idea);
    for (const idea of ideas) merged.set(idea.id, idea);
    for (const [id, idea] of ideaOverrides) merged.set(id, idea);
    return [...merged.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [ideas, ideaOverrides, olderIdeas]);
  const visibleIdeas = loadedIdeas.filter((idea) => (projectId === "all" || idea.project_id === projectId) && (status === "all" || idea.status === status))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const loadOlderIdeas = useCallback(async () => {
    if (nextOffset === null || historyLoading) return;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const response = await fetch(`/api/ideas?offset=${nextOffset}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not load older ideas");
      const page = json.data as Idea[];
      setOlderIdeas((current) => {
        const merged = new Map(current.map((idea) => [idea.id, idea]));
        for (const idea of page) merged.set(idea.id, idea);
        return [...merged.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
      });
      setNextOffset(typeof json.nextOffset === "number" ? json.nextOffset : null);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Could not load older ideas");
    } finally {
      setHistoryLoading(false);
    }
  }, [historyLoading, nextOffset]);

  async function reviewIdea(idea: Idea, action: "assign_idea" | "archive_idea") {
    const payload = action === "assign_idea" ? { ideaId: idea.id, agentId: selectedWorkerId } : { ideaId: idea.id };
    const result = await command(action, payload);
    const updated = action === "assign_idea" ? (result as { idea?: Idea })?.idea : result as Idea;
    if (updated?.id) setIdeaOverrides((current) => new Map(current).set(idea.id, updated));
    setSelectedIdea(null);
    setSelectedWorkerId("__none__");
  }

  const cardClass = "min-w-0 border-[var(--dash-line)] !bg-[var(--dash-panel)] !text-[var(--dash-text)] ring-[var(--dash-line)] shadow-none";
  const controlClass = "border-[var(--dash-line)] bg-[var(--dash-panel)] text-[var(--dash-text)] placeholder:text-[var(--dash-muted)] focus-visible:ring-[var(--dash-accent)]";
  const selectClass = "w-full border-[var(--dash-line)] bg-[var(--dash-panel)] text-[var(--dash-text)]";
  const statusLabel = (value: Idea["status"]) => value === "pending" ? "Needs review" : value === "accepted" ? "Handoff created" : "Denied";

  return <div className="space-y-5 sm:space-y-6">
    <header className="max-w-3xl space-y-2">
      <Badge variant="secondary" className="bg-[var(--dash-soft)] text-[var(--dash-muted)]">Owner review</Badge>
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--dash-text)] sm:text-3xl">Ideas</h1>
      <p className="max-w-[65ch] text-sm leading-6 text-[var(--dash-muted)]">Review each source-grounded suggestion, open its details, then assign it to a connected worker or deny it.</p>
    </header>

    <Card className={cardClass}>
      <CardHeader className="gap-4 border-b border-[var(--dash-line)] lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-lg">For your review</CardTitle>
          <CardDescription className="text-[var(--dash-muted)]">{visibleIdeas.length} {visibleIdeas.length === 1 ? "idea" : "ideas"} in this view · select a row to review its evidence and next step</CardDescription>
        </div>
        <Field className="w-full max-w-xs">
          <FieldLabel className="text-[var(--dash-text)]">Project</FieldLabel>
          <Select value={projectId} onValueChange={(value) => setProjectId(value || "all")}>
            <SelectTrigger aria-label="Filter ideas by project" className={selectClass}><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All projects</SelectItem>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter ideas by status">
          {(["pending", "accepted", "archived", "all"] as const).map((item) => <Button type="button" variant={status === item ? "secondary" : "outline"} size="sm" className={status === item ? "bg-[var(--dash-soft)] text-[var(--dash-text)]" : "border-[var(--dash-line)] text-[var(--dash-muted)]"} key={item} aria-pressed={status === item} onClick={() => setStatus(item)}>
            {item === "all" ? "All" : statusLabel(item)}{item !== "all" && <Badge variant="outline" className="ml-1 border-[var(--dash-line)] px-1.5 text-[var(--dash-muted)]">{loadedIdeas.filter((idea) => idea.status === item).length}</Badge>}
          </Button>)}
        </div>
        {visibleIdeas.length ? <div className="overflow-hidden rounded-xl border border-[var(--dash-line)]">
          <Table>
            <TableHeader className="bg-[var(--dash-bg)]">
              <TableRow className="border-[var(--dash-line)] hover:bg-transparent">
                <TableHead className="text-[var(--dash-muted)]">Idea</TableHead>
                <TableHead className="text-[var(--dash-muted)]">Project</TableHead>
                <TableHead className="text-[var(--dash-muted)]">Status</TableHead>
                <TableHead className="text-[var(--dash-muted)]">Added</TableHead>
                <TableHead className="text-right text-[var(--dash-muted)]">Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleIdeas.map((idea) => <TableRow key={idea.id} className="cursor-pointer border-[var(--dash-line)]" onClick={() => { setSelectedIdea(idea); setSelectedWorkerId("__none__"); }}>
                <TableCell className="max-w-[28rem] whitespace-normal">
                  <button type="button" aria-haspopup="dialog" className="text-left font-medium text-[var(--dash-text)] hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--dash-accent)]" onClick={(event) => { event.stopPropagation(); setSelectedIdea(idea); setSelectedWorkerId("__none__"); }}>
                    <AssistantRichInline text={idea.title} />
                  </button>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--dash-muted)]">{idea.summary}</p>
                </TableCell>
                <TableCell className="text-[var(--dash-muted)]">{projectNames[idea.project_id] || "Project"}</TableCell>
                <TableCell><Badge variant={idea.status === "pending" ? "secondary" : "outline"} className="border-[var(--dash-line)] bg-[var(--dash-soft)] text-[var(--dash-text)]">{statusLabel(idea.status)}</Badge></TableCell>
                <TableCell><time dateTime={idea.created_at} className="text-xs text-[var(--dash-muted)]">{timeAgo(idea.created_at)}</time></TableCell>
                <TableCell className="text-right"><span className="text-xs font-medium text-[var(--dash-accent)]">{idea.status === "pending" ? "Open review" : "View details"}</span></TableCell>
              </TableRow>)}
            </TableBody>
          </Table>
        </div> : <UiEmpty className="min-h-56 border border-dashed border-[var(--dash-line)] bg-[var(--dash-bg)] text-[var(--dash-text)]">
          <EmptyHeader><EmptyTitle>{status === "pending" ? "No ideas need review" : "Nothing in this view"}</EmptyTitle><EmptyDescription className="max-w-lg text-[var(--dash-muted)]">Stoic keeps each day&apos;s suggestions as their own records. Older ideas stay in the history after assignment or denial.</EmptyDescription></EmptyHeader>
        </UiEmpty>}
        {historyError && <Alert variant="destructive" className="!bg-[var(--dash-panel)]"><AlertTitle>Could not load older ideas</AlertTitle><AlertDescription>{historyError}</AlertDescription></Alert>}
        {nextOffset !== null && <Button type="button" variant="outline" size="sm" className="w-full border-[var(--dash-line)] text-[var(--dash-text)]" onClick={() => loadOlderIdeas().catch(() => {})} disabled={historyLoading}>{historyLoading ? "Loading older ideas…" : "Load older ideas"}</Button>}
      </CardContent>
    </Card>

    <Dialog open={selectedIdea !== null} onOpenChange={(open) => { if (!open) { setSelectedIdea(null); setSelectedWorkerId("__none__"); } }}>
      {selectedIdea && <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto border-[var(--dash-line)] bg-[var(--dash-panel)] text-[var(--dash-text)] sm:max-w-2xl">
        <DialogHeader className="pr-8">
          <div className="flex flex-wrap items-center gap-2"><Badge variant={selectedIdea.status === "pending" ? "secondary" : "outline"} className="border-[var(--dash-line)] bg-[var(--dash-soft)] text-[var(--dash-text)]">{statusLabel(selectedIdea.status)}</Badge><span className="text-xs text-[var(--dash-muted)]">{projectNames[selectedIdea.project_id] || "Project"} · {timeAgo(selectedIdea.created_at)}</span></div>
          <DialogTitle className="text-xl leading-7"><AssistantRichInline text={selectedIdea.title} /></DialogTitle>
          <DialogDescription className="leading-6 text-[var(--dash-muted)]"><AssistantRichText text={selectedIdea.summary} /></DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <section className="rounded-lg border border-[var(--dash-line)] bg-[var(--dash-bg)] p-4"><h3 className="mb-1 text-sm font-semibold">Why now</h3><div className="text-sm leading-6 text-[var(--dash-muted)]"><AssistantRichText text={selectedIdea.why_now} /></div></section>
          <section className="rounded-lg border border-[var(--dash-line)] bg-[var(--dash-bg)] p-4"><h3 className="mb-1 text-sm font-semibold">First step</h3><div className="text-sm leading-6 text-[var(--dash-muted)]"><AssistantRichText text={selectedIdea.next_step} /></div></section>
          <section className="space-y-2"><div className="flex items-center gap-2"><h3 className="text-sm font-semibold">Source evidence</h3><Badge variant="outline" className="border-[var(--dash-line)] text-[var(--dash-muted)]">{selectedIdea.evidence_ids.length}</Badge></div>{selectedIdea.evidence_ids.length ? <ul className="grid gap-2 text-xs text-[var(--dash-muted)] sm:grid-cols-2">{selectedIdea.evidence_ids.map((source) => <li key={source} className="break-all rounded-md border border-[var(--dash-line)] bg-[var(--dash-bg)] px-3 py-2">{source}</li>)}</ul> : <p className="text-sm text-[var(--dash-muted)]">No evidence references were attached.</p>}</section>
          {selectedIdea.status === "pending" && <section className="space-y-3 rounded-lg border border-[var(--dash-line)] bg-[var(--dash-bg)] p-4">
            <div><h3 className="text-sm font-semibold">Assign this idea</h3><p className="mt-1 text-xs leading-5 text-[var(--dash-muted)]">Choose a connected worker for {projectNames[selectedIdea.project_id] || "this project"}. Assignment creates a handoff for that worker.</p></div>
            <Field>
              <FieldLabel htmlFor="idea-worker" className="text-[var(--dash-text)]">Connected worker</FieldLabel>
              <Select value={selectedWorkerId} onValueChange={(value) => setSelectedWorkerId(value || "__none__")} disabled={busy || !hasWorkers || workspace.delegation_level === "observe"}>
                <SelectTrigger id="idea-worker" aria-label="Choose a connected worker" className={selectClass}><SelectValue placeholder="Choose a worker" /></SelectTrigger>
                <SelectContent><SelectItem value="__none__" disabled>Choose a worker</SelectItem>{workers.map((agent) => <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            {!hasWorkers && <Alert className="border-[var(--dash-line)] bg-[var(--dash-panel)]"><AlertDescription className="text-[var(--dash-muted)]">Connect an eligible MCP worker before assigning this idea.</AlertDescription></Alert>}
            {workspace.delegation_level === "observe" && <Alert className="border-[var(--dash-line)] bg-[var(--dash-panel)]"><AlertDescription className="text-[var(--dash-muted)]">Your workspace is in Observe mode. Change the delegation level before creating a handoff.</AlertDescription></Alert>}
          </section>}
          {selectedIdea.status === "accepted" && <p className="text-xs text-[var(--dash-muted)]">Handoff {selectedIdea.accepted_handoff_id ? `#${selectedIdea.accepted_handoff_id.slice(0, 8)}` : "created"} from this idea.</p>}
          {selectedIdea.status === "archived" && <p className="text-xs text-[var(--dash-muted)]">This idea was denied and kept in your history.</p>}
        </div>
        <DialogFooter className="border-t border-[var(--dash-line)] pt-4 sm:justify-between">
          {selectedIdea.status === "pending" ? <>
            <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => reviewIdea(selectedIdea, "archive_idea").catch(() => {})}>Deny idea</Button>
            <Button type="button" disabled={busy || !selectedWorker || workspace.delegation_level === "observe"} onClick={() => reviewIdea(selectedIdea, "assign_idea").catch(() => {})}>{busy ? "Assigning…" : selectedWorker ? `Assign to ${selectedWorker.name}` : "Choose a worker"}</Button>
          </> : <Button type="button" variant="outline" onClick={() => setSelectedIdea(null)}>Close</Button>}
        </DialogFooter>
      </DialogContent>}
    </Dialog>

    <Card className={cardClass}>
      <CardHeader>
        <Badge variant="secondary" className="w-fit bg-[var(--dash-soft)] text-[var(--dash-muted)]">Daily schedule</Badge>
        <CardTitle className="text-lg">Keep the morning calm</CardTitle>
        <CardDescription className="max-w-3xl leading-6 text-[var(--dash-muted)]">The server checks hourly and prepares ideas once after 8 AM in this time zone. Stoic&apos;s own scheduled run does not wake your agents or use their provider accounts.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Field>
          <FieldLabel htmlFor="ideas-timezone" className="text-[var(--dash-text)]">Workspace time zone</FieldLabel>
          <FieldDescription className="text-[var(--dash-muted)]">Use an IANA time zone, such as America/Chicago.</FieldDescription>
          <Input id="ideas-timezone" className={controlClass} value={timezone} onChange={(event) => setTimezoneOverride(event.target.value)} placeholder="America/Chicago" maxLength={100} />
        </Field>
        <Button type="button" variant="outline" size="sm" className="border-[var(--dash-line)] text-[var(--dash-text)]" disabled={busy || !timezone.trim() || timezone === workspace.ideas_timezone} onClick={() => command("set_ideas_timezone", { timezone }).then(() => setTimezoneOverride(null)).catch(() => {})}>Save time zone</Button>
      </CardContent>
    </Card>
  </div>;
}



function BoardView(props: { projects: Project[]; agents: Agent[]; messages: BoardMessage[]; busy: boolean; command: (action: string, payload?: Record<string, unknown>) => Promise<unknown>; refresh: () => Promise<void> }) {
  return <BoardDiscussionView {...props} />;
}

function RoutingView({ projects, agents, bossAgentId, busy, command }: { projects: Project[]; agents: Agent[]; bossAgentId: string | null; busy: boolean; command: (action: string, payload?: Record<string, unknown>) => Promise<unknown> }) {
  const workers = agents.filter((agent) => agent.status === "connected" && agent.id !== bossAgentId && agent.platform !== "muse");
  const workerNames = Object.fromEntries(workers.map((agent) => [agent.id, agent.name]));

  return <div className="space-y-5 sm:space-y-6">
    <header className="space-y-2">
      <Badge variant="secondary">Project settings</Badge>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Project routing</h1>
      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">Choose a connected MCP worker for each project. When the boss creates a handoff without an assignee, Stoic uses that project’s default.</p>
    </header>

    {!projects.length ? <Card><UiEmpty className="border-0">
      <EmptyHeader>
        <EmptyTitle>No projects yet</EmptyTitle>
        <EmptyDescription>Create a project before choosing where its unassigned handoffs should go.</EmptyDescription>
      </EmptyHeader>
    </UiEmpty></Card> : <>
      {!workers.length && <Alert>
        <AlertTitle>No connected workers are available</AlertTitle>
        <AlertDescription>Connect an eligible MCP worker in Agents, then return here to set a project default. Projects can still use the team queue.</AlertDescription>
      </Alert>}
      <div className="grid gap-3 md:grid-cols-2">
        {projects.map((project) => {
          const assignedWorker = project.default_agent_id ? workerNames[project.default_agent_id] : undefined;
          const hasUnavailableDefault = Boolean(project.default_agent_id && project.default_agent_id !== bossAgentId && !assignedWorker);
          return <Card className="min-w-0" key={project.id}>
            <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <CardTitle className="truncate">{project.name}</CardTitle>
                <CardDescription>{assignedWorker ? "New unassigned handoffs go to " + assignedWorker + "." : "New unassigned handoffs stay in the team queue."}</CardDescription>
              </div>
              <Badge variant={assignedWorker ? "secondary" : "outline"}>{assignedWorker ? "Default worker" : "Team queue"}</Badge>
            </CardHeader>
            <CardContent className="space-y-2">
              {hasUnavailableDefault && <Alert>
                <AlertTitle>Current worker is unavailable</AlertTitle>
                <AlertDescription>Choose a connected worker or select No default to return this project to the team queue.</AlertDescription>
              </Alert>}
              <Field>
                <FieldLabel htmlFor={"routing-" + project.id}>Default worker</FieldLabel>
                <Select value={assignedWorker ? project.default_agent_id || "__none__" : "__none__"} disabled={busy} onValueChange={(value) => command("set_project_routing", { projectId: project.id, agentId: value === "__none__" ? null : value || null }).catch(() => {})}>
                  <SelectTrigger id={"routing-" + project.id} aria-label={"Default worker for " + project.name}><SelectValue placeholder="No default agent" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No default agent</SelectItem>
                    {workers.map((agent) => <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FieldDescription>Only connected MCP workers can be selected. The boss remains the handoff creator.</FieldDescription>
              </Field>
            </CardContent>
          </Card>;
        })}
      </div>
    </>}
  </div>;
}

type ArtifactFilter = "all" | "document" | "image" | "audio" | "video" | "archive" | "other";
const artifactFilters: { id: ArtifactFilter; label: string }[] = [
  { id: "all", label: "All" }, { id: "document", label: "Documents" }, { id: "image", label: "Images" },
  { id: "audio", label: "Audio" }, { id: "video", label: "Video" }, { id: "archive", label: "Archives" }, { id: "other", label: "Other" },
];
function artifactCategory(artifact: Artifact): Exclude<ArtifactFilter, "all"> {
  const mime = artifact.mime_type.toLowerCase();
  const extension = artifact.name.split(".").at(-1)?.toLowerCase() || "";
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "avif", "tif", "tiff", "gif", "heic", "svg"].includes(extension)) return "image";
  if (mime.startsWith("audio/") || ["mp3", "wav", "m4a", "aac", "ogg"].includes(extension)) return "audio";
  if (mime.startsWith("video/") || ["mp4", "webm", "mov", "m4v"].includes(extension)) return "video";
  if (mime === "application/zip" || ["zip", "7z", "rar", "tar", "gz"].includes(extension)) return "archive";
  if (canPreviewTextArtifact(artifact.name, mime) || mime.includes("pdf") || mime.includes("wordprocessing") || mime.includes("spreadsheet") || mime.includes("presentation") || ["txt", "md", "csv", "json", "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(extension)) return "document";
  return "other";
}
function artifactPreview(artifact: Artifact) {
  const mime = artifact.mime_type.toLowerCase();
  if (canPreviewTextArtifact(artifact.name, mime) || ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.openxmlformats-officedocument.presentationml.presentation"].includes(mime)) return "Stoic can preview this file for a handoff draft.";
  if (/\.(?:env(?:\..*)?|pem|key|p8|p12|pfx|crt|cer|der|keystore|jks|kdbx)$/i.test(artifact.name)) return "Credentials and private-key files are never previewed by Stoic.";
  if (canPreviewImageArtifact(artifact.name, mime)) return "Stoic can review this image when preparing a handoff draft.";
  if (["audio/webm", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/m4a"].includes(mime)) return "Stoic can transcribe this audio when preparing a handoff draft.";
  return "Shared as an attachment for agents; Stoic does not preview this file type.";
}

function FilesView({ projects, handoffs, artifacts, busy, command, setNotice, onManageProjects }: { projects: Project[]; handoffs: Handoff[]; artifacts: Artifact[]; busy: boolean; command: (action: string, payload?: Record<string, unknown>) => Promise<unknown>; setNotice: (value: string) => void; onManageProjects: () => void }) {
  const [projectId, setProjectId] = useState(projects[0]?.id || "");
  const [handoffId, setHandoffId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState<ArtifactFilter>("all");
  const [query, setQuery] = useState("");
  const [artifactToDelete, setArtifactToDelete] = useState<Artifact | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const uploadKey = useRef<string | null>(null);

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    uploadKey.current ||= crypto.randomUUID();
    setUploading(true);
    try {
      const mimeType = safeArtifactMime(file.type);
      const reservation = await command("reserve_artifact", { projectId, handoffId: handoffId || undefined, name: file.name, mimeType, sizeBytes: file.size, idempotencyKey: uploadKey.current }) as { artifact: { id: string; status: string }; uploadUrl: string | null };
      if (reservation.uploadUrl) {
        const response = await fetch(reservation.uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: file });
        if (!response.ok) {
          try { await command("complete_artifact", { artifactId: reservation.artifact.id }); }
          catch { throw new Error("File upload failed"); }
        } else await command("complete_artifact", { artifactId: reservation.artifact.id });
      }
      uploadKey.current = null;
      setFile(null);
      setNotice("File is ready to share with your agents.");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function download(id: string) {
    const data = await command("artifact_download", { artifactId: id }) as { downloadUrl: string };
    window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
  }

  async function deleteArtifact() {
    if (!artifactToDelete) return;
    const target = artifactToDelete;
    setDeletingId(target.id);
    try {
      await command("delete_artifact", { artifactId: target.id });
      setNotice("File deleted.");
    } catch {
      // The dashboard command surface owns the error state.
    } finally {
      setDeletingId(null);
      setArtifactToDelete(null);
    }
  }

  const normalizedQuery = query.trim().toLowerCase();
  const filteredArtifacts = artifacts.filter((artifact) => {
    if (filter !== "all" && artifactCategory(artifact) !== filter) return false;
    if (!normalizedQuery) return true;
    const projectName = projects.find((project) => project.id === artifact.project_id)?.name || "";
    const handoffTitle = handoffs.find((handoff) => handoff.id === artifact.handoff_id)?.title || "";
    return (artifact.name + " " + projectName + " " + handoffTitle).toLowerCase().includes(normalizedQuery);
  });
  const sizeLabel = (bytes: number) => bytes >= 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB";

  return <div className="space-y-5 sm:space-y-6">
    <header className="space-y-2">
      <Badge variant="secondary">Shared files</Badge>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Artifacts</h1>
      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">Keep source files, notes, and work products together for the agents who need them.</p>
    </header>

    <Card>
      <CardHeader className="gap-2">
        <CardTitle>Share a file</CardTitle>
        <CardDescription>Project files appear in agents’ unread project updates at their next check. A handoff file is available to that handoff’s worker, the boss, and you. Any file type can be attached up to 25 MB. Stoic previews common text, RTF, PDF, DOCX, XLSX, PPTX, OpenDocument, image, and audio formats; other files remain available to agents but do not receive an intake preview.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!projects.length ? <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">Create a project before uploading so Stoic knows where the file belongs.</p>
          <Button type="button" variant="outline" onClick={onManageProjects}>Set up a project</Button>
        </div> : <form className="grid gap-4 md:grid-cols-2" onSubmit={(event) => upload(event).catch(() => {})}>
          <Field>
            <FieldLabel htmlFor="artifact-project">Project</FieldLabel>
            <Select value={projectId} onValueChange={(value) => { setProjectId(value || ""); setHandoffId(""); uploadKey.current = null; }}>
              <SelectTrigger id="artifact-project"><SelectValue placeholder="Choose a project" /></SelectTrigger>
              <SelectContent>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="artifact-handoff">Handoff (optional)</FieldLabel>
            <Select value={handoffId || "__none__"} onValueChange={(value) => { setHandoffId(value === "__none__" ? "" : value || ""); uploadKey.current = null; }}>
              <SelectTrigger id="artifact-handoff"><SelectValue placeholder="Project file, visible to its agents" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No specific handoff</SelectItem>
                {handoffs.filter((handoff) => handoff.project_id === projectId).map((handoff) => <SelectItem key={handoff.id} value={handoff.id}>{handoff.title}</SelectItem>)}
              </SelectContent>
            </Select>
            <FieldDescription>A handoff attachment follows that handoff’s access rules.</FieldDescription>
          </Field>
          <Field className="md:col-span-2">
            <FieldLabel htmlFor="artifact-file">Choose a file</FieldLabel>
            <Input id="artifact-file" aria-label="Choose any file up to 25 MB" type="file" onChange={(event) => { setFile(event.target.files?.[0] || null); uploadKey.current = null; }} required />
            <FieldDescription>{file ? file.name + " · " + sizeLabel(file.size) : "Any file type, up to 25 MB."}</FieldDescription>
          </Field>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between md:col-span-2">
            <p className="text-sm text-muted-foreground" role="status">{uploading ? "Sending file…" : "Files are shared only with the project or handoff participants."}</p>
            <Button type="submit" disabled={busy || uploading || !file}>{uploading ? "Sending…" : "Upload file"}</Button>
          </div>
        </form>}
      </CardContent>
    </Card>

    <Card>
      <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <CardTitle>Shared files</CardTitle>
          <CardDescription>{artifacts.length} {artifacts.length === 1 ? "file" : "files"} in this workspace</CardDescription>
        </div>
        <Field className="w-full sm:max-w-xs">
          <FieldLabel htmlFor="artifact-search">Search files</FieldLabel>
          <Input id="artifact-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, project, or handoff" />
        </Field>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter files by type">
          {artifactFilters.map((item) => {
            const count = item.id === "all" ? artifacts.length : artifacts.filter((artifact) => artifactCategory(artifact) === item.id).length;
            return <Button key={item.id} type="button" variant={filter === item.id ? "secondary" : "outline"} size="sm" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
              {item.label}<Badge variant="outline" className="ml-1 tabular-nums">{count}</Badge>
            </Button>;
          })}
        </div>
        {filteredArtifacts.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredArtifacts.map((artifact) => {
            const handoffTitle = handoffs.find((handoff) => handoff.id === artifact.handoff_id)?.title;
            const category = artifactCategory(artifact);
            const categoryLabel = artifactFilters.find((item) => item.id === category)?.label || "Other";
            return <Card className="min-w-0 shadow-none" key={artifact.id}>
              <CardHeader className="gap-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="secondary">{categoryLabel}</Badge>
                  <time className="shrink-0 text-xs text-muted-foreground" dateTime={artifact.created_at}>{timeAgo(artifact.created_at)}</time>
                </div>
                <CardTitle className="break-words text-base leading-5" title={artifact.name}>{artifact.name}</CardTitle>
                <CardDescription className="break-words">{projects.find((project) => project.id === artifact.project_id)?.name || "Project"}{handoffTitle ? " · " + handoffTitle : " · Project file"} · {sizeLabel(artifact.size_bytes)}</CardDescription>
              </CardHeader>
              <CardContent className="flex h-full flex-col gap-4">
                <p className="min-h-10 text-sm text-muted-foreground">{artifactPreview(artifact)}</p>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => download(artifact.id).catch(() => {})}>Download</Button>
                  <Button type="button" variant="destructive" size="sm" disabled={busy || deletingId === artifact.id} onClick={() => setArtifactToDelete(artifact)}>Delete</Button>
                </div>
              </CardContent>
            </Card>;
          })}
        </div> : <UiEmpty className="rounded-xl border border-dashed">
          <EmptyHeader>
            <EmptyTitle>{artifacts.length ? "No matching files" : "No files shared yet"}</EmptyTitle>
            <EmptyDescription>{artifacts.length ? "Try a different search or file type." : "Upload a file for your agents to use. Stoic previews supported formats and keeps other types as downloadable attachments."}</EmptyDescription>
          </EmptyHeader>
          {!artifacts.length && <EmptyContent><p className="text-muted-foreground">Choose a project and file above to add the first shared artifact.</p></EmptyContent>}
        </UiEmpty>}
      </CardContent>
    </Card>

    <AlertDialog open={Boolean(artifactToDelete)} onOpenChange={(open) => { if (!open && deletingId === null) setArtifactToDelete(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this shared file?</AlertDialogTitle>
          <AlertDialogDescription>{artifactToDelete ? <><strong>{artifactToDelete.name}</strong> will no longer be available for agent downloads. This action cannot be undone.</> : "This file will no longer be available for agent downloads."}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deletingId !== null}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={deletingId !== null} onClick={(event) => { event.preventDefault(); deleteArtifact().catch(() => {}); }}>{deletingId ? "Deleting…" : "Delete file"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}

function BillingView({ workspace, monthlyPrice, usage, busy, command }: { workspace: Workspace; monthlyPrice?: number | null; usage: { handoffs: number; storageBytes: number }; busy: boolean; command: (action: string, payload?: Record<string, unknown>) => Promise<unknown> }) {
  async function portal() {
    const result = await command("billing_portal") as { url: string };
    window.location.href = result.url;
  }

  const storageLabel = (usage.storageBytes / 1024 / 1024).toFixed(1) + " MB";
  const isActive = workspace.plan === "pro";

  return <div className="space-y-5 sm:space-y-6">
    <header className="space-y-2">
      <Badge variant="secondary">Workspace membership</Badge>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Plan & billing</h1>
      <p className="max-w-2xl text-sm leading-6 text-muted-foreground">Manage the subscription for your whole agent workspace and export its data.</p>
    </header>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
      <Card>
        <CardHeader className="sm:grid-cols-[1fr_auto]">
          <div className="space-y-1">
            <CardTitle>Stoic Connector</CardTitle>
            <CardDescription>{isActive ? "Your subscription is active." : "An active subscription is required to use coordination features."}</CardDescription>
          </div>
          <Badge variant={isActive ? "default" : "outline"}>{isActive ? "Active" : "Inactive"}</Badge>
        </CardHeader>
        <CardContent className="space-y-5">
          <Separator />
          <div className="grid gap-3 sm:grid-cols-3">
            <Card size="sm">
              <CardContent className="space-y-1 py-3">
                <p className="text-xs text-muted-foreground">Your current price</p>
                <p className="font-semibold tabular-nums">{monthlyPrice == null ? "See Stripe portal" : "$" + monthlyPrice + " / month"}</p>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardContent className="space-y-1 py-3">
                <p className="text-xs text-muted-foreground">Handoffs created this month</p>
                <p className="font-semibold tabular-nums">{usage.handoffs}</p>
              </CardContent>
            </Card>
            <Card size="sm">
              <CardContent className="space-y-1 py-3">
                <p className="text-xs text-muted-foreground">Private storage used</p>
                <p className="font-semibold tabular-nums">{storageLabel}</p>
              </CardContent>
            </Card>
          </div>
          <Alert>
            <AlertTitle>No monthly usage quotas</AlertTitle>
            <AlertDescription>Stoic does not apply monthly usage quotas or application-level request throttles. The counts above are for visibility.</AlertDescription>
          </Alert>
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Included workspace features</h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              <li className="rounded-lg border border-border/80 bg-muted/20 p-3 text-sm">Private files and project routing</li>
              <li className="rounded-lg border border-border/80 bg-muted/20 p-3 text-sm">Human approval controls and data export</li>
            </ul>
          </div>
          <div className="flex flex-wrap gap-2">
            {workspace.stripe_customer_id && <Button type="button" variant="outline" disabled={busy} onClick={() => portal().catch(() => {})}>{busy ? "Opening Stripe…" : "Manage billing"}</Button>}
            <Button type="button" variant="outline" render={<a href="/api/export" />}>Export workspace data</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Provider costs</CardTitle>
          <CardDescription>Native schedules run through each agent’s provider account.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm leading-6 text-muted-foreground">Agent provider subscriptions and model usage from native schedules are billed by those providers.</p>
          <Separator />
          <p className="text-sm leading-6 text-muted-foreground">Individual uploads are limited to 25 MB.</p>
        </CardContent>
      </Card>
    </div>
  </div>;
}
