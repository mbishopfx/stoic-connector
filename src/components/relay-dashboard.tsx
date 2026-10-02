"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { createBrowserClient } from "@supabase/ssr";
import {
  Bars3Icon,
  BookOpenIcon,
  ChatBubbleLeftRightIcon,
  ChatBubbleOvalLeftEllipsisIcon,
  ClipboardDocumentListIcon,
  CreditCardIcon,
  FolderIcon,
  LightBulbIcon,
  MoonIcon,
  PaperClipIcon,
  Squares2X2Icon,
  SunIcon,
  UserCircleIcon,
  UserGroupIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type Plan, type Platform } from "@/lib/config";
import { AGENT_HARNESSES, agentHarnessLabel, agentScheduleSetupLabel, harnessHasDocumentedScheduler, isGrokBotHarness, type AgentHarnessId } from "@/lib/agent-harness";
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
import { AgentSetupProgress } from "@/components/agent-setup-progress";
import { KnowledgeCenter } from "@/components/knowledge-center";

type Agent = { id: string; name: string; platform: Platform; harness_name?: string | null; status: string; oauth_client_id: string | null; access_notes: string; schedule_enabled: boolean; schedule_cadence_minutes: number; last_check_at: string | null; created_at: string };
type Project = { id: string; name: string; brief: string; brief_version: number; default_agent_id: string | null; created_at: string };
type Handoff = { id: string; project_id: string; assigned_agent_id: string | null; created_by_agent_id: string | null; title: string; goal: string; constraints: string; status: string; created_at: string; updated_at: string };
type Approval = { id: string; handoff_id: string; action_summary: string; status: string; created_at: string };
type Artifact = { id: string; project_id: string; handoff_id: string | null; name: string; mime_type: string; size_bytes: number; created_at: string };
type Event = { id: string; handoff_id: string; actor_key: string; event_type: string; body: string; created_at: string };
type HandoffHistoryFilters = { q: string; projectId: string; agentId: string; status: string };
type HandoffHistoryPage = { items: Handoff[]; nextCursor: string | null; hasMore: boolean; pageSize: number };
type HandoffHistoryDetail = { handoff: Handoff; events: Event[]; artifacts: Artifact[] };
type BoardMessage = { id: string; project_id: string; parent_id: string | null; author_key: string; kind: "message" | "run_report" | "suggestion" | "artifact"; body: string; created_at: string };
type Idea = { id: string; workspace_id: string; project_id: string; run_id: string; title: string; summary: string; why_now: string; next_step: string; evidence_ids: string[]; status: "pending" | "accepted" | "archived"; accepted_handoff_id: string | null; accepted_at: string | null; archived_at: string | null; created_at: string; updated_at: string };
type ContactSource = { id: string; source_label: string; source_url: string | null; notes: string; created_at: string };
type Contact = { id: string; project_id: string | null; full_name: string; email: string | null; phone: string | null; company: string | null; job_title: string | null; status: "new" | "contacted" | "qualified" | "customer" | "archived"; notes: string; created_at: string; updated_at: string; last_seen_at: string; sources: ContactSource[] };
type CheckActivity = { id: number; actor_key: string; details: { handoffCount?: number; unreadProjectCount?: number }; created_at: string };
type Workspace = { id: string; name: string; plan: Plan; stripe_customer_id: string | null; delegation_level: "observe" | "propose" | "delegate"; boss_agent_id: string | null; ideas_timezone: string | null };
type DashboardState = { user: { id: string; email: string }; workspace: Workspace | null; agents?: Agent[]; projects?: Project[]; handoffs?: Handoff[]; approvals?: Approval[]; artifacts?: Artifact[]; events?: Event[]; board?: BoardMessage[]; activity?: CheckActivity[]; ideas?: Idea[]; monthlyPrice?: number | null; usage?: { handoffs: number; storageBytes: number } };
type Tab = "assistant" | "ideas" | "overview" | "handoffs" | "board" | "contacts" | "agents" | "projects" | "knowledge" | "files" | "billing";

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

const navSections: { label: string; items: { id: Tab; label: string; icon: typeof Squares2X2Icon }[] }[] = [
  { label: "START", items: [
    { id: "assistant", label: "Stoic chat", icon: ChatBubbleOvalLeftEllipsisIcon },
    { id: "ideas", label: "Ideas", icon: LightBulbIcon },
  ] },
  { label: "WORK", items: [
    { id: "overview", label: "Overview", icon: Squares2X2Icon },
    { id: "handoffs", label: "Handoffs", icon: ClipboardDocumentListIcon },
    { id: "board", label: "Message board", icon: ChatBubbleLeftRightIcon },
    { id: "contacts", label: "Contacts", icon: UserCircleIcon },
    { id: "projects", label: "Projects", icon: FolderIcon },
  ] },
  { label: "TEAM", items: [
    { id: "agents", label: "Agents", icon: UserGroupIcon },
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

export function StoicDashboard({ email }: { email: string }) {
  const router = useRouter();
  const [state, setState] = useState<DashboardState | null>(null);
  const [tab, setTab] = useState<Tab>("assistant");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
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
    if (tab !== "agents" && tab !== "overview" && tab !== "assistant") return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void reload().catch(() => {});
    };
    if (tab !== "assistant") refreshWhenVisible();
    const refreshInterval = tab === "agents" ? 30_000 : 5 * 60_000;
    const timer = window.setInterval(refreshWhenVisible, refreshInterval);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [tab, reload]);
  useEffect(() => { const saved = window.localStorage.getItem("stoic-theme"); const frame = window.requestAnimationFrame(() => { if (saved === "dark" || saved === "light") setTheme(saved); }); return () => window.cancelAnimationFrame(frame); }, []);
  useEffect(() => {
    const syncTheme = (event: StorageEvent) => {
      if (event.key === "stoic-theme" && (event.newValue === "dark" || event.newValue === "light")) setTheme(event.newValue);
    };
    window.addEventListener("storage", syncTheme);
    return () => window.removeEventListener("storage", syncTheme);
  }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [tab]);

  function changeTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    window.localStorage.setItem("stoic-theme", next);
  }

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
  const names = Object.fromEntries(agents.map((a) => [a.id, a.name]));
  const projectNames = Object.fromEntries(projects.map((p) => [p.id, p.name]));
  const currentAgent = agents.find((a) => a.id === selectedAgent && a.status !== "revoked") || agents.find((a) => a.status !== "revoked");
  const dashboardGuidance = getDashboardGuidance({ agents, projects, handoffs, bossAgentId: workspace.boss_agent_id });
  const currentNavItem = nav.find((item) => item.id === tab) || nav[0];
  const CurrentNavIcon = currentNavItem.icon;

  function followDashboardGuidance(guidance: DashboardGuidance = dashboardGuidance) {
    if (guidance.agentId) setSelectedAgent(guidance.agentId);
    setTab(guidance.tab);
  }

  return <div className="dashboard-shell" data-theme={theme}>
    <aside className={`dashboard-sidebar ${menuOpen ? "open" : ""}`}>
      <div className="sidebar-top"><Link href="/" className="brand" aria-label="Stoic Connector home" title="Stoic Connector"><span className="brand-mark"><StoicMark /></span><span className="brand-wordmark">Stoic <strong>Connector</strong></span></Link><button className="icon-button mobile-close" onClick={() => setMenuOpen(false)} aria-label="Close navigation"><XMarkIcon width={18} height={18} /></button></div>
      <div className="workspace-switch" role="group" aria-label={`Workspace: ${workspace.name}`} title={workspace.name}><span className="workspace-initial">{workspace.name.charAt(0).toUpperCase()}</span><div><strong>{workspace.name}</strong><small>Team workspace</small></div></div>
      <div className="sidebar-navigation">{navSections.map((section) => <section className="sidebar-nav-section" key={section.label}><p className="sidebar-label">{section.label}</p><nav aria-label={section.label}>{section.items.map((item) => { const Icon = item.icon; return <button key={item.id} className={tab === item.id ? "active" : ""} aria-label={item.label} title={item.label} aria-current={tab === item.id ? "page" : undefined} onClick={() => { setTab(item.id); setMenuOpen(false); if (item.id === "board" || item.id === "ideas") void reload().catch(() => {}); }}><Icon className="nav-item-icon" aria-hidden="true" /><span className="nav-item-label">{item.label}</span>{item.id === "handoffs" && activeHandoffs.length > 0 && <span className="nav-count">{activeHandoffs.length}</span>}{item.id === "overview" && pendingApprovals.length > 0 && <span className="nav-count amber">{pendingApprovals.length}</span>}</button>; })}</nav></section>)}</div>
      <div className="sidebar-bottom"><div className="sidebar-help"><strong>Let the team work at its own pace.</strong><p>Agents pick up handoffs on their next successful schedule. Stoic cannot wake an offline agent.</p></div><button className="user-row" onClick={signOut} aria-label={`Sign out ${email}`} title={`Sign out ${email}`}><span className="user-avatar">{email.charAt(0).toUpperCase()}</span><span><strong>{email}</strong><small>Sign out</small></span></button></div>
    </aside>
    <div className="dashboard-main"><header className="dashboard-header"><button className="icon-button mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Bars3Icon width={20} height={20} /></button><div className="breadcrumb" role="img" aria-label={`${workspace.name} · ${currentNavItem.label}`} title={`${workspace.name} · ${currentNavItem.label}`}><CurrentNavIcon aria-hidden="true" /><span className="sr-only">{workspace.name} · {currentNavItem.label}</span></div><div className="header-right"><button className="icon-button theme-toggle" onClick={changeTheme} aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"} aria-pressed={theme === "dark"} title={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}>{theme === "light" ? <MoonIcon aria-hidden="true" /> : <SunIcon aria-hidden="true" />}</button><span className="user-avatar" aria-label={`Account: ${email}`} title={email}>{email.charAt(0).toUpperCase()}</span></div></header>
      <div className={`dashboard-content ${tab === "assistant" ? "assistant-content" : ""}`}>{error && <div className="alert error" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss">Dismiss</button></div>}{notice && <div className="alert success" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss">Dismiss</button></div>}
        {tab === "assistant" && <StoicIntake projects={projects} agents={agents} bossAgentId={workspace.boss_agent_id} guidance={dashboardGuidance} command={command} onHandoffCreated={() => { void reload().catch(() => {}); }} onViewHandoffs={() => setTab("handoffs")} onManageAgents={() => setTab("agents")} onOpenGuidance={() => followDashboardGuidance()} initialPrompt={intakeSeed?.prompt} initialProjectId={intakeSeed?.projectId} onPrefillConsumed={clearIntakeSeed} />}
        {tab === "ideas" && <IdeasView projects={projects} ideas={ideas} workspace={workspace} hasWorkers={agents.some((agent) => agent.status === "connected" && agent.id !== workspace.boss_agent_id && agent.platform !== "muse")} busy={busy} command={command} />}
        {tab === "contacts" && <ContactsView projects={projects} busy={busy} command={command} />}
        {tab === "overview" && <><div className="page-heading"><div><span className="eyebrow muted">YOUR COMMAND CENTER</span><h1>Good to see you.</h1><p>Here’s where your agents and their work stand today.</p></div><button className="button" onClick={() => setTab("assistant")}>Start with Stoic</button></div><BridgeGuide guidance={dashboardGuidance} onNavigate={(nextTab, agentId) => followDashboardGuidance({ ...dashboardGuidance, tab: nextTab, agentId })} /><div className="metric-grid"><Metric value={agents.filter((a) => a.status === "connected" && a.platform !== "muse").length} label="Active MCP credentials" detail="A successful inbox check verifies each connection" /><Metric value={activeHandoffs.length} label="Active handoffs" detail={`${state.usage?.handoffs || 0} created this month`} /><Metric value={pendingApprovals.length} label="Needs your review" detail="Approval requests and decisions" /></div><div className="overview-grid"><section className="panel"><div className="panel-heading"><div><h2>Handoffs in motion</h2><p>Work your team is handling now.</p></div><button className="subtle-link" onClick={() => setTab("handoffs")}>View all</button></div>{activeHandoffs.length ? <div className="compact-list">{activeHandoffs.slice(0, 5).map((item) => <div className="compact-item" key={item.id}><div><strong><AssistantRichInline text={item.title} /></strong><small>{(item.assigned_agent_id ? names[item.assigned_agent_id] : null) || "Team queue"} · {projectNames[item.project_id] || "Project"}</small></div><Status status={item.status} /></div>)}</div> : <Empty title="Nothing in motion" text="Active assignments appear here. Open Handoffs to review completed work or create another assignment." />}</section><section className="panel"><div className="panel-heading"><div><h2>Agent check-ins</h2><p>Know who is ready to receive work.</p></div><button className="subtle-link" onClick={() => setTab("agents")}>Manage</button></div>{agents.filter((a) => a.status !== "revoked").length ? <div className="compact-list">{agents.filter((a) => a.status !== "revoked").slice(0, 5).map((agent) => { const health = displayedAgentHealth(agent); return <div className="compact-item" key={agent.id}><span className={`platform-avatar ${agent.platform}`}>{agent.name.charAt(0)}</span><div><strong>{agent.name}{workspace.boss_agent_id === agent.id && <span className="boss-tag">BOSS</span>}</strong><small>{agentHarnessLabel(agent)} · {agent.platform === "muse" ? "browser relay" : `last check ${timeAgo(agent.last_check_at)}`}</small></div><span className={`health ${health.tone}`}><i />{health.label}</span></div>; })}</div> : <Empty title="Build your team" text="Add your first agent, then give it an identity in Stoic." />}</section></div>{pendingApprovals.length > 0 && <section className="panel review-panel"><div className="panel-heading"><div><h2>Needs your decision</h2><p>Agents cannot approve these on their behalf.</p></div></div>{pendingApprovals.map((approval) => <div className="approval-row" key={approval.id}><div><strong><AssistantRichInline text={approval.action_summary} /></strong><small>For {handoffs.find((h) => h.id === approval.handoff_id)?.title || "a handoff"}</small></div><div className="row-actions"><button className="button button-small" disabled={busy} onClick={() => command("decide_approval", { approvalId: approval.id, decision: "approved" }).catch(() => {})}>Approve</button><button className="button button-outline button-small" disabled={busy} onClick={() => command("decide_approval", { approvalId: approval.id, decision: "denied" }).catch(() => {})}>Deny</button></div></div>)}</section>}</>}
        {tab === "handoffs" && <HandoffsView agents={agents} projects={projects} handoffs={handoffs} events={events} artifacts={artifacts} bossAgentId={workspace.boss_agent_id} busy={busy} command={command} />}
        {tab === "board" && <BoardView projects={projects} agents={agents} messages={board} busy={busy} command={command} refresh={reload} />}
        {tab === "agents" && <><AgentsView agents={agents} workspace={workspace} handoffs={handoffs} busy={busy} selected={currentAgent} secret={secret} onSelect={setSelectedAgent} onSecret={setSecret} onNavigate={(nextTab) => setTab(nextTab)} command={command} /><ScheduleGuide agent={currentAgent} workspace={workspace} /><AgentCheckHistory agent={currentAgent} activity={activity} /></>}
        {tab === "projects" && <><ProjectsView projects={projects} handoffs={handoffs} agents={agents} busy={busy} command={command} onNavigate={setTab} /><RoutingView projects={projects} agents={agents} bossAgentId={workspace.boss_agent_id} busy={busy} command={command} /></>}
        {tab === "knowledge" && <KnowledgeCenter projects={projects} agents={agents} onManageProjects={() => setTab("projects")} />}
        {tab === "files" && <FilesView projects={projects} handoffs={handoffs} artifacts={artifacts} busy={busy} command={command} setNotice={setNotice} onManageProjects={() => setTab("projects")} />}
        {tab === "billing" && <BillingView workspace={workspace} monthlyPrice={state.monthlyPrice} usage={state.usage || { handoffs: 0, storageBytes: 0 }} busy={busy} command={command} />}
      </div>
    </div>
  </div>;
}

