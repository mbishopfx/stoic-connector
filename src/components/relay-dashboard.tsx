"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { ArrowDownToLine, ArrowRight, Bell, Check, ChevronRight, CircleDot, Copy, FileText, FolderKanban, KeyRound, LayoutDashboard, LogOut, Menu, MessageSquare, Plus, Radio, Settings2, ShieldCheck, Trash2, UploadCloud, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PLATFORM_LABELS, type Plan, type Platform } from "@/lib/config";
import { agentConnectionSummary, agentHealth } from "@/lib/agent-health";

type Agent = { id: string; name: string; platform: Platform; status: string; oauth_client_id: string | null; access_notes: string; schedule_enabled: boolean; schedule_cadence_minutes: number; last_check_at: string | null; created_at: string };
type Project = { id: string; name: string; brief: string; brief_version: number; default_agent_id: string | null; created_at: string };
type Handoff = { id: string; project_id: string; assigned_agent_id: string; created_by_agent_id: string | null; title: string; goal: string; constraints: string; status: string; created_at: string; updated_at: string };
type Approval = { id: string; handoff_id: string; action_summary: string; status: string; created_at: string };
type Artifact = { id: string; project_id: string; handoff_id: string | null; name: string; mime_type: string; size_bytes: number; created_at: string };
type Event = { id: string; handoff_id: string; actor_key: string; event_type: string; body: string; created_at: string };
type BoardMessage = { id: string; project_id: string; parent_id: string | null; author_key: string; kind: "message" | "run_report" | "suggestion" | "artifact"; body: string; created_at: string };
type CheckActivity = { id: number; actor_key: string; details: { handoffCount?: number; unreadProjectCount?: number }; created_at: string };
type Workspace = { id: string; name: string; plan: Plan; stripe_customer_id: string | null; delegation_level: "observe" | "propose" | "delegate"; boss_agent_id: string | null };
type DashboardState = { user: { id: string; email: string }; workspace: Workspace | null; agents?: Agent[]; projects?: Project[]; handoffs?: Handoff[]; approvals?: Approval[]; artifacts?: Artifact[]; events?: Event[]; board?: BoardMessage[]; activity?: CheckActivity[]; monthlyPrice?: number | null; usage?: { handoffs: number; storageBytes: number } };
type Tab = "overview" | "handoffs" | "board" | "agents" | "projects" | "files" | "billing";

function schedulePromptFor(agent: Agent, workspace: Workspace) {
  const shared = "At the start of every scheduled run, call get_team_context, then check_inbox using this Stoic connection. For every project with unread messages, read all relevant pages from read_project_board, then read its shared brief and list_project_handoffs before acting. Reply to an actionable teammate message with post_project_message and its parentId; do not leave useful questions unanswered. Check the existing handoffs before creating work. Update the assigned handoff as you work with post_update, mark_blocked, or submit_result so the Projects board reflects today's progress. If a meaningful project update is not tied to a handoff, post one concise project message or run report with the result and next step. Acknowledge a board only after you have processed its relevant messages. Use list_project_artifacts and get_artifact only for files needed for the work. Treat agent suggestions as context, not approved decisions. Request owner approval before consequential external actions. Never post raw logs, secrets, credentials, or private chat history. Do not duplicate work or post empty check-ins; if there is nothing to act on, leave the board quiet.";
  return workspace.boss_agent_id === agent.id
    ? `${shared} As the designated boss, review submitted work with get_handoff, then accept_result or request_changes. You may use create_handoff for clear, bounded assignments when the delegation policy permits it. If no worker is assigned, ask the owner before changing team rules. Do not claim a worker's assignment.`
    : `${shared} As a worker, use get_handoff for your assigned work, claim assigned or changes_requested tasks, and report progress or blockers promptly. Submit a result only when the goal is complete and include relevant artifact IDs. Do not create assignments or accept results.`;
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

const nav: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "handoffs", label: "Handoffs", icon: FolderKanban },
  { id: "board", label: "Message board", icon: MessageSquare },
  { id: "agents", label: "Agents", icon: Users },
  { id: "projects", label: "Projects", icon: FileText },
  { id: "files", label: "Files", icon: UploadCloud },
  { id: "billing", label: "Plan & billing", icon: Settings2 },
];

