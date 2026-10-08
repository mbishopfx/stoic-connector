export type Agent = {
  id: string;
  name: string;
  platform: string;
  harness_name?: string | null;
  status: string;
  access_notes?: string;
  schedule_enabled?: boolean;
  schedule_cadence_minutes?: number;
  last_check_at?: string | null;
};

export type Project = {
  id: string;
  name: string;
  brief_version: number;
  default_agent_id?: string | null;
  brief?: string;
};

export type ActivityMetrics = {
  mcpToolCalls: number;
  mcpToolErrors: number;
  agentMcpToolCalls: number;
  mcpToolCounts: Record<string, { calls: number; errors: number }>;
  taskEvents: number;
  agentTaskEvents: number;
  boardMessages: number;
  agentBoardMessages: number;
  agentToAgentReplies: number;
  auditActions: number;
  activeAgents: number;
};

export type ActivityAnalytics = {
  available: boolean;
  captureStartedAt: string | null;
  latestWindow: {
    windowStart: string;
    windowEnd: string;
    metrics: ActivityMetrics | null;
    analysisStatus: "pending" | "running" | "complete" | "failed";
    analysisSummary: string | null;
    analysisObservations: string[];
  } | null;
  daily: {
    date: string;
    recordedWindows: number;
    expectedWindows: number;
    complete: boolean;
    mcpToolCalls: number | null;
    agentTaskEvents: number | null;
    agentBoardMessages: number | null;
    agentToAgentReplies: number | null;
    auditActions: number | null;
  }[];
};

export type TeamContext = {
  workspace: { id: string; name: string; delegationLevel: "observe" | "propose" | "delegate" };
  self: { agentId: string; role: "boss" | "worker" };
  bossAgentId: string | null;
  agents: Agent[];
  projects: Project[];
  nextSteps?: string[];
  boundaries?: string[];
};

export type McpRuntime = {
  callTool<T = unknown>(name: string, args?: Record<string, unknown>): Promise<T>;
  openLink(url: string): Promise<void>;
  notify(message: string, tone?: "success" | "error"): void;
  refreshContext(options?: { quiet?: boolean; refreshInbox?: boolean }): Promise<void>;
  selectProject(projectId: string): void;
};

export type McpTabProps = {
  context: TeamContext;
  projectId: string;
  runtime: McpRuntime;
};

export type NavTab =
  | "analytics"
  | "assistant"
  | "ideas"
  | "overview"
  | "handoffs"
  | "contacts"
  | "projects"
  | "agents"
  | "prompts"
  | "knowledge"
  | "install"
  | "files"
  | "billing";

export const navSections: { label: string; items: { id: NavTab; label: string }[] }[] = [
  { label: "START", items: [{ id: "analytics", label: "Analytics" }, { id: "assistant", label: "Stoic Chat" }, { id: "ideas", label: "Ideas" }] },
  { label: "WORK", items: [
    { id: "overview", label: "Overview" },
    { id: "handoffs", label: "Handoffs" },
    { id: "contacts", label: "Contacts" },
    { id: "projects", label: "Projects" },
  ] },
  { label: "TEAM", items: [
    { id: "agents", label: "Agents" },
    { id: "install", label: "Installation" },
    { id: "prompts", label: "Prompt library" },
    { id: "knowledge", label: "Knowledge" },
    { id: "files", label: "Artifacts" },
  ] },
  { label: "ACCOUNT", items: [{ id: "billing", label: "Plan & billing" }] },
];