function BridgeGuide({ guidance, onNavigate }: { guidance: DashboardGuidance; onNavigate: (tab: DashboardGuideTab, agentId?: string) => void }) {
  const progress = Math.round((guidance.completedSteps / guidance.steps.length) * 100);
  return <section className="bridge-guide" aria-label="Get your agent team working together">
    <div className="bridge-guide-intro"><span className="eyebrow muted">ONE USEFUL NEXT STEP</span><h2>{guidance.title}</h2><p>{guidance.detail}</p><button className="button button-small" onClick={() => onNavigate(guidance.tab, guidance.agentId)}>{guidance.buttonLabel}</button></div>
    <div className="bridge-guide-progress"><div className="bridge-guide-progress-label"><strong>Team setup</strong><span>{guidance.completedSteps} of {guidance.steps.length} steps</span></div><div className="bridge-progress-track" role="progressbar" aria-label="Team setup progress" aria-valuemin={0} aria-valuemax={guidance.steps.length} aria-valuenow={guidance.completedSteps} aria-valuetext={`${guidance.completedSteps} of ${guidance.steps.length} steps complete`}><span style={{ width: `${progress}%` }} /></div><details><summary>See setup progress</summary><ol>{guidance.steps.map((step) => <li key={step.label} className={step.complete ? "done" : ""}><span>{step.complete ? "Done" : "Next"}</span><strong>{step.label}</strong></li>)}</ol><p>Access notes are optional. Add them only when they help the team understand an agent&apos;s available tools; never include credentials.</p></details></div>
  </section>;
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

function Metric({ value, label, detail }: { value: number; label: string; detail: string }) { return <div className="metric-card"><strong>{value}</strong><span>{label}</span><small>{detail}</small></div>; }
function Status({ status }: { status: string }) { return <span className={`status status-${status}`}>{status.replaceAll("_", " ")}</span>; }
function Empty({ title, text }: { title: string; text: string }) { return <div className="empty-state"><strong>{title}</strong><p>{text}</p></div>; }

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

  return <>
    <div className="page-heading"><div><span className="eyebrow muted">WORK IN MOTION</span><h1>Handoffs</h1><p>Search every project assignment, follow its complete timeline, and review the result.</p></div><button className="button" onClick={() => setShowForm(!showForm)}>{showForm ? "Close" : "New handoff"}</button></div>
    {showForm && <section className="panel form-panel"><h2>Make a handoff</h2>{!workers.length && <div className="callout warning"><strong>Connect a worker first.</strong><p>Connected workers can claim a shared handoff on their next inbox check. The first claim gives that worker sole ownership.</p></div>}<form className="form-grid" onSubmit={(event) => submit(event).catch(() => {})}><div><label htmlFor="handoff-project">Project</label><select id="handoff-project" value={projectId} onChange={(event) => { const next = projects.find((project) => project.id === event.target.value); setProjectId(event.target.value); setAssignedAgentId(next?.default_agent_id && workers.some((agent) => agent.id === next.default_agent_id) ? next.default_agent_id : workers[0]?.id || ""); }} required>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></div><div><label htmlFor="handoff-assignee">Who can take this?</label><select id="handoff-assignee" value={teamQueue ? "team_queue" : effectiveAssigneeId} onChange={(event) => { const next = event.target.value; setTeamQueue(next === "team_queue"); if (next !== "team_queue") setAssignedAgentId(next); }} required><option value="team_queue">All connected workers · first claim wins</option>{workers.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} only</option>)}</select></div><div className="full assignee-context" role="note"><strong>{teamQueue ? "Shared team queue" : selectedAssignee ? `${selectedAssignee.name}\u2019s access` : "Connect a worker first"}</strong><p>{teamQueue ? "Every connected worker can see this handoff on its next inbox check. The first to claim it becomes its sole owner." : selectedAssignee?.access_notes || "No app access has been described yet. Confirm what this agent can do before assigning work."}</p><small>{teamQueue ? "Stoic creates one handoff, so workers cannot accidentally receive duplicate copies." : "Owner-provided notes guide routing; the agent must verify live access and approval requirements."}</small></div><div className="full"><label htmlFor="handoff-title">Title</label><input id="handoff-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Research our launch options" minLength={3} maxLength={160} required /></div><div className="full"><label htmlFor="handoff-goal">What needs to be done?</label><textarea id="handoff-goal" value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Describe the outcome the agent should deliver…" minLength={10} maxLength={10000} required rows={4} /></div><div className="full"><label htmlFor="handoff-constraints">Constraints or decisions to keep in mind</label><textarea id="handoff-constraints" value={constraints} onChange={(event) => setConstraints(event.target.value)} placeholder="Budget, scope, approval boundaries…" maxLength={10000} rows={3} /></div><button className="button" disabled={busy || !projectId || !workers.length}>Create handoff</button></form></section>}
    <div className="handoff-layout">
      <section className="panel handoff-list">
        <div className="panel-heading"><div><h2>Handoff history</h2><p>{historyItems.length} loaded · newest first</p></div></div>
        <form className="handoff-history-filters" onSubmit={applyFilters}>
          <label className="history-search">Search titles and goals<input value={filterInput.q} onChange={(event) => setFilterInput((current) => ({ ...current, q: event.target.value }))} maxLength={120} placeholder="Try a project or task phrase" disabled={historyLoadingMore} /></label>
          <div className="history-filter-row">
            <label>Project<select value={filterInput.projectId} onChange={(event) => setFilterInput((current) => ({ ...current, projectId: event.target.value }))} disabled={historyLoadingMore}><option value="all">All projects</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
            <label>Agent<select value={filterInput.agentId} onChange={(event) => setFilterInput((current) => ({ ...current, agentId: event.target.value }))} disabled={historyLoadingMore}><option value="all">All agents</option><option value="unassigned">Team queue</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
            <label>Status<select value={filterInput.status} onChange={(event) => setFilterInput((current) => ({ ...current, status: event.target.value }))} disabled={historyLoadingMore}><option value="all">All statuses</option><option value="proposed">Proposed</option><option value="assigned">Assigned</option><option value="claimed">Claimed</option><option value="blocked">Blocked</option><option value="submitted">Submitted</option><option value="changes_requested">Changes requested</option><option value="accepted">Accepted</option><option value="canceled">Canceled</option></select></label>
          </div>
          <div className="history-filter-actions"><button className="button button-small" type="submit" disabled={historyLoading || historyLoadingMore}>Search history</button><button className="subtle-link" type="button" onClick={clearFilters} disabled={historyLoadingMore}>Clear filters</button></div>
        </form>
        {historyError && <p className="history-error" role="alert">{historyError}</p>}
        {historyLoading && !historyItems.length ? <p className="history-loading-note" role="status">Loading project handoffs…</p> : historyItems.length ? <div aria-busy={historyLoading} className="handoff-history-results">{historyItems.map((task) => <button key={task.id} className={`handoff-list-item ${selected?.id === task.id ? "selected" : ""}`} onClick={() => setSelectedId(task.id)}><span><strong><AssistantRichInline text={task.title} /></strong><small>{task.assigned_agent_id ? agentNames[task.assigned_agent_id] || "Agent" : task.status === "proposed" ? "Waiting for owner approval" : "Team queue · open to workers"} · {projects.find((project) => project.id === task.project_id)?.name || "Project"} · {timeAgo(task.updated_at)}</small></span><Status status={task.status} /></button>)}</div> : <Empty title={filters.q || filters.status !== "all" || filters.projectId !== "all" || filters.agentId !== "all" ? "No matching handoffs" : "Nothing handed off yet"} text={filters.q || filters.status !== "all" || filters.projectId !== "all" || filters.agentId !== "all" ? "Try a different phrase or clear the filters to see all project work." : "Start with one clear assignment to a connected agent."} />}
        {nextCursor && <div className="history-load-more"><button className="button button-outline button-small" onClick={() => loadOlder().catch(() => {})} disabled={historyLoadingMore}>{historyLoadingMore ? "Loading older handoffs…" : "Load older handoffs"}</button></div>}
        {!nextCursor && historyItems.length > 0 && <p className="history-end-note">All matching handoffs are loaded.</p>}
      </section>
      <section className="panel handoff-detail">
        {selected ? <>
          <div className="detail-top"><div><span className="eyebrow muted">{selectedProject?.name || "Project"}</span><h2><AssistantRichInline text={selected.title} /></h2><p>{selected.assigned_agent_id ? `Assigned to ${agentNames[selected.assigned_agent_id] || "Agent"}` : selected.status === "proposed" ? "Waiting for owner approval before workers can see this" : "Open to connected workers · first claim owns it"}</p></div><Status status={selected.status} /></div>
          <div className="handoff-run-summary"><span>Last activity</span><strong>{timeAgo(selected.updated_at)}</strong><span>Created</span><strong>{new Date(selected.created_at).toLocaleString()}</strong><span>Outcome</span><strong>{selected.status === "accepted" ? "Accepted by the owner" : selected.status === "submitted" ? "Waiting for owner review" : selected.status === "blocked" ? "Blocked · review the latest update" : selected.status === "changes_requested" ? "Changes requested" : selected.status === "canceled" ? "Canceled" : selected.status.replaceAll("_", " ")}</strong></div>
          <div className="detail-block"><span>GOAL</span><AssistantRichText text={selected.goal} /></div>
          {selected.constraints && <div className="detail-block"><span>CONSTRAINTS</span><AssistantRichText text={selected.constraints} /></div>}
          <div className="detail-block"><span>ACTIVITY</span>{detailError && <p className="history-error" role="alert">Could not load the complete timeline: {detailError}</p>}{!detailForSelected && !detailError && <p className="history-loading-note">Loading handoff activity…</p>}{detailForSelected && selectedEvents.length === 0 && <p className="history-loading-note">No updates have been posted yet.</p>}<div className="timeline">{selectedEvents.map((event) => { const actor = event.actor_key.startsWith("agent:") ? agentNames[event.actor_key.slice(6)] || "Agent" : event.actor_key.startsWith("user:") ? "You" : "Stoic"; return <div className="timeline-item" key={event.id}><i /><div><strong>{event.event_type.replaceAll("_", " ")}</strong><small>{actor} · {timeAgo(event.created_at)}</small>{event.body && <AssistantRichText text={event.body} />}</div></div>; })}</div></div>
          {selectedArtifacts.length > 0 && <div className="detail-block"><span>FILES</span><ul className="handoff-file-list">{selectedArtifacts.map((artifact) => <li key={artifact.id}>{artifact.name}</li>)}</ul></div>}
          <div className="detail-actions"><textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Add context for your agent…" rows={2} /><div><button className="button button-outline button-small" onClick={() => act("update").catch(() => {})} disabled={busy || body.trim().length < 2}>Post update</button>{selected.status === "submitted" && <><button className="button button-small" disabled={busy} onClick={() => act("accept").catch(() => {})}>Accept result</button><button className="button button-outline button-small" disabled={busy || body.trim().length < 2} onClick={() => act("request_changes").catch(() => {})}>Request changes</button></>}{selected.status === "proposed" && <button className="button button-small" disabled={busy} onClick={() => act("approve_assignment").catch(() => {})}>Approve assignment</button>}</div></div>
        </> : <Empty title="Select a handoff" text="Choose a task to see its complete trail." />}
      </section>
    </div>
  </>;
}