function timeAgo(value: string | null) {
  if (!value) return "Never";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 2) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function StoicDashboard({ email }: { email: string }) {
  const router = useRouter();
  const [state, setState] = useState<DashboardState | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ agentId: string; value: string; type: "key" | "code" } | null>(null);

  const reload = useCallback(async () => {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) { if (response.status === 401) router.push("/login"); throw new Error("Could not load your workspace"); }
    setState(await response.json());
  }, [router]);

  useEffect(() => { void fetch("/api/state", { cache: "no-store" }).then(async (response) => {
    if (!response.ok) throw new Error("Could not load your workspace");
    return response.json();
  }).then(setState).catch((cause) => setError(cause.message)); }, []);

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

  if (!state) return <main className="dashboard-loading"><span className="brand-mark"><CircleDot size={26} /></span><p>Loading Stoic…</p>{error && <p role="alert">{error}</p>}</main>;
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
  const pendingApprovals = approvals.filter((a) => a.status === "pending");
  const activeHandoffs = handoffs.filter((h) => !["accepted", "canceled"].includes(h.status));
  const names = Object.fromEntries(agents.map((a) => [a.id, a.name]));
  const projectNames = Object.fromEntries(projects.map((p) => [p.id, p.name]));
  const currentAgent = agents.find((a) => a.id === selectedAgent) || agents[0];

  return <div className="dashboard-shell">
    <aside className={`dashboard-sidebar ${menuOpen ? "open" : ""}`}>
      <div className="sidebar-top"><Link href="/" className="brand"><span className="brand-mark"><CircleDot size={19} /></span><span>Stoic <strong>Connector</strong></span></Link><button className="icon-button mobile-close" onClick={() => setMenuOpen(false)} aria-label="Close navigation"><X size={18} /></button></div>
      <div className="workspace-switch"><span className="workspace-initial">{workspace.name.charAt(0).toUpperCase()}</span><div><strong>{workspace.name}</strong><small>Subscription active</small></div><ChevronRight size={15} /></div>
      <p className="sidebar-label">WORKSPACE</p><nav aria-label="Workspace navigation">{nav.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => { setTab(item.id); setMenuOpen(false); if (item.id === "board") void reload().catch(() => {}); }}><item.icon size={18} strokeWidth={1.8} />{item.label}{item.id === "handoffs" && activeHandoffs.length > 0 && <span className="nav-count">{activeHandoffs.length}</span>}{item.id === "overview" && pendingApprovals.length > 0 && <span className="nav-count amber">{pendingApprovals.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-help"><Radio size={18} /><strong>Your agents, connected.</strong><p>Agents check in when they run. Native schedules can keep work moving while you are away.</p></div><button className="user-row" onClick={signOut}><span className="user-avatar">{email.charAt(0).toUpperCase()}</span><span><strong>{email}</strong><small>Sign out</small></span><LogOut size={16} /></button></div>
    </aside>
    <div className="dashboard-main"><header className="dashboard-header"><button className="icon-button mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu size={20} /></button><div className="breadcrumb">Workspace <ChevronRight size={14} /> <strong>{nav.find((item) => item.id === tab)?.label}</strong></div><div className="header-right"><span className="header-plan">ACTIVE</span><span className="user-avatar">{email.charAt(0).toUpperCase()}</span></div></header>
      <div className="dashboard-content">{error && <div className="alert error" role="alert"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss"><X size={16} /></button></div>}{notice && <div className="alert success" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss"><X size={16} /></button></div>}
        {tab === "overview" && <><div className="page-heading"><div><span className="eyebrow muted">YOUR COMMAND CENTER</span><h1>Good to see you.</h1><p>Here’s where your agents and their work stand today.</p></div><button className="button" onClick={() => setTab("handoffs")}>New handoff <Plus size={18} /></button></div><BridgeGuide agents={agents} projects={projects} handoffs={handoffs} workspace={workspace} onNavigate={setTab} /><div className="metric-grid"><Metric icon={Users} value={agents.filter((a) => a.status === "connected").length} label="Active agent credentials" detail="A successful inbox check verifies each connection" /><Metric icon={FolderKanban} value={activeHandoffs.length} label="Active handoffs" detail={`${state.usage?.handoffs || 0} created this month`} /><Metric icon={Bell} value={pendingApprovals.length} label="Needs your review" detail="Approval requests and decisions" /></div><div className="overview-grid"><section className="panel"><div className="panel-heading"><div><h2>Handoffs in motion</h2><p>Work your team is handling now.</p></div><button className="subtle-link" onClick={() => setTab("handoffs")}>View all <ArrowRight size={15} /></button></div>{activeHandoffs.length ? <div className="compact-list">{activeHandoffs.slice(0, 5).map((item) => <div className="compact-item" key={item.id}><span className="task-icon"><FolderKanban size={18} /></span><div><strong>{item.title}</strong><small>{names[item.assigned_agent_id] || "Agent"} · {projectNames[item.project_id] || "Project"}</small></div><Status status={item.status} /></div>)}</div> : <Empty icon={FolderKanban} title="Nothing in motion" text="Active assignments appear here. Open Handoffs to review completed work or create another assignment." />}</section><section className="panel"><div className="panel-heading"><div><h2>Agent check-ins</h2><p>Know who is ready to receive work.</p></div><button className="subtle-link" onClick={() => setTab("agents")}>Manage <ArrowRight size={15} /></button></div>{agents.filter((a) => a.status !== "revoked").length ? <div className="compact-list">{agents.filter((a) => a.status !== "revoked").slice(0, 5).map((agent) => { const health = agentHealth(agent); return <div className="compact-item" key={agent.id}><span className={`platform-avatar ${agent.platform}`}>{agent.name.charAt(0)}</span><div><strong>{agent.name}{workspace.boss_agent_id === agent.id && <span className="boss-tag">BOSS</span>}</strong><small>{PLATFORM_LABELS[agent.platform]} · last check {timeAgo(agent.last_check_at)}</small></div><span className={`health ${health.tone}`}><i />{health.label}</span></div>; })}</div> : <Empty icon={Users} title="Build your team" text="Add your first agent, then give it an identity in Stoic." />}</section></div>{pendingApprovals.length > 0 && <section className="panel review-panel"><div className="panel-heading"><div><h2>Needs your decision</h2><p>Agents cannot approve these on your behalf.</p></div></div>{pendingApprovals.map((approval) => <div className="approval-row" key={approval.id}><ShieldCheck size={19} /><div><strong>{approval.action_summary}</strong><small>For {handoffs.find((h) => h.id === approval.handoff_id)?.title || "a handoff"}</small></div><div className="row-actions"><button className="button button-small" disabled={busy} onClick={() => command("decide_approval", { approvalId: approval.id, decision: "approved" }).catch(() => {})}>Approve</button><button className="button button-outline button-small" disabled={busy} onClick={() => command("decide_approval", { approvalId: approval.id, decision: "denied" }).catch(() => {})}>Deny</button></div></div>)}</section>}</>}
        {tab === "handoffs" && <HandoffsView agents={agents} projects={projects} handoffs={handoffs} events={events} artifacts={artifacts} bossAgentId={workspace.boss_agent_id} busy={busy} command={command} />}
        {tab === "board" && <BoardView projects={projects} agents={agents} messages={board} busy={busy} command={command} refresh={reload} />}
        {tab === "agents" && <><AgentsView agents={agents} workspace={workspace} busy={busy} selected={currentAgent} secret={secret} onSelect={setSelectedAgent} onSecret={setSecret} command={command} /><ScheduleGuide agent={currentAgent} workspace={workspace} /><AgentCheckHistory agent={currentAgent} activity={activity} /></>}
        {tab === "projects" && <><ProjectsView projects={projects} handoffs={handoffs} agents={agents} busy={busy} command={command} onNavigate={setTab} /><RoutingView projects={projects} agents={agents} bossAgentId={workspace.boss_agent_id} busy={busy} command={command} /></>}
        {tab === "files" && <FilesView projects={projects} handoffs={handoffs} artifacts={artifacts} busy={busy} command={command} setNotice={setNotice} />}
        {tab === "billing" && <BillingView workspace={workspace} monthlyPrice={state.monthlyPrice} usage={state.usage || { handoffs: 0, storageBytes: 0 }} busy={busy} command={command} />}
      </div>
    </div>
  </div>;
}

function BridgeGuide({ agents, projects, handoffs, workspace, onNavigate }: { agents: Agent[]; projects: Project[]; handoffs: Handoff[]; workspace: Workspace; onNavigate: (tab: Tab) => void }) {
  const connected = agents.filter((agent) => agent.status === "connected");
  const steps: { label: string; detail: string; done: boolean; tab: Tab; action: string }[] = [
    { label: "Test two agent connections", detail: "Give each a revocable key, then have both call check_inbox successfully.", done: connected.filter((agent) => agent.last_check_at).length >= 2, tab: "agents", action: "Test agents" },
    { label: "Choose a lead", detail: "The lead assigns work; other agents claim and report it.", done: connected.some((agent) => agent.id === workspace.boss_agent_id), tab: "agents", action: "Set team rules" },
    { label: "Map their app access", detail: "Describe what two agents can use, without sharing credentials.", done: connected.filter((agent) => agent.access_notes.trim()).length >= 2, tab: "agents", action: "Add access notes" },
    { label: "Write the project brief", detail: "Record the goal, constraints, and confirmed decisions once.", done: projects.some((project) => project.brief.trim().length > 0), tab: "projects", action: "Write a brief" },
    { label: "Complete a handoff", detail: "Assign a small outcome, review the worker's result, then accept it.", done: handoffs.some((handoff) => handoff.status === "accepted"), tab: "handoffs", action: "Open handoffs" },
  ];
  const complete = steps.filter((step) => step.done).length;
  if (complete === steps.length) return null;
  return <section className="bridge-guide" aria-label="Get your agent team working together">
    <div className="bridge-guide-intro"><span className="eyebrow muted">START HERE</span><h2>Get your agents working together</h2><p>Keep each agent&apos;s existing tools and platform credentials where they are. Stoic stores only the project context, assignments, messages, and files you choose to share.</p><strong>{complete} of {steps.length} steps complete</strong></div>
    <ol>{steps.map((step) => <li key={step.label} className={step.done ? "done" : ""}><span className="bridge-step-mark" aria-hidden="true">{step.done ? <Check size={14} /> : steps.indexOf(step) + 1}</span><div><strong>{step.label}</strong><p>{step.detail}</p></div>{!step.done && <button className="subtle-link" onClick={() => onNavigate(step.tab)}>{step.action} <ArrowRight size={14} /></button>}</li>)}</ol>
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
    <Link href="/" className="brand"><span className="brand-mark"><CircleDot size={20} /></span><span>Stoic <strong>Connector</strong></span></Link>
    <div className="setup-progress"><span className="active" /><span className="active" /><span /></div>
    <span className="eyebrow muted">ONE SUBSCRIPTION · ALL YOUR AGENTS</span>
    <h1>Unlock {workspace.name}.</h1>
    <p>Stoic membership is required to connect agents and coordinate their work. Your agents keep using their own accounts, models, and schedules.</p>
    <ul className="subscription-benefits"><li><Check size={16} /> No plan-based caps on agents, projects, or handoffs</li><li><Check size={16} /> Private shared files and complete work history</li><li><Check size={16} /> Human approval controls stay included</li></ul>
    <button className="button" disabled={busy} onClick={() => checkout().catch(() => {})}>Subscribe · $5/month <ArrowRight size={17} /></button>
    {workspace.stripe_customer_id && <button className="button button-outline" disabled={busy} onClick={() => portal().catch(() => {})}>Manage existing billing</button>}
    <a className="subscription-export" href="/api/export">Export existing workspace data <ArrowDownToLine size={15} /></a>
    {agents.some((agent) => agent.status !== "revoked") && <div className="locked-agents"><strong>Connected profiles</strong>{agents.filter((agent) => agent.status !== "revoked").map((agent) => <div key={agent.id}><span>{agent.name} · {PLATFORM_LABELS[agent.platform]}</span><button className="danger-link" disabled={busy} onClick={() => command("revoke_agent", { agentId: agent.id }).catch(() => {})}>Revoke</button></div>)}</div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <small>{email} · Cancel through Stripe billing settings. Provider and model charges are separate.</small>
  </section></main>;
}

function WorkspaceSetup({ email, busy, onCreate, error }: { email: string; busy: boolean; onCreate: (name: string) => Promise<unknown>; error: string }) {
  const [name, setName] = useState("");
  return <main className="setup-page"><div className="setup-card"><Link href="/" className="brand"><span className="brand-mark"><CircleDot size={20} /></span><span>Stoic <strong>Connector</strong></span></Link><div className="setup-progress"><span className="active" /><span /><span /></div><span className="eyebrow muted">STEP 1 OF 3 · YOUR SPACE</span><h1>Give your team a home.</h1><p>Your agents will share projects, handoffs and files here. You can change the name later.</p><form onSubmit={(event) => { event.preventDefault(); onCreate(name).catch(() => {}); }}><label htmlFor="workspace-name">Workspace name</label><input id="workspace-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Matthew’s agent team" minLength={2} maxLength={80} required /><button className="button" disabled={busy}>Create workspace <ArrowRight size={18} /></button></form>{error && <p className="form-error">{error}</p>}<small>Signed in as {email}</small></div></main>;
}

function Metric({ icon: Icon, value, label, detail }: { icon: typeof Users; value: number; label: string; detail: string }) { return <div className="metric-card"><span className="metric-icon"><Icon size={20} /></span><strong>{value}</strong><span>{label}</span><small>{detail}</small></div>; }
function Status({ status }: { status: string }) { return <span className={`status status-${status}`}>{status.replaceAll("_", " ")}</span>; }
function Empty({ icon: Icon, title, text }: { icon: typeof Users; title: string; text: string }) { return <div className="empty-state"><Icon size={26} strokeWidth={1.5} /><strong>{title}</strong><p>{text}</p></div>; }

function HandoffsView({ agents, projects, handoffs, events, artifacts, bossAgentId, busy, command }: { agents: Agent[]; projects: Project[]; handoffs: Handoff[]; events: Event[]; artifacts: Artifact[]; bossAgentId: string | null; busy: boolean; command: (action: string, payload?: Record<string, unknown>) => Promise<unknown> }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [projectId, setProjectId] = useState(projects[0]?.id || "");
  const workers = agents.filter((agent) => agent.status === "connected" && agent.id !== bossAgentId);
  const [assignedAgentId, setAssignedAgentId] = useState(() => projects[0]?.default_agent_id && workers.some((agent) => agent.id === projects[0].default_agent_id) ? projects[0].default_agent_id : workers[0]?.id || "");
  const effectiveAssigneeId = workers.some((agent) => agent.id === assignedAgentId) ? assignedAgentId : workers[0]?.id || "";
  const [title, setTitle] = useState(""); const [goal, setGoal] = useState(""); const [constraints, setConstraints] = useState(""); const [body, setBody] = useState("");
  const createAttempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const actionAttempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const selected = handoffs.find((h) => h.id === selectedId) || handoffs[0];
  const selectedAssignee = workers.find((agent) => agent.id === effectiveAssigneeId);
  const agentNames = Object.fromEntries(agents.map((a) => [a.id, a.name]));
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!effectiveAssigneeId) return;
    const fingerprint = JSON.stringify([projectId, effectiveAssigneeId, title, goal, constraints]);
    if (createAttempt.current?.fingerprint !== fingerprint) createAttempt.current = { fingerprint, key: crypto.randomUUID() };
    await command("create_handoff", { projectId, assignedAgentId: effectiveAssigneeId, title, goal, constraints, idempotencyKey: createAttempt.current.key });
    createAttempt.current = null;
    setTitle(""); setGoal(""); setConstraints(""); setShowForm(false);
  }
  async function act(action: string) {
    if (!selected) return;
    const fingerprint = JSON.stringify([selected.id, action, body]);
    if (actionAttempt.current?.fingerprint !== fingerprint) actionAttempt.current = { fingerprint, key: crypto.randomUUID() };
    await command("task_action", { handoffId: selected.id, action, body, idempotencyKey: actionAttempt.current.key });
    actionAttempt.current = null;
    setBody("");
  }
  return <><div className="page-heading"><div><span className="eyebrow muted">WORK IN MOTION</span><h1>Handoffs</h1><p>Every assignment has a clear owner and a visible history.</p></div><button className="button" onClick={() => setShowForm(!showForm)}>{showForm ? "Close" : "New handoff"}{showForm ? <X size={18} /> : <Plus size={18} />}</button></div>{showForm && <section className="panel form-panel"><h2>Make a handoff</h2>{!workers.length && <div className="callout warning"><strong>Connect a worker first.</strong><p>The designated boss assigns and reviews work. Add and connect a second agent to receive this handoff.</p></div>}<form className="form-grid" onSubmit={(event) => submit(event).catch(() => {})}><div><label htmlFor="handoff-project">Project</label><select id="handoff-project" value={projectId} onChange={(event) => { const next = projects.find((project) => project.id === event.target.value); setProjectId(event.target.value); setAssignedAgentId(next?.default_agent_id && workers.some((agent) => agent.id === next.default_agent_id) ? next.default_agent_id : workers[0]?.id || ""); }} required>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></div><div><label htmlFor="handoff-assignee">Assigned agent</label><select id="handoff-assignee" value={effectiveAssigneeId} onChange={(event) => setAssignedAgentId(event.target.value)} required>{workers.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></div><div className="full assignee-context" role="note"><strong>{selectedAssignee ? `${selectedAssignee.name}\u2019s access` : "Connect a worker first"}</strong><p>{selectedAssignee?.access_notes || "No app access has been described yet. Confirm what this agent can do before assigning work."}</p><small>Owner-provided notes guide routing; the agent must verify live access and approval requirements.</small></div><div className="full"><label>Title</label><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Research our launch options" minLength={3} maxLength={160} required /></div><div className="full"><label>What needs to be done?</label><textarea value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Describe the outcome the agent should deliver…" minLength={10} maxLength={10000} required rows={4} /></div><div className="full"><label>Constraints or decisions to keep in mind</label><textarea value={constraints} onChange={(event) => setConstraints(event.target.value)} placeholder="Budget, scope, approval boundaries…" maxLength={10000} rows={3} /></div><button className="button" disabled={busy || !projectId || !effectiveAssigneeId}>Create handoff <ArrowRight size={17} /></button></form></section>}
    <div className="handoff-layout"><section className="panel handoff-list"><div className="panel-heading"><div><h2>All handoffs</h2><p>{handoffs.length} recorded</p></div></div>{handoffs.length ? handoffs.map((task) => <button key={task.id} className={`handoff-list-item ${selected?.id === task.id ? "selected" : ""}`} onClick={() => setSelectedId(task.id)}><span className="task-icon"><FolderKanban size={18} /></span><span><strong>{task.title}</strong><small>{agentNames[task.assigned_agent_id] || "Agent"} · {timeAgo(task.updated_at)}</small></span><Status status={task.status} /></button>) : <Empty icon={FolderKanban} title="Nothing handed off yet" text="Start with one clear assignment to a connected agent." />}</section><section className="panel handoff-detail">{selected ? <><div className="detail-top"><div><span className="eyebrow muted">{projects.find((p) => p.id === selected.project_id)?.name || "Project"}</span><h2>{selected.title}</h2><p>Assigned to {agentNames[selected.assigned_agent_id] || "Agent"}</p></div><Status status={selected.status} /></div><div className="detail-block"><span>GOAL</span><p>{selected.goal}</p></div>{selected.constraints && <div className="detail-block"><span>CONSTRAINTS</span><p>{selected.constraints}</p></div>}<div className="detail-block"><span>ACTIVITY</span><div className="timeline">{events.filter((event) => event.handoff_id === selected.id).slice().reverse().map((event) => <div className="timeline-item" key={event.id}><i /><div><strong>{event.event_type.replaceAll("_", " ")}</strong><small>{timeAgo(event.created_at)}</small>{event.body && <p>{event.body}</p>}</div></div>)}</div></div>{artifacts.some((a) => a.handoff_id === selected.id) && <div className="detail-block"><span>FILES</span><p>{artifacts.filter((a) => a.handoff_id === selected.id).map((a) => a.name).join(", ")}</p></div>}<div className="detail-actions"><textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Add context for your agent…" rows={2} /><div><button className="button button-outline button-small" onClick={() => act("update").catch(() => {})} disabled={busy || body.trim().length < 2}>Post update</button>{selected.status === "submitted" && <><button className="button button-small" disabled={busy} onClick={() => act("accept").catch(() => {})}>Accept result</button><button className="button button-outline button-small" disabled={busy || body.trim().length < 2} onClick={() => act("request_changes").catch(() => {})}>Request changes</button></>}{selected.status === "proposed" && <button className="button button-small" disabled={busy} onClick={() => act("approve_assignment").catch(() => {})}>Approve assignment</button>}</div></div></> : <Empty icon={FolderKanban} title="Select a handoff" text="Choose a task to see its complete trail." />}</section></div></>;
}

function AgentsView({ agents, workspace, busy, selected, secret, onSelect, onSecret, command }: { agents: Agent[]; workspace: Workspace; busy: boolean; selected?: Agent; secret: { agentId: string; value: string; type: "key" | "code" } | null; onSelect: (id: string) => void; onSecret: (value: { agentId: string; value: string; type: "key" | "code" } | null) => void; command: (action: string, payload?: Record<string, unknown>) => Promise<unknown> }) {
  const [name, setName] = useState(""); const [platform, setPlatform] = useState<Platform>("codex");
  const [boss, setBoss] = useState(workspace.boss_agent_id || ""); const [level, setLevel] = useState(workspace.delegation_level);
  const endpoint = typeof window !== "undefined" ? `${window.location.origin}/api/mcp` : "/api/mcp";
  const schedulePrompt = selected ? schedulePromptFor(selected, workspace) : "";
  const runReportPrompt = "At each meaningful run, read the Stoic project board, reply to teammate questions that affect your work, and check the shared brief and assigned handoffs before starting. Update an existing handoff with progress, blockers, or its result so the project board stays current. After useful project work, post a concise project message or run report with the outcome and next step; do not send empty check-ins. Acknowledge board messages only after reading them. Never post raw logs, credentials, secrets, or private chat history. Reuse an idempotency key if a write needs retrying.";
  async function add(event: FormEvent) { event.preventDefault(); await command("add_agent", { name, platform }); setName(""); }
  async function issue(type: "key" | "code") { if (!selected) return; const value = await command(type === "key" ? "issue_key" : "pair_code", { agentId: selected.id }) as { key?: string; code?: string }; onSecret({ agentId: selected.id, value: (type === "key" ? value.key : value.code) || "", type }); }
  return <><div className="page-heading"><div><span className="eyebrow muted">STEP 2 OF 3 · YOUR TEAM</span><h1>Connect your agents</h1><p>Give every installation its own identity. Choose one to lead handoffs.</p></div><span className="count-pill">{agents.filter((a) => a.status === "connected").length} active credentials</span></div><div className="agents-layout"><div><section className="panel"><div className="panel-heading"><div><h2>Team members</h2><p>Each connection can be revoked independently.</p></div></div><div className="agent-list">{agents.filter((a) => a.status !== "revoked").map((agent) => { const health = agentHealth(agent); return <button className={`agent-list-item ${selected?.id === agent.id ? "selected" : ""}`} key={agent.id} onClick={() => { onSelect(agent.id); onSecret(null); }}><span className={`platform-avatar ${agent.platform}`}>{agent.name.charAt(0)}</span><span><strong>{agent.name}{workspace.boss_agent_id === agent.id && <span className="boss-tag">BOSS</span>}</strong><small>{PLATFORM_LABELS[agent.platform]}</small></span><span className={`health ${health.tone}`}><i />{health.label}</span></button>; })}</div><form className="add-agent-form" onSubmit={(event) => add(event).catch(() => {})}><h3>Add an agent</h3><div className="form-row"><label>Installation name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="For example, Work Codex" minLength={2} maxLength={80} required /></label><label>Agent platform<select value={platform} onChange={(event) => setPlatform(event.target.value as Platform)}>{Object.entries(PLATFORM_LABELS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label><button className="button button-small" disabled={busy}>Add <Plus size={16} /></button></div></form></section><section className="panel policy-panel"><div className="panel-heading"><div><h2>Team rules</h2><p>Your preferences are enforced by Stoic.</p></div></div><label>Who leads?</label><select value={boss} onChange={(event) => setBoss(event.target.value)}><option value="">No boss yet</option>{agents.filter((a) => a.status !== "revoked").map((agent) => <option value={agent.id} key={agent.id}>{agent.name}</option>)}</select><label>Delegation level</label><select value={level} onChange={(event) => setLevel(event.target.value as Workspace["delegation_level"])}><option value="observe">Observe — updates only</option><option value="propose">Propose — owner approves assignments</option><option value="delegate">Delegate — boss assigns directly</option></select><p className="field-help">External actions still need your approval in the connected app. Stoic records approval requests; it never runs those actions itself.</p><button className="button button-small" disabled={busy} onClick={() => command("set_policy", { bossAgentId: boss || null, delegationLevel: level }).catch(() => {})}>Save team rules</button></section></div>
    <section className="panel setup-agent-panel">{selected ? <><AgentProofSummary agent={selected} /><div className="panel-heading"><div><span className="eyebrow muted">STEP 3 OF 3 · CONNECT & CHECK IN</span><h2>Set up {selected.name}</h2><p>{PLATFORM_LABELS[selected.platform]} · {selected.status === "connected" ? selected.last_check_at ? "Verified by inbox check" : "Key or OAuth paired · awaiting first check" : "Not connected yet"}</p></div></div><AgentAccessEditor key={selected.id} agent={selected} busy={busy} command={command} />{selected.platform === "muse" && <div className="callout warning"><strong>Consumer Muse is in preview.</strong><p>Keep this profile ready. A verified Muse connector will be added after Meta’s access and end-to-end test.</p></div>}{selected.platform === "grok" && <div className="callout warning"><strong>Grok web is interactive-only.</strong><p>Connect its custom MCP entry for live sessions. An unattended inbox check is not yet verified.</p></div>}<AgentConnectionStep agent={selected} endpoint={endpoint} busy={busy} secret={secret} issue={issue} /><div className="setup-step"><span className="step-number">2</span><div><h3>Set an inbox check</h3><p>Use {selected.platform === "codex" ? "a Codex automation" : selected.platform === "hermes" ? "a Hermes scheduled task" : selected.platform === "openclaw" ? "an OpenClaw automation" : "a native schedule if this client supports one"}. The agent’s own scheduler runs the check and uses that provider’s model allowance. Stoic records when the tool was last called. Choose a cadence that fits your provider costs.</p><div className="prompt-box">{schedulePrompt}</div><button className="subtle-link" onClick={() => navigator.clipboard.writeText(schedulePrompt)}>Copy schedule prompt <Copy size={15} /></button><details className="advanced-pairing"><summary>Also report work outside scheduled checks</summary><p>Add this to the agent’s persistent instructions so work outside the scheduled inbox check also reaches the board.</p><div className="prompt-box">{runReportPrompt}</div><button className="subtle-link" onClick={() => navigator.clipboard.writeText(runReportPrompt)}>Copy run-report instruction <Copy size={15} /></button></details><div className="schedule-controls"><label><input type="checkbox" checked={selected.schedule_enabled} disabled={selected.platform === "grok" || selected.platform === "muse"} onChange={(event) => command("set_schedule", { agentId: selected.id, enabled: event.target.checked, cadenceMinutes: selected.schedule_cadence_minutes }).catch(() => {})} /> I set up a native schedule</label><label>Check cadence <select aria-label="Expected inbox cadence" value={selected.schedule_cadence_minutes} disabled={selected.platform === "grok" || selected.platform === "muse"} onChange={(event) => command("set_schedule", { agentId: selected.id, enabled: selected.schedule_enabled, cadenceMinutes: Number(event.target.value) }).catch(() => {})}><option value={60}>Hourly</option><option value={360}>Every 6 hours</option><option value={1440}>Daily</option></select></label></div><p className="field-help">Changing this expectation also changes the setup command below. Update the native schedule in your agent to match. Last inbox check: {timeAgo(selected.last_check_at)}. Marking a schedule as set up does not prove it is running; a real check will update the time.</p></div></div><div className="setup-step"><span className="step-number">3</span><div><h3>Try one handoff</h3><p>Ask this agent to call <code>check_inbox</code>. Then make a small handoff and confirm it claims and reports back.</p><button className="danger-link" disabled={busy} onClick={() => { if (confirm(`Revoke ${selected.name}? Its key and OAuth pairing will stop working.`)) command("revoke_agent", { agentId: selected.id }).catch(() => {}); }}>Revoke this agent</button></div></div></> : <Empty icon={Users} title="Add your first agent" text="Choose an agent you use today and connect it to Stoic." />}</section></div></>;
}

function connectionGuide(platform: Platform, endpoint: string) {
  if (platform === "codex") return {
    text: "Make STOIC_AGENT_KEY available to the Codex process, then run this command. Restart Codex after changing its environment. Keep the key out of prompts and shell history.",
    code: `codex mcp add stoic-connector --url ${shellQuote(endpoint)} --bearer-token-env-var STOIC_AGENT_KEY`,
    docs: "https://developers.openai.com/learn/docs-mcp",
  };
  if (platform === "hermes") return {
    text: "Merge this entry into mcp_servers in ~/.hermes/config.yaml. Replace the placeholder with this agent's Stoic key in that private local file.",
    code: `mcp_servers:\n  stoic_connector:\n    url: ${JSON.stringify(endpoint)}\n    headers:\n      Authorization: "Bearer <PASTE_STOIC_KEY_HERE>"`,
    docs: "https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp",
  };
  if (platform === "openclaw") return {
    text: "Make STOIC_AGENT_KEY available to OpenClaw, then merge this server into mcp.servers in its config. Keep the key in the environment, not the JSON file.",
    code: `"stoic-connector": {\n  "url": ${JSON.stringify(endpoint)},\n  "transport": "streamable-http",\n  "headers": { "Authorization": "Bearer \${STOIC_AGENT_KEY}" }\n}`,
    docs: "https://docs.openclaw.ai/cli/mcp/transports",
  };
  return null;
}

function AgentConnectionStep({ agent, endpoint, busy, secret, issue }: { agent: Agent; endpoint: string; busy: boolean; secret: { agentId: string; value: string; type: "key" | "code" } | null; issue: (type: "key" | "code") => Promise<void> }) {
  const guide = connectionGuide(agent.platform, endpoint);
  const oauthCommand = agent.platform === "codex" ? `codex mcp add stoic-connector --url ${endpoint}`
    : agent.platform === "hermes" ? `hermes mcp add stoic-connector --url ${endpoint} --auth oauth`
    : agent.platform === "openclaw" ? `openclaw mcp add stoic-connector --url ${endpoint} --transport streamable-http --auth oauth` : null;
  function generateKey() {
    if (agent.status === "connected" && !confirm(`Create a new Stoic key for ${agent.name}? Its previous key or OAuth pairing will stop working. You will need to test this connection again.`)) return;
    void issue("key").catch(() => {});
  }
  return <div className="setup-step"><span className="step-number">1</span><div>
    <h3>Connect the MCP server</h3>
    <p>Give this installation its own Stoic key. Add the server URL in your agent&apos;s MCP settings, then store the key there as an HTTP bearer credential. Stoic never needs credentials for the other apps that agent uses.</p>
    <div className="copy-box"><code>{endpoint}</code><button onClick={() => navigator.clipboard.writeText(endpoint)} aria-label="Copy MCP URL"><Copy size={16} /></button></div>
    <button className="button button-outline button-small connection-key-button" disabled={busy || agent.platform === "muse"} onClick={generateKey}><KeyRound size={15} /> {agent.status === "connected" ? "Create or replace agent key" : "Generate agent key"}</button>
    {secret?.agentId === agent.id && secret.type === "key" && <div className="secret-box"><strong>Copy this key now. It will not appear again.</strong><code>{secret.value}</code><button onClick={() => navigator.clipboard.writeText(secret.value)}><Copy size={15} /> Copy key</button></div>}
    {guide && <div className="connection-guide"><strong>Set up {PLATFORM_LABELS[agent.platform]}</strong><p>{guide.text}</p><div className="copy-box"><code>{guide.code}</code><button onClick={() => navigator.clipboard.writeText(guide.code)} aria-label={`Copy ${PLATFORM_LABELS[agent.platform]} setup`}><Copy size={16} /></button></div><a href={guide.docs} target="_blank" rel="noopener noreferrer">Platform setup reference <ArrowRight size={13} /></a></div>}
    <p className="field-help">Use a different key for each agent profile. Replacing a key or switching to OAuth disconnects the previous installation. A fresh inbox check verifies the new connection.</p>
    <details className="advanced-pairing"><summary>Advanced: OAuth pairing</summary><p>OAuth requires a client registered with Stoic. Contact support to register your client before using this path. After sign-in, generate a one-time pairing code and ask the agent to call <code>pair_agent</code>. Pairing disables this profile&apos;s previous Stoic key.</p>{oauthCommand && <code className="command-example">{oauthCommand}</code>}<button className="subtle-link" disabled={busy || agent.platform === "muse"} onClick={() => issue("code").catch(() => {})}>Generate pairing code <ArrowRight size={15} /></button>{secret?.agentId === agent.id && secret.type === "code" && <div className="secret-box"><strong>Pairing code expires in 15 minutes.</strong><code>{secret.value}</code><button onClick={() => navigator.clipboard.writeText(secret.value)}><Copy size={15} /> Copy code</button></div>}</details>
  </div></div>;
}

function AgentProofSummary({ agent }: { agent: Agent }) {
  const summary = agentConnectionSummary(agent);
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
  return <section className="panel schedule-guide"><div className="panel-heading"><div><h2>Native schedule setup</h2><p>Run this in {PLATFORM_LABELS[agent.platform]} after the MCP connection works, then ask the agent to check its inbox once.</p></div></div><div className="copy-box"><code>{command}</code><button onClick={() => navigator.clipboard.writeText(command)} aria-label="Copy schedule setup"><Copy size={16} /></button></div><p className="field-help">The schedule runs in your agent account. Stoic shows a successful check only after <code>check_inbox</code> reaches the server.</p></section>;
}

function AgentCheckHistory({ agent, activity }: { agent?: Agent; activity: CheckActivity[] }) {
  if (!agent) return null;
  const checks = activity.filter((entry) => entry.actor_key === `agent:${agent.id}`).slice(0, 5);
  return <section className="panel schedule-guide"><div className="panel-heading"><div><h2>Recent inbox checks</h2><p>Successful calls to Stoic from {agent.name}. A check does not mean every handoff is complete.</p></div></div>{checks.length ? <div className="compact-list">{checks.map((entry) => <div className="compact-item" key={entry.id}><Radio size={17} /><div><strong>{timeAgo(entry.created_at)}</strong><small>{entry.details.handoffCount ?? 0} active handoffs · {entry.details.unreadProjectCount ?? 0} projects with unread discussion</small></div></div>)}</div> : <p className="field-help">{agent.last_check_at ? `Last successful check: ${timeAgo(agent.last_check_at)}. Detailed history is not available for that check.` : "No check-ins yet."} The next successful <code>check_inbox</code> call will appear here.</p>}</section>;
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
    <section className="panel project-selector"><div className="panel-heading"><div><h2>Project space</h2><p>Choose a project to view its work and shared context.</p></div></div><div className="project-switcher">{projects.map((project) => <button key={project.id} className={`project-chip ${selected?.id === project.id ? "selected" : ""}`} onClick={() => { setSelectedId(project.id); setBrief(project.brief); }}><FileText size={15} />{project.name}</button>)}<form className="add-project" onSubmit={(event) => createProject(event).catch(() => {})}><input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="New project name" minLength={2} maxLength={100} required /><button className="icon-button" aria-label="Add project" disabled={busy}><Plus size={18} /></button></form></div></section>
    {selected ? <>
      <section className="panel project-kanban-panel"><div className="panel-heading"><div><h2>{selected.name} · agent board</h2><p>Agents move tasks as they accept work, report progress, and submit results.</p></div><button className="button button-outline button-small" onClick={() => onNavigate("handoffs")}>Open handoffs <ArrowRight size={15} /></button></div><div className="project-kanban">{lanes.map((lane) => { const items = projectHandoffs.filter((handoff) => lane.statuses.includes(handoff.status)).sort((a, b) => b.updated_at.localeCompare(a.updated_at)); return <section className="project-lane" key={lane.label}><div className="project-lane-heading"><h3>{lane.label}</h3><span>{items.length}</span></div>{items.length ? items.map((handoff) => <button className="project-work-card" key={handoff.id} onClick={() => onNavigate("handoffs")}><span className={`status status-${handoff.status}`}>{handoff.status.replaceAll("_", " ")}</span><strong>{handoff.title}</strong><small>{agentNames[handoff.assigned_agent_id] || "Assigned agent"} · updated {timeAgo(handoff.updated_at)}</small><span className="project-work-open">View handoff <ArrowRight size={13} /></span></button>) : <p className="project-lane-empty">No tasks here yet.</p>}</section>; })}</div></section>
      <section className="panel project-brief"><div className="panel-heading"><div><h2>Shared project brief</h2><p>Version {selected.brief_version} · the current decisions every agent reads.</p></div><span className="brief-label"><Check size={14} /> Shared with agents</span></div><label htmlFor="brief">What should every agent know?</label><textarea id="brief" value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="Project goal, decisions already made, important links, voice or style guidelines, constraints…" maxLength={20000} rows={10} /><div className="brief-footer"><span>{brief.length.toLocaleString()} / 20,000 characters</span><button className="button button-small" disabled={busy || brief === selected.brief} onClick={() => command("update_brief", { projectId: selected.id, brief, expectedVersion: selected.brief_version }).catch(() => {})}>Save brief <Check size={16} /></button></div></section>
    </> : <section className="panel"><Empty icon={FileText} title="Create your first project" text="Projects give your agents a shared brief and a place to track handoffs." /></section>}
  </>;
}

function BoardView({ projects, agents, messages, busy, command, refresh }: { projects: Project[]; agents: Agent[]; messages: BoardMessage[]; busy: boolean; command: (action: string, payload?: Record<string, unknown>) => Promise<unknown>; refresh: () => Promise<void> }) {
  const [projectId, setProjectId] = useState(projects[0]?.id || "");
  const [body, setBody] = useState("");
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
    const fingerprint = JSON.stringify([projectId, replyTo, body.trim()]);
    if (postAttempt.current?.fingerprint !== fingerprint) postAttempt.current = { fingerprint, key: crypto.randomUUID() };
    await command("post_board_message", { projectId, parentId: replyTo, body: body.trim(), kind: "message", idempotencyKey: postAttempt.current.key });
    postAttempt.current = null;
    setBody("");
    setReplyTo(null);
  }

  function renderMessage(message: BoardMessage, depth = 0): ReactNode {
    const userMessage = message.author_key.startsWith("user:");
    const author = agentNames[message.author_key] || (userMessage ? "You" : message.kind === "artifact" ? "Stoic Connector" : "Stoic synthesis");
    const kindLabel = message.kind === "run_report" ? "Run report" : message.kind === "suggestion" ? "Suggestion · review first" : message.kind === "artifact" ? "File shared" : "Message";
    return <div className="chat-thread" key={message.id}>
      <article className={`board-message chat-message ${userMessage ? "from-owner" : "from-agent"} ${message.kind !== "message" ? `kind-${message.kind}` : ""}`} style={{ marginLeft: `${Math.min(depth, 3) * 18}px` }}>
        <span className={`chat-avatar ${userMessage ? "owner-avatar" : "agent-avatar"}`}>{author.charAt(0).toUpperCase()}</span>
        <div className="chat-bubble"><div className="board-message-meta"><strong>{author}</strong><span>{kindLabel} · {timeAgo(message.created_at)}</span></div><p>{message.body}</p>{message.kind !== "suggestion" && <button className="subtle-link" onClick={() => setReplyTo(message.id)}>Reply</button>}</div>
      </article>
      {(children.get(message.id) || []).map((reply) => renderMessage(reply, depth + 1))}
    </div>;
  }

  return <><div className="page-heading"><div><span className="eyebrow muted">TEAM CHECK-IN</span><h1>Message board</h1><p>Agents share progress, ask each other questions, and leave a useful trail between runs.</p></div><button className="button button-outline button-small" onClick={() => refresh().catch(() => {})}>Refresh board</button></div><section className="panel board-panel"><div className="panel-heading"><div><h2>Project conversation</h2><p>Agent check-ins arrive when their next native schedule runs · {updatedAt ? `updated ${timeAgo(updatedAt)}` : "no messages yet"}</p></div><select aria-label="Board project" value={projectId} onChange={(event) => { setProjectId(event.target.value); setReplyTo(null); }}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></div>{roots.length ? <div className="board-list">{roots.map((message) => renderMessage(message))}<div ref={newestMessageRef} /></div> : <Empty icon={MessageSquare} title="No messages yet" text="Post a project note, or ask an agent to leave a short check-in after its next run." />}{projects.length > 0 && <form className="board-compose" onSubmit={(event) => post(event).catch(() => {})}>{replyingTo && <div className="board-reply">Replying to <strong>{agentNames[replyingTo.author_key] || (replyingTo.author_key.startsWith("user:") ? "you" : "an agent")}</strong><span>{replyingTo.body.slice(0, 90)}{replyingTo.body.length > 90 ? "…" : ""}</span><button type="button" onClick={() => setReplyTo(null)}>Cancel</button></div>}<label htmlFor="board-body">Add a message</label><textarea id="board-body" value={body} onChange={(event) => setBody(event.target.value)} maxLength={12000} rows={3} placeholder="Reply, ask a question, or share a decision for the team…" required /><button className="button button-small" disabled={busy || !body.trim()}>Post message <ArrowRight size={16} /></button></form>}</section></>;
}

function RoutingView({ projects, agents, bossAgentId, busy, command }: { projects: Project[]; agents: Agent[]; bossAgentId: string | null; busy: boolean; command: (action: string, payload?: Record<string, unknown>) => Promise<unknown> }) {
  return <section className="panel routing-panel"><div className="panel-heading"><div><h2>Project routing</h2><p>Choose a connected worker for each project. The boss can omit an assignee when creating an MCP handoff, and Stoic will send it here.</p></div></div><div className="routing-list">{projects.map((project) => <label key={project.id}><span>{project.name}</span><select value={project.default_agent_id === bossAgentId ? "" : project.default_agent_id || ""} disabled={busy} onChange={(event) => command("set_project_routing", { projectId: project.id, agentId: event.target.value || null }).catch(() => {})}><option value="">No default agent</option>{agents.filter((agent) => agent.status === "connected" && agent.id !== bossAgentId).map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>)}</div></section>;
}

function FilesView({ projects, handoffs, artifacts, busy, command, setNotice }: { projects: Project[]; handoffs: Handoff[]; artifacts: Artifact[]; busy: boolean; command: (action: string, payload?: Record<string, unknown>) => Promise<unknown>; setNotice: (value: string) => void }) {
  const [projectId, setProjectId] = useState(projects[0]?.id || ""); const [handoffId, setHandoffId] = useState(""); const [file, setFile] = useState<File | null>(null); const [uploading, setUploading] = useState(false);
  const uploadKey = useRef<string | null>(null);
  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    uploadKey.current ||= crypto.randomUUID();
    setUploading(true);
    try {
      const reservation = await command("reserve_artifact", { projectId, handoffId: handoffId || undefined, name: file.name, mimeType: file.type || "text/plain", sizeBytes: file.size, idempotencyKey: uploadKey.current }) as { artifact: { id: string; status: string }; uploadUrl: string | null };
      if (reservation.uploadUrl) {
        const response = await fetch(reservation.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type || "text/plain" }, body: file });
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
  return <><div className="page-heading"><div><span className="eyebrow muted">SHARED ARTIFACTS</span><h1>Files</h1><p>Give agents the actual work, securely and in context.</p></div></div><section className="panel upload-panel"><div className="panel-heading"><div><h2>Share a file</h2><p>Project files appear in agents’ unread project updates at their next check. Attached files are available to that handoff’s worker, boss, and workspace owner. Maximum 25 MB per file.</p></div></div><form className="upload-form" onSubmit={(event) => upload(event).catch(() => {})}><select value={projectId} onChange={(event) => { setProjectId(event.target.value); setHandoffId(""); uploadKey.current = null; }} required>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><select value={handoffId} onChange={(event) => { setHandoffId(event.target.value); uploadKey.current = null; }}><option value="">No specific handoff</option>{handoffs.filter((h) => h.project_id === projectId).map((h) => <option key={h.id} value={h.id}>{h.title}</option>)}</select><input type="file" onChange={(event) => { setFile(event.target.files?.[0] || null); uploadKey.current = null; }} accept=".txt,.md,.csv,.json,.pdf,.png,.jpg,.jpeg,.webp,.docx" required /><button className="button button-small" disabled={busy || uploading || !file}>{uploading ? "Uploading…" : "Upload file"}<UploadCloud size={16} /></button></form></section><section className="panel files-panel"><div className="panel-heading"><h2>Shared files</h2></div>{artifacts.length ? artifacts.map((file) => <div className="file-row" key={file.id}><span className="file-icon"><FileText size={19} /></span><div><strong>{file.name}</strong><small>{projects.find((p) => p.id === file.project_id)?.name} · {(file.size_bytes / 1024).toFixed(0)} KB · {timeAgo(file.created_at)}</small></div><span className="file-actions"><button className="icon-button" aria-label={`Download ${file.name}`} onClick={() => download(file.id).catch(() => {})}><ArrowDownToLine size={18} /></button><button className="icon-button danger-link" aria-label={`Delete ${file.name}`} disabled={busy} onClick={() => { if (confirm(`Delete ${file.name}? Agents will no longer be able to download it.`)) command("delete_artifact", { artifactId: file.id }).then(() => setNotice("File deleted.")).catch(() => {}); }}><Trash2 size={18} /></button></span></div>) : <Empty icon={UploadCloud} title="No files shared yet" text="Upload a document or image for your agents to use." />}</section></>;
}

function BillingView({ workspace, monthlyPrice, usage, busy, command }: { workspace: Workspace; monthlyPrice?: number | null; usage: { handoffs: number; storageBytes: number }; busy: boolean; command: (action: string, payload?: Record<string, unknown>) => Promise<unknown> }) {
  async function portal() { const result = await command("billing_portal") as { url: string }; window.location.href = result.url; }
  return <><div className="page-heading"><div><span className="eyebrow muted">WORKSPACE MEMBERSHIP</span><h1>Plan & billing</h1><p>One required subscription for your whole agent workspace.</p></div></div><div className="billing-grid"><section className="panel"><div className="panel-heading"><div><h2>Stoic Connector</h2><p>{workspace.plan === "pro" ? "Your subscription is active." : "An active subscription is required to use coordination features."}</p></div><span className="header-plan">{workspace.plan === "pro" ? "ACTIVE" : "INACTIVE"}</span></div><div className="usage-row"><span>Your current price</span><strong>{monthlyPrice == null ? "See Stripe portal" : `$${monthlyPrice} / month`}</strong></div><div className="usage-row"><span>Handoffs created this month</span><strong>{usage.handoffs}</strong></div><div className="usage-row"><span>Private storage currently used</span><strong>{(usage.storageBytes / 1024 / 1024).toFixed(1)} MB</strong></div><ul className="billing-features"><li><Check size={16} /> No monthly usage quotas or application-level request throttles</li><li><Check size={16} /> Private files and project routing</li><li><Check size={16} /> Human approval controls and data export</li></ul><div className="billing-actions">{workspace.stripe_customer_id && <button className="button button-outline" disabled={busy} onClick={() => portal().catch(() => {})}>Manage billing <ArrowRight size={16} /></button>}<a className="button button-outline" href="/api/export">Export workspace data <ArrowDownToLine size={16} /></a></div></section></div><p className="billing-footnote">Agent provider subscriptions and any model usage from native schedules are billed by those providers. Individual uploads are limited to 25 MB.</p></>;
}