function AgentsView({ agents, workspace, handoffs, busy, selected, secret, onSelect, onSecret, onNavigate, command }: { agents: Agent[]; workspace: Workspace; handoffs: Handoff[]; busy: boolean; selected?: Agent; secret: { agentId: string; value: string; type: "key" | "code" } | null; onSelect: (id: string) => void; onSecret: (value: { agentId: string; value: string; type: "key" | "code" } | null) => void; onNavigate: (tab: Tab) => void; command: (action: string, payload?: Record<string, unknown>) => Promise<unknown> }) {
  const [name, setName] = useState("");
  const [harness, setHarness] = useState<AgentHarnessId>("codex");
  const [customHarnessName, setCustomHarnessName] = useState("");
  const [boss, setBoss] = useState(workspace.boss_agent_id || "");
  const [level, setLevel] = useState(workspace.delegation_level);
  const endpoint = typeof window !== "undefined" ? `${window.location.origin}/api/mcp` : "/api/mcp";
  const schedulePrompt = selected ? schedulePromptFor(selected, workspace) : "";
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

  return <>
    <div className="page-heading">
      <div><span className="eyebrow muted">STEP 2 OF 3 · YOUR TEAM</span><h1>Connect your agents</h1><p>Name each agent, choose its harness, and give it a role in the team.</p></div>
      <span className="count-pill">{agents.filter((agent) => agent.status === "connected" && agent.platform !== "muse").length} active MCP credentials</span>
    </div>
    <div className="agents-layout">
      <div>
        <section className="panel">
          <div className="panel-heading"><div><h2>Team members</h2><p>Each agent has its own Stoic profile and can be revoked independently.</p></div></div>
          <div className="agent-list">{agents.filter((agent) => agent.status !== "revoked").map((agent) => {
            const health = displayedAgentHealth(agent);
            return <button className={`agent-list-item ${selected?.id === agent.id ? "selected" : ""}`} key={agent.id} onClick={() => { onSelect(agent.id); onSecret(null); }}>
              <span className={`platform-avatar ${agent.platform}`}>{agent.name.charAt(0)}</span>
              <span><strong>{agent.name}{workspace.boss_agent_id === agent.id && <span className="boss-tag">BOSS</span>}</strong><small>{agentHarnessLabel(agent)}</small></span>
              <span className={`health ${health.tone}`}><i />{health.label}</span>
            </button>;
          })}</div>
          <form className="add-agent-form" onSubmit={(event) => add(event).catch(() => {})}>
            <h3>Add an agent</h3>
            <div className="form-row">
              <label>Your agent&apos;s name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="For example, Research assistant" minLength={2} maxLength={80} required /></label>
              <label>Which harness does it use?<select value={harness} onChange={(event) => setHarness(event.target.value as AgentHarnessId)}>{AGENT_HARNESSES.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}</select></label>
              {harness === "other" && <label>Harness name<input value={customHarnessName} onChange={(event) => setCustomHarnessName(event.target.value)} placeholder="For example, Local assistant" minLength={2} maxLength={60} required /></label>}
              <button className="button button-small" disabled={busy}>Add agent</button>
            </div>
          </form>
        </section>
        <section className="panel policy-panel">
          <div className="panel-heading"><div><h2>Team rules</h2><p>Your preferences are enforced by Stoic for connected MCP agents.</p></div></div>
          <label htmlFor="team-boss">Who leads?</label>
          <select id="team-boss" value={boss} onChange={(event) => setBoss(event.target.value)}>
            <option value="">No boss yet</option>
            {agents.filter((agent) => agent.status !== "revoked").map((agent) => <option value={agent.id} key={agent.id} disabled={agent.platform === "muse"}>{agent.name}{agent.platform === "muse" ? " · browser relay only" : ""}</option>)}
          </select>
          <label htmlFor="delegation-level">Delegation level</label>
          <select id="delegation-level" value={level} onChange={(event) => setLevel(event.target.value as Workspace["delegation_level"])}>
            <option value="observe">Observe — updates only</option><option value="propose">Propose — owner approves assignments</option><option value="delegate">Delegate — boss assigns directly</option>
          </select>
          <p className="field-help">Muse can share browser-based project ideas, but it is not a verified MCP handoff or boss connection. External actions still need your approval.</p>
          <button className="button button-small" disabled={busy} onClick={() => command("set_policy", { bossAgentId: boss || null, delegationLevel: level }).catch(() => {})}>Save team rules</button>
        </section>
      </div>
      <section className="panel setup-agent-panel">
        {selected ? <>
          {!isMuse && <AgentProofSummary agent={selected} />}
          <div className="panel-heading"><div><span className="eyebrow muted">AGENT SETUP</span><h2>Set up {selected.name}</h2><p>{agentHarnessLabel(selected)} · {isMuse ? (selected.status === "revoked" ? "Stoic profile revoked" : selected.status === "connected" ? "Browser relay setup · any prior MCP profile is unavailable" : "Browser relay setup · no MCP connection") : selected.status === "connected" ? selected.last_check_at ? "Verified by inbox check" : "Key or OAuth paired · awaiting first check" : "Not connected yet"}</p></div></div>
          {!isMuse && <AgentSetupProgress agent={selected} bossAgentId={workspace.boss_agent_id} handoffs={handoffs} onOpenIntake={() => onNavigate("assistant")} />}
          {isMuse
            ? <MuseBrowserSetup key={selected.id} dashboardUrl={typeof window !== "undefined" ? `${window.location.origin}/login` : "https://stoic.bishoptech.dev/login"} />
            : <>
              <AgentAccessEditor key={selected.id} agent={selected} busy={busy} command={command} />
              {selected.platform === "grok" && !isGrokBotHarness(selected.harness_name) && <div className="callout warning"><strong>Grok web is interactive-first.</strong><p>Add Stoic through grok.com/connectors. A Business or Enterprise admin may need to provision the connector first. This setup does not establish an unattended inbox schedule.</p></div>}
              {selected.platform === "grok" && isGrokBotHarness(selected.harness_name) && <div className="callout"><strong>Grok Bot routines are personal.</strong><p>A routine runs as the person who created it and reports in that person’s Bot conversation. It is not a team-wide schedule; verify the saved routine and a successful Stoic inbox check.</p></div>}
              <AgentConnectionStep key={selected.id} agent={selected} endpoint={endpoint} busy={busy} secret={secret} issue={issue} />
              <div id="agent-schedule-setup" className="setup-step"><span className="step-number">2</span><div>
                <h3>{selected.last_check_at ? "Set a calm inbox schedule" : "Next: set a calm inbox schedule"}</h3>
                <p>{selected.last_check_at ? "Your connection has passed a successful server check. Now choose a cadence in the agent’s own scheduler." : "First complete the one-time check above. Once Stoic records it, choose a cadence in the agent’s own scheduler."} Use {agentScheduleSetupLabel(selected.harness_name, selected.platform)}. The agent runs checks with its provider account and model allowance; Stoic records the last successful call but cannot wake an offline host. Choose a cadence that fits your provider costs.</p>
                <div className="prompt-box">{schedulePrompt}</div><button className="subtle-link" onClick={() => navigator.clipboard.writeText(schedulePrompt)}>Copy schedule prompt</button>
                <details className="advanced-pairing"><summary>Also report work outside scheduled checks</summary><p>Add this to the agent’s persistent instructions so work outside the scheduled inbox check also reaches the board.</p><div className="prompt-box">{agentRunReportPrompt}</div><button className="subtle-link" onClick={() => navigator.clipboard.writeText(agentRunReportPrompt)}>Copy run-report instruction</button></details>
                <div className="schedule-controls"><label><input type="checkbox" checked={selected.schedule_enabled} disabled={!harnessHasDocumentedScheduler(selected.harness_name, selected.platform)} onChange={(event) => command("set_schedule", { agentId: selected.id, enabled: event.target.checked, cadenceMinutes: selected.schedule_cadence_minutes }).catch(() => {})} /> I set up a native schedule</label><label>Check cadence <select aria-label="Expected inbox cadence" value={selected.schedule_cadence_minutes} disabled={!harnessHasDocumentedScheduler(selected.harness_name, selected.platform)} onChange={(event) => command("set_schedule", { agentId: selected.id, enabled: selected.schedule_enabled, cadenceMinutes: Number(event.target.value) }).catch(() => {})}><option value={60}>Hourly</option><option value={360}>Every 6 hours</option><option value={1440}>Daily</option></select></label></div>
                <p className="field-help">Changing this expectation also changes the setup prompt below. Update the native schedule in your agent to match. Last inbox check: {timeAgo(selected.last_check_at)}. Marking a schedule as set up does not prove it is running; a real check will update the time.</p>
              </div></div>
              <div className="setup-step"><span className="step-number">3</span><div><h3>Try one handoff</h3><p>Ask this agent to call <code>check_inbox</code>. Then make a small handoff and confirm it claims and reports back.</p></div></div>
            </>}
          <div className="setup-step agent-revoke-step"><span className="step-number">×</span><div><h3>Remove this profile</h3><p>Revoking stops future access through this Stoic profile.</p><button className="danger-link" disabled={busy} onClick={() => { if (confirm(`Revoke ${selected.name}? Its key and OAuth pairing will stop working.`)) command("revoke_agent", { agentId: selected.id }).catch(() => {}); }}>Revoke this agent</button></div></div>
        </> : <Empty title="Add your first agent" text="Choose an agent you use today and connect it to Stoic." />}
      </section>
    </div>
  </>;
}

function MuseBrowserSetup({ dashboardUrl }: { dashboardUrl: string }) {
  const [copyStatus, setCopyStatus] = useState("");
  const prompt = museRelayPrompt(dashboardUrl);
  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyStatus("Copied. Paste this into the Muse agent after saving Stoic in its Secure Credentials.");
    } catch {
      setCopyStatus("Clipboard access failed. Allow clipboard access and try again.");
    }
  }
  return <div className="muse-browser-setup">
    <div className="callout warning"><strong>Muse uses the browser in this setup.</strong><p>This is not a Stoic MCP connection. After you add this profile, save your Stoic username and password in Muse&apos;s stored credentials. The password is not saved in Stoic; Supabase Auth handles browser sign-in. Muse inherits the account&apos;s full Stoic dashboard access. The prompt guides it to read and post project ideas, but that limit is not enforced by a separate Muse permission role. Use an account whose access is appropriate and supervise its first runs.</p></div>
    <div className="setup-step"><span className="step-number">1</span><div><h3>Save your Stoic login in Muse</h3><p>After saving this agent profile, open Muse&apos;s stored credentials and add your Stoic username or email and password. Keep them in that credential store only. Do not put either value in the prompt, agent notes, or regular chat.</p></div></div>
    <div className="setup-step"><span className="step-number">2</span><div><h3>Copy the relay instructions into Muse</h3><p>The ready-to-paste prompt asks Muse to share concise project ideas three times a day and whenever you ask. Use a recurring browser task only if this Muse account visibly offers one, then verify its saved schedule and run history. Stoic cannot wake Muse or verify those runs.</p><div className="prompt-box muse-prompt-box">{prompt}</div><button className="button button-outline button-small" onClick={() => copyPrompt().catch(() => {})}>Copy Muse setup prompt</button>{copyStatus && <p className="field-help" role="status" aria-live="polite">{copyStatus}</p>}</div></div>
  </div>;
}
function AgentConnectionStep({ agent, endpoint, busy, secret, issue }: { agent: Agent; endpoint: string; busy: boolean; secret: { agentId: string; value: string; type: "key" | "code" } | null; issue: (type: "key" | "code") => Promise<void> }) {
  const [promptCopyStatus, setPromptCopyStatus] = useState("");
  const guide = agentConnectionGuide(agent.platform, endpoint, agent.harness_name || agentHarnessLabel(agent));
  const installPrompt = agentInstallPrompt(agent.harness_name || agentHarnessLabel(agent), endpoint, agent.schedule_cadence_minutes);
  const oauthCommand = agent.platform === "codex" ? `codex mcp add stoic-connector --url ${endpoint}`
    : agent.platform === "hermes" ? `hermes mcp add stoic-connector --url ${endpoint} --auth oauth`
    : agent.platform === "openclaw" ? `openclaw mcp add stoic-connector --url ${endpoint} --transport streamable-http --auth oauth` : null;
  function generateKey() {
    if (agent.status === "connected" && !confirm(`Create a new Stoic key for ${agent.name}? Its previous key or OAuth pairing will stop working. You will need to test this connection again.`)) return;
    void issue("key").catch(() => {});
  }
  async function copyHermesInstallPrompt() {
    try {
      const prompt = agent.platform === "hermes"
        ? `${hermesInstallPrompt(endpoint)}\n\nAfter confirming the connection, add these persistent Stoic instructions:\n\n${stoicAgentInstructions()}`
        : installPrompt;
      await navigator.clipboard.writeText(prompt);
      setPromptCopyStatus(`Copied. Paste it into the ${agentHarnessLabel(agent)} installation you want to connect.`);
    } catch {
      setPromptCopyStatus("Clipboard access failed. Allow clipboard access and try again.");
    }
  }
  return <div id="agent-connection" className="setup-step"><span className="step-number">1</span><div>
    <h3>Connect the MCP server</h3>
    <p>Give this installation its own Stoic key. Add the server URL in your agent&apos;s MCP settings, then store the key there as an HTTP bearer credential. Stoic never needs credentials for the other apps that agent uses.</p>
    <div className="copy-box"><code>{endpoint}</code><button onClick={() => navigator.clipboard.writeText(endpoint)} aria-label="Copy MCP URL">Copy</button></div>
    <button className="button button-outline button-small connection-key-button" disabled={busy || agent.platform === "muse"} onClick={generateKey}> {agent.status === "connected" ? "Create or replace agent key" : "Generate agent key"}</button>
    {secret?.agentId === agent.id && secret.type === "key" && <div className="secret-box"><strong>Copy this key now. It will not appear again.</strong><code>{secret.value}</code><button onClick={() => navigator.clipboard.writeText(secret.value)}>Copy key</button></div>}
    {guide && <div className="connection-guide"><strong>Set up {agentHarnessLabel(agent)}</strong><p>{guide.text}</p><div className="copy-box"><code>{guide.code}</code><button onClick={() => navigator.clipboard.writeText(guide.code)} aria-label={`Copy ${agentHarnessLabel(agent)} setup`}>Copy</button></div><div className="hermes-install-prompt"><p>Or copy a ready-to-paste setup prompt. It includes the shared Stoic rules for ideas and contacts, and only describes scheduling when this harness has a verified native path.</p><button className="button button-outline button-small" onClick={() => copyHermesInstallPrompt().catch(() => {})}>Copy {agentHarnessLabel(agent)} setup prompt</button>{promptCopyStatus && <p className="field-help" role="status" aria-live="polite">{promptCopyStatus}</p>}</div><a href={guide.docs} target="_blank" rel="noopener noreferrer">Platform setup reference </a></div>}
    <p className="field-help">Use a different key for each agent profile. Replacing a key or switching to OAuth disconnects the previous installation. A fresh inbox check verifies the new connection.</p>
    {agent.status !== "revoked" && !agent.last_check_at && <div id="first-inbox-check" className="connection-first-check"><div><strong>{agent.status === "connected" ? "Verify the connection once" : "Check in after pairing"}</strong><p>{agent.status === "connected" ? "Paste this into the connected agent. Stoic will mark it verified when check_inbox reaches the server; Stoic cannot wake an offline host." : "After you add the MCP server and save this agent’s key, paste this into that agent to confirm the connection."}</p></div><div className="copy-box"><code>{FIRST_INBOX_CHECK_PROMPT}</code><button onClick={() => navigator.clipboard.writeText(FIRST_INBOX_CHECK_PROMPT)}>Copy first-check prompt</button></div></div>}
    <details className="advanced-pairing"><summary>Advanced: OAuth pairing</summary><p>OAuth requires a client registered with Stoic. Contact support to register your client before using this path. After sign-in, generate a one-time pairing code and ask the agent to call <code>pair_agent</code>. Pairing disables this profile&apos;s previous Stoic key.</p>{oauthCommand && <code className="command-example">{oauthCommand}</code>}<button className="subtle-link" disabled={busy || agent.platform === "muse"} onClick={() => issue("code").catch(() => {})}>Generate pairing code</button>{secret?.agentId === agent.id && secret.type === "code" && <div className="secret-box"><strong>Pairing code expires in 15 minutes.</strong><code>{secret.value}</code><button onClick={() => navigator.clipboard.writeText(secret.value)}>Copy code</button></div>}</details>
  </div></div>;
}

function AgentProofSummary({ agent }: { agent: Agent }) {
  const summary = agentConnectionSummary(agent);
  const checkOverdue = summary.proof.label === "Last check received · overdue now";
  return <section className="agent-proof-summary" aria-label={`Connection proof for ${agent.name}`}>
    <div className="agent-proof-heading"><div><span className="eyebrow muted">CONNECTION PROOF</span><h3>What Stoic knows about this installation</h3><p>Server evidence, owner declarations, and host guidance stay visibly separate.</p></div><span className={`proof-badge ${summary.proof.tone}`}>{summary.proof.label}</span></div>
    <div className="agent-proof-grid">
      <ProofItem label="Authentication" value={summary.auth.label} evidence={summary.auth.evidence === "server_record" ? "Server record" : "Not recorded"} />
      <ProofItem label="Stoic transport" value={summary.transport.label} evidence="Product config" />
      <ProofItem label="Host posture" value={summary.host.label} detail={summary.host.note} evidence="Provider guidance" />
      <ProofItem label="Schedule state" value={summary.schedule.label} evidence={summary.schedule.evidence === "owner_declared" ? "Owner declaration" : "Server record"} />
      <ProofItem label="Access notes" value={summary.access.label} evidence={summary.access.evidence === "owner_declared" ? "Owner declaration" : "Not recorded"} />
    </div>
    <p className="agent-proof-note">{summary.proof.detail} A paired Stoic identity does not grant access to the apps, repositories, devices, or provider accounts named in the notes.</p>
    {checkOverdue && <div className="connection-first-check" role="status"><div><strong>Check the native schedule</strong><p>{agent.name} last checked {timeAgo(agent.last_check_at)}. Confirm the schedule is still enabled in its own host, then run one manual check. The schedule command below is specific to this agent.</p></div><div className="copy-box"><code>{FIRST_INBOX_CHECK_PROMPT}</code><button onClick={() => navigator.clipboard.writeText(FIRST_INBOX_CHECK_PROMPT)}>Copy manual check prompt</button></div></div>}
  </section>;
}

function ProofItem({ label, value, detail, evidence }: { label: string; value: string; detail?: string; evidence: string }) {
  return <div className="agent-proof-item"><span>{label}</span><strong>{value}</strong>{detail && <p>{detail}</p>}<small>{evidence}</small></div>;
}

function AgentAccessEditor({ agent, busy, command }: { agent: Agent; busy: boolean; command: (action: string, payload?: Record<string, unknown>) => Promise<unknown> }) {
  const [notes, setNotes] = useState(agent.access_notes || "");
  const changed = notes.trim() !== (agent.access_notes || "");
  async function save(event: FormEvent) {
    event.preventDefault();
    await command("set_agent_access", { agentId: agent.id, accessNotes: notes });
  }
  return <form className="agent-access-editor" onSubmit={(event) => save(event).catch(() => {})}>
    <div><h3>What can {agent.name} access?</h3><p>Describe connected apps and the work this agent may do there. Other agents can use this to route work. These notes are owner-provided and do not grant or verify access.</p></div>
    <label htmlFor={`access-${agent.id}`}>Apps and boundaries</label>
    <textarea id={`access-${agent.id}`} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} rows={3} placeholder="Example: GitHub repository access for code review; can open draft PRs. Ask me before merging or deploying." />
    <small>Never paste API keys, passwords, tokens, or private account details here. Keep credentials in each agent&apos;s own platform.</small>
    <button className="button button-outline button-small" disabled={busy || !changed}>Save access notes</button>
  </form>;
}

function ScheduleGuide({ agent, workspace }: { agent?: Agent; workspace: Workspace }) {
  if (!agent || !["codex", "hermes", "openclaw"].includes(agent.platform)) return null;
  const prompt = schedulePromptFor(agent, workspace);
  const interval = agent.schedule_cadence_minutes === 1440 ? "24h" : agent.schedule_cadence_minutes === 360 ? "6h" : "1h";
  const cadenceLabel = agent.schedule_cadence_minutes === 1440 ? "day" : agent.schedule_cadence_minutes === 360 ? "6 hours" : "hour";
  const command = agent.platform === "hermes"
    ? `hermes cron create 'every ${interval}' ${shellQuote(prompt)} --name ${shellQuote(`Stoic inbox - ${agent.name}`)} --deliver local`
    : agent.platform === "openclaw"
      ? `openclaw cron add --every ${interval} --message ${shellQuote(prompt)} --name ${shellQuote(`Stoic inbox - ${agent.name}`)} --session isolated --no-deliver`
      : `In Codex, ask: Create a recurring automation every ${cadenceLabel} with this prompt: ${prompt}`;
  return <section className="panel schedule-guide"><div className="panel-heading"><div><h2>Native schedule setup</h2><p>{agent.last_check_at ? "The first inbox check succeeded. Add this prompt to the agent’s native scheduler for recurring runs." : "Complete the one-time first check in the setup steps above, then add this prompt to the agent’s native scheduler."}</p></div></div><div className="copy-box"><code>{command}</code><button onClick={() => navigator.clipboard.writeText(command)} aria-label="Copy schedule setup">Copy</button></div><p className="field-help">The schedule runs in your agent account. Stoic shows a successful check only after <code>check_inbox</code> reaches the server.</p></section>;
}

function AgentCheckHistory({ agent, activity }: { agent?: Agent; activity: CheckActivity[] }) {
  if (!agent) return null;
  const checks = activity.filter((entry) => entry.actor_key === `agent:${agent.id}`).slice(0, 5);
  return <section className="panel schedule-guide"><div className="panel-heading"><div><h2>Recent inbox checks</h2><p>Successful calls to Stoic from {agent.name}. A check does not mean every handoff is complete.</p></div></div>{checks.length ? <div className="compact-list">{checks.map((entry) => <div className="compact-item" key={entry.id}><div><strong>{timeAgo(entry.created_at)}</strong><small>{entry.details.handoffCount ?? 0} active handoffs · {entry.details.unreadProjectCount ?? 0} projects with unread discussion</small></div></div>)}</div> : <p className="field-help">{agent.last_check_at ? `Last successful check: ${timeAgo(agent.last_check_at)}. Detailed history is not available for that check.` : "No check-ins yet."} The next successful <code>check_inbox</code> call will appear here.</p>}</section>;
}

function ProjectsView({ projects, handoffs, agents, busy, command, onNavigate }: { projects: Project[]; handoffs: Handoff[]; agents: Agent[]; busy: boolean; command: (action: string, payload?: Record<string, unknown>) => Promise<unknown>; onNavigate: (tab: Tab) => void }) {
  const [selectedId, setSelectedId] = useState(projects[0]?.id || "");
  const [newName, setNewName] = useState("");
  const [brief, setBrief] = useState(projects[0]?.brief || "");
  const selected = useMemo(() => projects.find((project) => project.id === selectedId) || projects[0], [projects, selectedId]);
  const agentNames = Object.fromEntries(agents.map((agent) => [agent.id, agent.name]));
  const projectHandoffs = handoffs.filter((handoff) => handoff.project_id === selected?.id && handoff.status !== "canceled");
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

  return <>
    <div className="page-heading"><div><span className="eyebrow muted">WORK IN MOTION</span><h1>Projects</h1><p>Follow each agent’s assignments from the first handoff through review.</p></div><span className="count-pill">{projects.length} projects · {projectHandoffs.length} active and completed tasks</span></div>
    <section className="panel project-selector"><div className="panel-heading"><div><h2>Project space</h2><p>Choose a project to view its work and shared context.</p></div></div><div className="project-switcher">{projects.map((project) => <button key={project.id} className={`project-chip ${selected?.id === project.id ? "selected" : ""}`} onClick={() => { setSelectedId(project.id); setBrief(project.brief); }}>{project.name}</button>)}<form className="add-project" onSubmit={(event) => createProject(event).catch(() => {})}><input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="New project name" minLength={2} maxLength={100} required /><button className="subtle-link add-project-button" aria-label="Add project" disabled={busy}>Add</button></form></div></section>
    {selected ? <>
      <section className="panel project-kanban-panel"><div className="panel-heading"><div><h2>{selected.name} · agent board</h2><p>Agents move tasks as they accept work, report progress, and submit results.</p></div><button className="button button-outline button-small" onClick={() => onNavigate("handoffs")}>Open handoffs</button></div><div className="project-kanban">{lanes.map((lane) => { const items = projectHandoffs.filter((handoff) => lane.statuses.includes(handoff.status)).sort((a, b) => b.updated_at.localeCompare(a.updated_at)); return <section className="project-lane" key={lane.label}><div className="project-lane-heading"><h3>{lane.label}</h3><span>{items.length}</span></div>{items.length ? items.map((handoff) => <button className="project-work-card" key={handoff.id} onClick={() => onNavigate("handoffs")}><span className={`status status-${handoff.status}`}>{handoff.status.replaceAll("_", " ")}</span><strong><AssistantRichInline text={handoff.title} /></strong><small>{handoff.assigned_agent_id ? agentNames[handoff.assigned_agent_id] || "Assigned agent" : "Team queue · open to workers"} · updated {timeAgo(handoff.updated_at)}</small><span className="project-work-open">View handoff </span></button>) : <p className="project-lane-empty">No tasks here yet.</p>}</section>; })}</div></section>
      <section className="panel project-brief"><div className="panel-heading"><div><h2>Shared project brief</h2><p>Version {selected.brief_version} · the current decisions every agent reads.</p></div><span className="brief-label"> Shared with agents</span></div><label htmlFor="brief">What should every agent know?</label><textarea id="brief" value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="Project goal, decisions already made, important links, voice or style guidelines, constraints…" maxLength={20000} rows={10} /><div className="brief-footer"><span>{brief.length.toLocaleString()} / 20,000 characters</span><button className="button button-small" disabled={busy || brief === selected.brief} onClick={() => command("update_brief", { projectId: selected.id, brief, expectedVersion: selected.brief_version }).catch(() => {})}>Save brief</button></div></section>
    </> : <section className="panel"><Empty title="Create your first project" text="Projects give your agents a shared brief and a place to track handoffs." /></section>}
  </>;
}

function IdeasView({ projects, ideas, workspace, hasWorkers, busy, command }: { projects: Project[]; ideas: Idea[]; workspace: Workspace; hasWorkers: boolean; busy: boolean; command: (action: string, payload?: Record<string, unknown>) => Promise<unknown> }) {
  const [projectId, setProjectId] = useState("all");
  const [status, setStatus] = useState<Idea["status"] | "all">("pending");
  const [timezone, setTimezone] = useState(workspace.ideas_timezone || "UTC");
  const [olderIdeas, setOlderIdeas] = useState<Idea[]>([]);
  const [ideaOverrides, setIdeaOverrides] = useState<Map<string, Idea>>(() => new Map());
  const [nextOffset, setNextOffset] = useState<number | null>(ideas.length === 200 ? 200 : null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const initializedTimezone = useRef(false);
  const projectNames = Object.fromEntries(projects.map((project) => [project.id, project.name]));
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

  async function reviewIdea(ideaId: string, action: "accept_idea" | "archive_idea") {
    const result = await command(action, { ideaId });
    const updated = action === "accept_idea" ? (result as { idea?: Idea })?.idea : result as Idea;
    if (updated?.id) setIdeaOverrides((current) => new Map(current).set(ideaId, updated));
  }

  useEffect(() => {
    if (workspace.ideas_timezone || initializedTimezone.current) return;
    const frame = window.requestAnimationFrame(() => {
      if (initializedTimezone.current) return;
      initializedTimezone.current = true;
      const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      setTimezone(localTimezone);
      command("set_ideas_timezone", { timezone: localTimezone }).catch(() => {});
    });
    return () => window.cancelAnimationFrame(frame);
  }, [workspace.ideas_timezone, command]);

  return <>
    <div className="page-heading"><div><span className="eyebrow muted">A QUIET DAILY REVIEW</span><h1>Ideas</h1><p>Stoic prepares three source-grounded ideas once a day after 8 AM in your workspace time zone. Nothing becomes work until you accept it.</p></div></div>
    <section className="panel ideas-panel">
      <div className="ideas-toolbar">
        <div><h2>For your review</h2><p>{visibleIdeas.length} {visibleIdeas.length === 1 ? "idea" : "ideas"}</p></div>
        <label>Project <select aria-label="Filter ideas by project" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="all">All projects</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      </div>
      <div className="ideas-filters" role="group" aria-label="Filter ideas by status">{(["pending", "accepted", "archived", "all"] as const).map((item) => <button type="button" className={status === item ? "active" : ""} key={item} onClick={() => setStatus(item)}>{item === "all" ? "All" : item[0].toUpperCase() + item.slice(1)}{item !== "all" && <span>{loadedIdeas.filter((idea) => idea.status === item).length}</span>}</button>)}</div>
      {visibleIdeas.length ? <div className="ideas-list">{visibleIdeas.map((idea) => <article className="idea-card" key={idea.id}>
        <div className="idea-card-meta"><span>{idea.status === "pending" ? "For owner review" : idea.status}</span><time dateTime={idea.created_at}>{timeAgo(idea.created_at)}</time></div>
        <h3><AssistantRichInline text={idea.title} /></h3>
        <AssistantRichText className="idea-card-body" text={idea.summary} />
        <div className="idea-detail-pair"><div><strong>Why now</strong><AssistantRichText text={idea.why_now} /></div><div><strong>First step</strong><AssistantRichText text={idea.next_step} /></div></div>
        <details className="idea-evidence"><summary>Evidence · {idea.evidence_ids.length}</summary><ul>{idea.evidence_ids.map((source) => <li key={source}>{source}</li>)}</ul></details>
        <div className="idea-card-footer"><span>{projectNames[idea.project_id] || "Project"} · generated from shared context</span>{idea.status === "pending" ? <div className="row-actions">
          <button className="button button-outline button-small" disabled={busy || !hasWorkers || workspace.delegation_level === "observe"} title={!hasWorkers ? "Connect a worker before accepting an idea" : workspace.delegation_level === "observe" ? "Change the delegation level before creating handoffs" : undefined} onClick={() => reviewIdea(idea.id, "accept_idea").catch(() => {})}>Accept as team handoff</button>
          <button className="subtle-link" disabled={busy} onClick={() => reviewIdea(idea.id, "archive_idea").catch(() => {})}>Archive</button>
        </div> : idea.accepted_handoff_id ? <span>Handoff created · {idea.accepted_handoff_id.slice(0, 8)}</span> : <span>Archived</span>}</div>
        {idea.status === "pending" && !hasWorkers && <p className="field-help idea-action-note">Connect a worker before Stoic can queue an accepted idea.</p>}
        {idea.status === "pending" && workspace.delegation_level === "observe" && <p className="field-help idea-action-note">Your team is in Observe mode. Change the delegation level before creating handoffs.</p>}
      </article>)}</div> : <Empty title={status === "pending" ? "No ideas need review" : "Nothing in this view"} text="Stoic keeps each day's suggestions as their own records. Older ideas remain here until you accept or archive them." />}
      {historyError && <p className="field-help error-message" role="alert">{historyError}</p>}
      {nextOffset !== null && <div className="history-load-more"><button className="button button-outline button-small" onClick={() => loadOlderIdeas().catch(() => {})} disabled={historyLoading}>{historyLoading ? "Loading older ideas…" : "Load older ideas"}</button></div>}
    </section>
    <section className="panel ideas-timezone"><div><span className="eyebrow muted">DAILY SCHEDULE</span><h2>Keep the morning calm</h2><p>The server checks hourly and prepares ideas once after 8 AM in this time zone. Stoic&apos;s own scheduled run does not wake your agents or use their provider accounts.</p></div><label>Workspace time zone<input value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder="America/Chicago" maxLength={100} /></label><button className="button button-outline button-small" disabled={busy || !timezone.trim() || timezone === workspace.ideas_timezone} onClick={() => command("set_ideas_timezone", { timezone }).catch(() => {})}>Save time zone</button></section>
  </>;
}

function ContactsView({ projects, busy, command }: { projects: Project[]; busy: boolean; command: (action: string, payload?: Record<string, unknown>) => Promise<unknown> }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [importIdempotencyKey, setImportIdempotencyKey] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const query = new URLSearchParams({ q: search, offset: String(offset) });
      if (status) query.set("status", status);
      const response = await fetch(`/api/contacts?${query}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not load contacts");
      const data = json.data as { contacts: Contact[]; total: number; nextOffset: number | null };
      setContacts(data.contacts);
      setTotal(data.total);
      setNextOffset(data.nextOffset);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Could not load contacts");
    } finally {
      setLoading(false);
    }
  }, [offset, search, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [refresh, search, status, offset]);

  async function addContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await command("create_contact", {
      fullName: String(form.get("fullName")),
      email: String(form.get("email") || "") || null,
      phone: String(form.get("phone") || "") || null,
      company: String(form.get("company") || "") || null,
      projectId: String(form.get("projectId") || "") || null,
      sourceLabel: String(form.get("sourceLabel")),
      sourceUrl: String(form.get("sourceUrl") || "") || null,
      notes: String(form.get("notes") || ""),
      idempotencyKey: crypto.randomUUID(),
    });
    formElement.reset();
    await refresh();
  }

  async function importCsv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    const formElement = event.currentTarget;
    setImporting(true);
    setImportMessage("");
    try {
      const form = new FormData(formElement);
      form.set("file", file);
      form.set("idempotencyKey", importIdempotencyKey || crypto.randomUUID());
      const response = await fetch("/api/contacts/import", { method: "POST", body: form });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not import this CSV");
      const result = json.data as { created: number; updated: number; skipped: number };
      setImportMessage(`${result.created} added · ${result.updated} updated · ${result.skipped} skipped`);
      setFile(null);
      setImportIdempotencyKey("");
      formElement.reset();
      setOffset(0);
      await refresh();
    } catch (cause) {
      setImportMessage(cause instanceof Error ? cause.message : "Could not import this CSV");
    } finally {
      setImporting(false);
    }
  }

  return <>
    <div className="page-heading"><div><span className="eyebrow muted">PRIVATE WORKSPACE CRM</span><h1>Contacts</h1><p>Keep real leads and relationship context with the project and source that produced them. Stoic records contacts; it never sends outreach.</p></div><span className="count-pill">{total} contacts</span></div>
    <div className="contacts-tools">
      <section className="panel"><div className="panel-heading"><div><h2>Add a contact</h2><p>Save only details you have confirmed.</p></div></div><form className="contact-form" onSubmit={(event) => addContact(event).catch(() => {})}>
        <label>Name<input name="fullName" placeholder="Full name" minLength={2} maxLength={160} required /></label><label>Email<input name="email" type="email" maxLength={254} placeholder="name@example.com" /></label><label>Phone<input name="phone" type="tel" maxLength={60} placeholder="Optional" /></label><label>Company<input name="company" maxLength={160} placeholder="Optional" /></label>
        <label>Project<select name="projectId"><option value="">No project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label>Source<input name="sourceLabel" placeholder="Where you found them" minLength={2} maxLength={180} required /></label><label className="contact-wide">Source URL<input name="sourceUrl" type="url" placeholder="https://…" maxLength={2000} /></label><label className="contact-wide">Notes<textarea name="notes" rows={2} maxLength={5000} placeholder="Useful context, not private conversation logs" /></label>
        <button className="button button-small" disabled={busy}>Save contact</button>
      </form></section>
      <section className="panel"><div className="panel-heading"><div><h2>Import a CSV</h2><p>Stoic maps a sample, then keeps the source trail.</p></div></div><form className="contact-import-form" onSubmit={(event) => importCsv(event).catch(() => {})}>
        <label>CSV file<input type="file" accept=".csv,text/csv" onChange={(event) => { const nextFile = event.target.files?.[0] || null; setFile(nextFile); setImportIdempotencyKey(nextFile ? crypto.randomUUID() : ""); }} required /></label><label>Source label<input name="sourceLabel" defaultValue="CSV import" minLength={2} maxLength={180} required /></label><label>Project<select name="projectId"><option value="">No project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <button className="button button-outline button-small" disabled={!file || importing}>{importing ? "Importing…" : "Review and import"}</button>{importMessage && <p className="field-help" role="status">{importMessage}</p>}
      </form></section>
    </div>
    <section className="panel contacts-panel"><div className="ideas-toolbar"><div><h2>Your contacts</h2><p>Deduplicated within this workspace</p></div><label>Status <select aria-label="Filter contacts by status" value={status} onChange={(event) => { setStatus(event.target.value); setOffset(0); }}><option value="">All contacts</option><option value="new">New</option><option value="contacted">Contacted</option><option value="qualified">Qualified</option><option value="customer">Customer</option><option value="archived">Archived</option></select></label><label>Search <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setOffset(0); }} placeholder="Name, email, company…" /></label></div>
      {loadError && <p className="form-error contacts-error" role="alert">{loadError}</p>}{loading ? <p className="contacts-loading">Loading contacts…</p> : contacts.length ? <div className="contact-list">{contacts.map((contact) => <ContactCard key={`${contact.id}:${contact.updated_at}`} contact={contact} busy={busy} command={command} onSaved={refresh} />)}</div> : <Empty title="No contacts here yet" text="Add a confirmed lead or import a CSV to start a private, source-aware contact list." />}
      <div className="contacts-pagination"><span>{total} total</span><div><button type="button" className="button button-outline button-small" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous</button><button type="button" className="button button-outline button-small" disabled={nextOffset === null || loading} onClick={() => nextOffset !== null && setOffset(nextOffset)}>Next</button></div></div>
    </section>
  </>;
}

function ContactCard({ contact, busy, command, onSaved }: { contact: Contact; busy: boolean; command: (action: string, payload?: Record<string, unknown>) => Promise<unknown>; onSaved: () => Promise<void> }) {
  const [status, setStatus] = useState(contact.status);
  const [notes, setNotes] = useState(contact.notes);
  async function save(event: FormEvent) {
    event.preventDefault();
    await command("update_contact", { contactId: contact.id, status, notes });
    await onSaved();
  }
  return <article className="contact-card"><div className="contact-card-top"><div><h3><AssistantRichInline text={contact.full_name} /></h3><p>{[contact.job_title, contact.company].filter(Boolean).join(" · ") || "Contact"}</p></div><select aria-label={`Status for ${contact.full_name}`} value={status} onChange={(event) => setStatus(event.target.value as Contact["status"])}><option value="new">New</option><option value="contacted">Contacted</option><option value="qualified">Qualified</option><option value="customer">Customer</option><option value="archived">Archived</option></select></div>
    <div className="contact-details">{contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}{contact.phone && <a href={`tel:${contact.phone}`}>{contact.phone}</a>}</div>
    <form onSubmit={(event) => save(event).catch(() => {})}><label>Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={10000} rows={2} /></label><button className="subtle-link" type="submit" disabled={busy || (status === contact.status && notes === contact.notes)}>Save changes</button></form>
    {contact.sources.length > 0 && <details className="contact-sources"><summary>Source history · {contact.sources.length}</summary><ul>{contact.sources.map((source) => <li key={source.id}><strong>{source.source_label}</strong>{source.source_url && <> · <a href={source.source_url} target="_blank" rel="noreferrer">Open source</a></>}{source.notes && <p>{source.notes}</p>}<time dateTime={source.created_at}>{timeAgo(source.created_at)}</time></li>)}</ul></details>}
  </article>;
}

function BoardView({ projects, agents, messages, busy, command, refresh }: { projects: Project[]; agents: Agent[]; messages: BoardMessage[]; busy: boolean; command: (action: string, payload?: Record<string, unknown>) => Promise<unknown>; refresh: () => Promise<void> }) {
  const [projectId, setProjectId] = useState(projects[0]?.id || "");
  const [body, setBody] = useState("");
  const [postKind, setPostKind] = useState<"message" | "suggestion">("message");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const postAttempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const newestMessageRef = useRef<HTMLDivElement>(null);
  const agentNames = Object.fromEntries(agents.map((agent) => [`agent:${agent.id}`, agent.name]));
  const visible = messages.filter((message) => message.project_id === projectId).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const visibleIds = new Set(visible.map((message) => message.id));
  const children = new Map<string, BoardMessage[]>();
  for (const message of visible) {
    if (!message.parent_id || !visibleIds.has(message.parent_id)) continue;
    children.set(message.parent_id, [...(children.get(message.parent_id) || []), message]);
  }
  const roots = visible.filter((message) => !message.parent_id || !visibleIds.has(message.parent_id));
  const replyingTo = visible.find((message) => message.id === replyTo);
  const updatedAt = visible.at(-1)?.created_at || null;

  useEffect(() => {
    const refreshIfVisible = () => { if (!document.hidden) void refresh().catch(() => {}); };
    const interval = window.setInterval(refreshIfVisible, 30_000);
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [refresh]);

  useEffect(() => { newestMessageRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [projectId]);

  async function post(event: FormEvent) {
    event.preventDefault();
    if (!body.trim() || !projectId) return;
    const parentId = postKind === "suggestion" ? null : replyTo;
    const fingerprint = JSON.stringify([projectId, parentId, postKind, body.trim()]);
    if (postAttempt.current?.fingerprint !== fingerprint) postAttempt.current = { fingerprint, key: crypto.randomUUID() };
    await command("post_board_message", { projectId, parentId, body: body.trim(), kind: postKind, idempotencyKey: postAttempt.current.key });
    postAttempt.current = null;
    setBody("");
    setReplyTo(null);
    setPostKind("message");
  }

  function renderMessage(message: BoardMessage, depth = 0): ReactNode {
    const userMessage = message.author_key.startsWith("user:");
    const author = agentNames[message.author_key] || (userMessage ? "You" : message.kind === "artifact" ? "Stoic Connector" : "Stoic idea");
    const kindLabel = message.kind === "run_report" ? "Run report" : message.kind === "suggestion" ? "Suggestion · review first" : message.kind === "artifact" ? "File shared" : "Message";
    return <div className="chat-thread" key={message.id}>
      <article className={`board-message chat-message ${userMessage ? "from-owner" : "from-agent"} ${message.kind !== "message" ? `kind-${message.kind}` : ""}`} style={{ marginLeft: `${Math.min(depth, 3) * 18}px` }}>
        <span className={`chat-avatar ${userMessage ? "owner-avatar" : "agent-avatar"}`}>{author.charAt(0).toUpperCase()}</span>
        <div className="chat-bubble"><div className="board-message-meta"><strong>{author}</strong><span>{kindLabel} · {timeAgo(message.created_at)}</span></div><AssistantRichText text={message.body} />{message.kind !== "suggestion" && <button className="subtle-link" onClick={() => { setPostKind("message"); setReplyTo(message.id); }}>Reply</button>}</div>
      </article>
      {(children.get(message.id) || []).map((reply) => renderMessage(reply, depth + 1))}
    </div>;
  }

  return <><div className="page-heading"><div><span className="eyebrow muted">TEAM CHECK-IN</span><h1>Message board</h1><p>Agents share progress, ask each other questions, and leave a useful trail between runs.</p></div><button className="button button-outline button-small" onClick={() => refresh().catch(() => {})}>Refresh board</button></div><section className="panel board-panel"><div className="panel-heading"><div><h2>Project conversation</h2><p>Agent check-ins arrive when their next native schedule runs · {updatedAt ? `updated ${timeAgo(updatedAt)}` : "no messages yet"}</p></div><select aria-label="Board project" value={projectId} onChange={(event) => { setProjectId(event.target.value); setReplyTo(null); }}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></div>{roots.length ? <div className="board-list">{roots.map((message) => renderMessage(message))}<div ref={newestMessageRef} /></div> : <Empty title="No messages yet" text="Post a project note, or ask an agent to leave a short check-in after its next run." />}{projects.length > 0 && <form className="board-compose" onSubmit={(event) => post(event).catch(() => {})}>{replyingTo && <div className="board-reply">Replying to <strong>{agentNames[replyingTo.author_key] || (replyingTo.author_key.startsWith("user:") ? "you" : "an agent")}</strong><span>{replyingTo.body.slice(0, 90)}{replyingTo.body.length > 90 ? "…" : ""}</span><button type="button" onClick={() => setReplyTo(null)}>Cancel</button></div>}<label htmlFor="board-kind">Post type</label><select id="board-kind" value={postKind} disabled={Boolean(replyTo)} onChange={(event) => setPostKind(event.target.value as "message" | "suggestion")}><option value="message">Message</option><option value="suggestion">Suggestion · review first</option></select>{postKind === "suggestion" && <p className="field-help">This is an idea for the owner to review. It does not assign work or approve a decision.</p>}<label htmlFor="board-body">{postKind === "suggestion" ? "Share an idea" : "Add a message"}</label><textarea id="board-body" value={body} onChange={(event) => setBody(event.target.value)} maxLength={12000} rows={3} placeholder={postKind === "suggestion" ? "Describe the idea, why it is useful, and the evidence behind it…" : "Reply, ask a question, or share a decision for the team…"} required /><button className="button button-small" disabled={busy || !body.trim()}>{postKind === "suggestion" ? "Post suggestion for review" : "Post message"}</button></form>}</section></>;
}

function RoutingView({ projects, agents, bossAgentId, busy, command }: { projects: Project[]; agents: Agent[]; bossAgentId: string | null; busy: boolean; command: (action: string, payload?: Record<string, unknown>) => Promise<unknown> }) {
  return <section className="panel routing-panel"><div className="panel-heading"><div><h2>Project routing</h2><p>Choose a connected MCP worker for each project. The boss can omit an assignee when creating an MCP handoff, and Stoic will send it here.</p></div></div><div className="routing-list">{projects.map((project) => <label key={project.id}><span>{project.name}</span><select value={project.default_agent_id === bossAgentId ? "" : project.default_agent_id || ""} disabled={busy} onChange={(event) => command("set_project_routing", { projectId: project.id, agentId: event.target.value || null }).catch(() => {})}><option value="">No default agent</option>{agents.filter((agent) => agent.status === "connected" && agent.id !== bossAgentId && agent.platform !== "muse").map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>)}</div></section>;
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
  const [projectId, setProjectId] = useState(projects[0]?.id || ""); const [handoffId, setHandoffId] = useState(""); const [file, setFile] = useState<File | null>(null); const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState<ArtifactFilter>("all"); const [query, setQuery] = useState("");
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
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : "Upload failed"); }
    finally { setUploading(false); }
  }
  async function download(id: string) { const data = await command("artifact_download", { artifactId: id }) as { downloadUrl: string }; window.open(data.downloadUrl, "_blank", "noopener,noreferrer"); }
  const normalizedQuery = query.trim().toLowerCase();
  const filteredArtifacts = artifacts.filter((artifact) => {
    if (filter !== "all" && artifactCategory(artifact) !== filter) return false;
    if (!normalizedQuery) return true;
    const projectName = projects.find((project) => project.id === artifact.project_id)?.name || "";
    const handoffTitle = handoffs.find((handoff) => handoff.id === artifact.handoff_id)?.title || "";
    return `${artifact.name} ${projectName} ${handoffTitle}`.toLowerCase().includes(normalizedQuery);
  });
  const sizeLabel = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return <><div className="page-heading"><div><span className="eyebrow muted">SHARED ARTIFACTS</span><h1>Artifacts</h1><p>Keep source files, notes, and work products together for the agents who need them.</p></div></div><section className="panel upload-panel"><div className="panel-heading"><div><h2>Share a file</h2><p>Project files appear in agents’ unread project updates at their next check. A handoff file is available to that handoff’s worker, the boss, and you. Any file type can be attached up to 25 MB. Stoic previews common text, RTF, PDF, DOCX, XLSX, PPTX, OpenDocument, image, and audio formats; other files remain available to agents but do not receive an intake preview.</p></div></div>{!projects.length ? <div className="artifact-no-project"><p>Create a project before uploading so Stoic knows where the file belongs.</p><button className="button button-outline button-small" onClick={onManageProjects}>Set up a project</button></div> : <form className="upload-form" onSubmit={(event) => upload(event).catch(() => {})}><select aria-label="File project" value={projectId} onChange={(event) => { setProjectId(event.target.value); setHandoffId(""); uploadKey.current = null; }} required>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><select aria-label="Optional file handoff" value={handoffId} onChange={(event) => { setHandoffId(event.target.value); uploadKey.current = null; }}><option value="">No specific handoff</option>{handoffs.filter((h) => h.project_id === projectId).map((h) => <option key={h.id} value={h.id}>{h.title}</option>)}</select><input aria-label="Choose any file up to 25 MB" type="file" onChange={(event) => { setFile(event.target.files?.[0] || null); uploadKey.current = null; }} required /><button className="button button-small" disabled={busy || uploading || !file}>{uploading ? "Uploading…" : "Upload file"}</button></form>}</section><section className="panel files-panel"><div className="artifact-library-head"><div><h2>Shared files</h2><p>{artifacts.length} {artifacts.length === 1 ? "file" : "files"} in this workspace</p></div><label>Search <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, project, or handoff" /></label></div><div className="artifact-filters" role="group" aria-label="Filter files by type">{artifactFilters.map((item) => <button key={item.id} className={filter === item.id ? "selected" : ""} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}<span>{item.id === "all" ? artifacts.length : artifacts.filter((artifact) => artifactCategory(artifact) === item.id).length}</span></button>)}</div>{filteredArtifacts.length ? <div className="artifact-grid">{filteredArtifacts.map((artifact) => {
    const handoffTitle = handoffs.find((handoff) => handoff.id === artifact.handoff_id)?.title;
    const category = artifactCategory(artifact);
    const categoryLabel = artifactFilters.find((item) => item.id === category)?.label || "Other";
    return <article className="artifact-card" key={artifact.id}><div className="artifact-card-meta"><span>{categoryLabel}</span><time dateTime={artifact.created_at}>{timeAgo(artifact.created_at)}</time></div><h3 title={artifact.name}>{artifact.name}</h3><p className="artifact-card-context">{projects.find((project) => project.id === artifact.project_id)?.name || "Project"}{handoffTitle ? ` · ${handoffTitle}` : " · Project file"} · {sizeLabel(artifact.size_bytes)}</p><p className="artifact-card-preview">{artifactPreview(artifact)}</p><div className="artifact-card-actions"><button className="subtle-link" onClick={() => download(artifact.id).catch(() => {})}>Download</button><button className="danger-link" disabled={busy} onClick={() => { if (confirm(`Delete ${artifact.name}? Agents will no longer be able to download it.`)) command("delete_artifact", { artifactId: artifact.id }).then(() => setNotice("File deleted.")).catch(() => {}); }}>Delete</button></div></article>;
  })}</div> : artifacts.length ? <Empty title="No matching files" text="Try a different search or file type." /> : <Empty title="No files shared yet" text="Upload any file for your agents to use. Stoic previews common formats and keeps other types as downloadable attachments." />}</section></>;
}

function BillingView({ workspace, monthlyPrice, usage, busy, command }: { workspace: Workspace; monthlyPrice?: number | null; usage: { handoffs: number; storageBytes: number }; busy: boolean; command: (action: string, payload?: Record<string, unknown>) => Promise<unknown> }) {
  async function portal() { const result = await command("billing_portal") as { url: string }; window.location.href = result.url; }
  return <><div className="page-heading"><div><span className="eyebrow muted">WORKSPACE MEMBERSHIP</span><h1>Plan & billing</h1><p>One required subscription for your whole agent workspace.</p></div></div><div className="billing-grid"><section className="panel"><div className="panel-heading"><div><h2>Stoic Connector</h2><p>{workspace.plan === "pro" ? "Your subscription is active." : "An active subscription is required to use coordination features."}</p></div><span className="header-plan">{workspace.plan === "pro" ? "ACTIVE" : "INACTIVE"}</span></div><div className="usage-row"><span>Your current price</span><strong>{monthlyPrice == null ? "See Stripe portal" : `$${monthlyPrice} / month`}</strong></div><div className="usage-row"><span>Handoffs created this month</span><strong>{usage.handoffs}</strong></div><div className="usage-row"><span>Private storage currently used</span><strong>{(usage.storageBytes / 1024 / 1024).toFixed(1)} MB</strong></div><ul className="billing-features"><li> No monthly usage quotas or application-level request throttles</li><li> Private files and project routing</li><li> Human approval controls and data export</li></ul><div className="billing-actions">{workspace.stripe_customer_id && <button className="button button-outline" disabled={busy} onClick={() => portal().catch(() => {})}>Manage billing</button>}<a className="button button-outline" href="/api/export">Export workspace data </a></div></section></div><p className="billing-footnote">Agent provider subscriptions and any model usage from native schedules are billed by those providers. Individual uploads are limited to 25 MB.</p></>;
}
