// Retired vanilla renderer. The MCP App build now bundles widget-react.tsx and widget.css.
import { App, PostMessageTransport } from "@modelcontextprotocol/ext-apps";
import { safeArtifactMime } from "../lib/artifact-mime";
import { parseRichInline, parseRichText, plainRichText } from "../lib/rich-text";
import { promptLibrary, renderStoicPrompt } from "../lib/prompt-library";
import { DEFAULT_CONTACT_FILTERS, type ContactSearchFilters } from "../lib/contact-filters";

type Agent = {
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
type Project = { id: string; name: string; brief_version: number; default_agent_id?: string | null; brief?: string };
type TeamContext = {
  workspace: { id: string; name: string; delegationLevel: "observe" | "propose" | "delegate" };
  self: { agentId: string; role: "boss" | "worker" };
  bossAgentId: string | null;
  agents: Agent[];
  projects: Project[];
  nextSteps?: string[];
  boundaries?: string[];
};
type Handoff = {
  id: string;
  project_id: string;
  title: string;
  goal?: string;
  constraints?: string;
  status: string;
  assigned_agent_id: string | null;
  created_at?: string;
  updated_at?: string;
};
type BoardMessage = {
  id: string;
  author_key: string;
  kind: string;
  parent_id: string | null;
  body: string;
  created_at: string;
};
type ChatAttachment = { id: string; name: string; sizeBytes: number };
type IntakeProposal = {
  projectId: string;
  title: string;
  goal: string;
  constraints: string;
  artifactIds: string[];
  attachments: ChatAttachment[];
  workerCount: number;
  idempotencyKey: string;
  status: "ready" | "sending" | "sent" | "dismissed";
  sentForReview?: boolean;
  handoffId?: string;
};
type ChatTurn = { id: string; role: "user" | "stoic"; body: string; attachments?: ChatAttachment[]; proposal?: IntakeProposal; thinking?: boolean };
type ContactSource = { id: string; source_label: string; notes: string; artifact_id: string | null; created_at: string };
type Contact = { id: string; project_id: string | null; full_name: string; email: string | null; phone: string | null; company: string | null; job_title: string | null; status: string; last_seen_at: string; sources: ContactSource[] };
type NavTab = "assistant" | "ideas" | "overview" | "handoffs" | "board" | "contacts" | "projects" | "agents" | "prompts" | "knowledge" | "files";

const app = new App({ name: "Stoic Connector", version: "0.1.0" });
const SITE_URL = "https://stoic.bishoptech.dev/dashboard";
const byId = (id: string) => document.getElementById(id)!;
const pageRoot = byId("page-root");
const projectSelect = byId("project-select") as HTMLSelectElement;
const errorBox = byId("error-message");
const successBox = byId("success-message");
const contextStatus = byId("connection-status");

const iconPaths: Record<string, string> = {
  assistant: "M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z",
  ideas: "M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18",
  overview: "M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25a2.25 2.25 0 0 1-2.25 2.25h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 15.75V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z",
  handoffs: "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192-.37-.03-.745-.057-1.123-.08m-5.801 0a2.25 2.25 0 0 1 2.15-1.586H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z",
  board: "M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155",
  contacts: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-11.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Zm-4.5 7.5a4.5 4.5 0 0 1 9 0",
  prompts: "M8.25 4.5h10.5A2.25 2.25 0 0 1 21 6.75v12A2.25 2.25 0 0 1 18.75 21H8.25A2.25 2.25 0 0 1 6 18.75v-12A2.25 2.25 0 0 1 8.25 4.5ZM6 7.5H4.5A1.5 1.5 0 0 0 3 9v9a1.5 1.5 0 0 0 1.5 1.5H6M9 10.5h9m-9 3h9m-9 3h6",
  projects: "M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z",
  agents: "M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z",
  knowledge: "M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25",
  files: "m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13",
  refresh: "M16.023 9.348h4.992V4.356m-.479 5.016a9 9 0 1 0 2.213 7.056M8.163 14.652H3.171v4.992m.479-5.016a9 9 0 1 0-2.213-7.056",
  moon: "M21.752 15.002A9.718 9.718 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.598.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z",
  sun: "M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-6.364-1.636 1.591-1.591M3 12h2.25m.386-6.364 1.591 1.591M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z",
  paperclip: "m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32a1.5 1.5 0 0 1-2.12-2.12l7.81-7.81",
  microphone: "M12 18.75a6 6 0 0 0 6-6v-1.5m-12 0v1.5a6 6 0 0 0 6 6Zm0 0V21m0-2.25h3.75M12 15.75a3 3 0 0 0 3-3v-7.5a3 3 0 0 0-6 0v7.5a3 3 0 0 0 3 3Z",
  speaker: "M19.114 5.636a9 9 0 0 1 0 12.728M16.293 8.457a5 5 0 0 1 0 7.086M5.25 9.75H3.75A.75.75 0 0 0 3 10.5v3a.75.75 0 0 0 .75.75h1.5l4.72 3.776A.75.75 0 0 0 11.25 17.5v-11a.75.75 0 0 0-1.28-.53L5.25 9.75Z",
  send: "M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18",
  plus: "M12 4.5v15m7.5-7.5h-15",
  stop: "M6.75 6.75h10.5v10.5H6.75z",
};
const navSections: { label: string; items: { id: NavTab; label: string; icon: string }[] }[] = [
  { label: "START", items: [{ id: "assistant", label: "Stoic chat", icon: "assistant" }, { id: "ideas", label: "Ideas", icon: "ideas" }] },
  { label: "WORK", items: [{ id: "overview", label: "Overview", icon: "overview" }, { id: "handoffs", label: "Handoffs", icon: "handoffs" }, { id: "board", label: "Message board", icon: "board" }, { id: "contacts", label: "Contacts", icon: "contacts" }, { id: "projects", label: "Projects", icon: "projects" }] },
  { label: "TEAM", items: [{ id: "agents", label: "Agents", icon: "agents" }, { id: "prompts", label: "Prompt library", icon: "prompts" }, { id: "knowledge", label: "Knowledge", icon: "knowledge" }, { id: "files", label: "Artifacts", icon: "files" }] },
];
const navItems = navSections.flatMap((section) => section.items);
const state: {
  context?: TeamContext;
  inbox: Handoff[];
  handoffs: Handoff[];
  messages: BoardMessage[];
  checks: Record<string, unknown>[];
  projectId: string;
  tab: NavTab;
  replyTo: string | null;
  selectedNote: string | null;
  selectedNoteBody: string;
  searchTerm: string;
  contactFilters: ContactSearchFilters;
  chatTurns: ChatTurn[];
  chatMessage: string;
  chatFiles: File[];
  chatBusy: boolean;
  voiceReply: boolean;
  recorder: MediaRecorder | null;
  recordingStream: MediaStream | null;
  recordingChunks: BlobPart[];
} = {
  inbox: [], handoffs: [], messages: [], checks: [], projectId: "", tab: "assistant",
  replyTo: null, selectedNote: null, selectedNoteBody: "", searchTerm: "", contactFilters: { ...DEFAULT_CONTACT_FILTERS },
  chatTurns: [], chatMessage: "", chatFiles: [], chatBusy: false, voiceReply: false,
  recorder: null, recordingStream: null, recordingChunks: [],
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function appendRichInline(parent: HTMLElement, source: string) {
  for (const part of parseRichInline(source)) {
    if (part.type === "text") { parent.append(document.createTextNode(part.text)); continue; }
    const tag = part.type === "strong" ? "strong" : part.type === "emphasis" ? "em" : part.type === "strike" ? "s" : part.type === "code" ? "code" : "a";
    const node = el(tag) as HTMLElement;
    if (part.type === "link") {
      (node as HTMLAnchorElement).href = part.href;
      (node as HTMLAnchorElement).target = "_blank";
      (node as HTMLAnchorElement).rel = "noreferrer";
    }
    node.textContent = part.text;
    parent.append(node);
  }
}

function appendRichText(parent: HTMLElement, source: string, className = "rich-text") {
  const root = el("div", className);
  parseRichText(source).forEach((block) => {
    if (block.type === "rule") { root.append(el("hr")); return; }
    if (block.type === "code") {
      const pre = el("pre");
      pre.append(el("code", "", block.text));
      root.append(pre);
      return;
    }
    if (block.type === "heading") {
      const heading = el(`h${block.level}` as "h3" | "h4" | "h2");
      appendRichInline(heading, block.text);
      root.append(heading);
      return;
    }
    if (block.type === "unordered" || block.type === "ordered") {
      const list = el(block.type === "unordered" ? "ul" : "ol");
      block.items.forEach((itemText) => {
        const item = el("li");
        appendRichInline(item, itemText);
        list.append(item);
      });
      root.append(list);
      return;
    }
    const element = el(block.type === "quote" ? "blockquote" : "p");
    appendRichInline(element, block.text);
    root.append(element);
  });
  parent.append(root);
}

function svgIcon(name: string, className = "") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.7");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  if (className) svg.setAttribute("class", className);
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", iconPaths[name] || iconPaths.overview);
  svg.append(path);
  return svg;
}

function textValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function dateValue(value: unknown) {
  if (typeof value !== "string" || !value) return "No check recorded";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "No check recorded" : date.toLocaleString();
}

function formatSize(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  if (value < 1024) return value + " B";
  if (value < 1024 * 1024) return (value / 1024).toFixed(0) + " KB";
  return (value / (1024 * 1024)).toFixed(1) + " MB";
}

async function callTool<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const result = await app.callServerTool({ name, arguments: args });
  const bodyText = result.content.find((item) => item.type === "text")?.text || "{}";
  let value: unknown;
  try {
    value = result.structuredContent ?? JSON.parse(bodyText);
  } catch {
    value = { error: bodyText };
  }
  if (result.isError || (value && typeof value === "object" && "error" in value)) {
    throw new Error(value && typeof value === "object" && "error" in value ? String(value.error) : "Stoic could not complete that request.");
  }
  return value as T;
}

function clearNotice() {
  errorBox.textContent = "";
  successBox.textContent = "";
  errorBox.classList.add("hidden");
  successBox.classList.add("hidden");
}

function showError(message: string) {
  successBox.classList.add("hidden");
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

function showSuccess(message: string) {
  errorBox.classList.add("hidden");
  successBox.textContent = message;
  successBox.classList.remove("hidden");
}

function connectedWorkers() {
  return (state.context?.agents || []).filter((agent) => agent.status === "connected" && agent.platform !== "muse" && agent.id !== state.context?.self.agentId);
}

function canAssign() {
  return state.context?.self.role === "boss" && state.context.workspace.delegationLevel !== "observe";
}

function activeHandoffCount() {
  return state.handoffs.filter((handoff) => !["accepted", "cancelled"].includes(handoff.status)).length;
}

function renderNav() {
  const root = byId("nav-sections");
  root.replaceChildren();
  for (const section of navSections) {
    const group = el("div", "nav-section");
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", section.label);
    for (const item of section.items) {
      const navButton = el("button", "nav-link");
      navButton.type = "button";
      navButton.title = item.label;
      navButton.setAttribute("aria-label", item.label);
      navButton.setAttribute("aria-current", state.tab === item.id ? "page" : "false");
      navButton.append(svgIcon(item.icon));
      if (item.id === "handoffs" && activeHandoffCount() > 0) {
        navButton.append(el("span", "nav-count", String(Math.min(activeHandoffCount(), 99))));
      }
      navButton.addEventListener("click", () => void setTab(item.id));
      group.append(navButton);
    }
    root.append(group);
  }
}

function updateShell() {
  if (!state.context) return;
  byId("stoic-app").classList.toggle("chat-active", state.tab === "assistant");
  const workspaceInitial = state.context.workspace.name.charAt(0).toUpperCase() || "S";
  const roleInitial = state.context.self.role.charAt(0).toUpperCase();
  byId("workspace-mark").textContent = workspaceInitial;
  byId("workspace-mark").setAttribute("title", state.context.workspace.name);
  byId("workspace-mark").setAttribute("aria-label", "Workspace: " + state.context.workspace.name);
  byId("rail-user").textContent = roleInitial;
  byId("rail-user").setAttribute("title", "Connected as " + state.context.self.role);
  byId("account-avatar").textContent = roleInitial;
  byId("account-avatar").setAttribute("title", "Connected as " + state.context.self.role);
  contextStatus.querySelector("span:last-child")!.textContent = "Connected as " + state.context.self.role;

  projectSelect.replaceChildren();
  for (const project of state.context.projects) {
    const option = el("option", "", project.name);
    option.value = project.id;
    projectSelect.append(option);
  }
  if (!state.context.projects.length) {
    const option = el("option", "", "No project yet");
    option.value = "";
    projectSelect.append(option);
  }
  projectSelect.value = state.projectId;
  renderNav();
  updateBreadcrumb();
}

function updateBreadcrumb() {
  const item = navItems.find((candidate) => candidate.id === state.tab);
  const title = byId("breadcrumb-title");
  title.textContent = state.tab === "assistant" ? "Stoic" : item?.label || "Stoic";
  title.classList.toggle("sr-only", state.tab !== "assistant");
  byId("breadcrumb").setAttribute("aria-label", (state.context?.workspace.name || "Stoic") + " · " + (item?.label || "Stoic"));
  byId("breadcrumb").setAttribute("title", (state.context?.workspace.name || "Stoic") + " · " + (item?.label || "Stoic"));
  const icon = byId("breadcrumb-icon");
  icon.replaceChildren(svgIcon(item?.icon || "assistant"));
  byId("workspace-breadcrumb").textContent = state.context?.workspace.name || "";
}

function makeButton(label: string, className = "button", action?: () => void | Promise<void>) {
  const button = el("button", className, label);
  button.type = "button";
  if (action) {
    button.addEventListener("click", () => {
      button.disabled = true;
      clearNotice();
      void Promise.resolve(action())
        .catch((error: unknown) => showError(error instanceof Error ? error.message : "Stoic could not complete that request."))
        .finally(() => { button.disabled = false; });
    });
  }
  return button;
}

function makePage(kicker: string, title: string, description: string) {
  const inner = el("div", "page-inner");
  const heading = el("header", "page-heading");
  const copy = el("div");
  copy.append(el("p", "eyebrow", kicker), el("h1", "", title), el("p", "", description));
  heading.append(copy);
  inner.append(heading);
  pageRoot.replaceChildren(inner);
  return inner;
}

function makeSurface(title: string, description = "") {
  const surface = el("section", "surface");
  const heading = el("div", "surface-head");
  const copy = el("div");
  copy.append(el("h2", "", title));
  if (description) copy.append(el("p", "", description));
  heading.append(copy);
  const body = el("div", "surface-body");
  surface.append(heading, body);
  return { surface, body, heading };
}

function emptyState(title: string, description: string) {
  const empty = el("div", "empty-state");
  const copy = el("div");
  copy.append(el("strong", "", title), el("p", "", description));
  empty.append(copy);
  return empty;
}

function statusTag(status: string) {
  const knownGood = ["connected", "ready", "submitted", "accepted", "completed"];
  const knownWarn = ["blocked", "changes_requested", "proposed", "pending", "paused"];
  const tag = el("span", "tag" + (knownGood.includes(status) ? " good" : knownWarn.includes(status) ? " warn" : " info"), status.replaceAll("_", " "));
  return tag;
}

function currentProject() {
  return state.context?.projects.find((project) => project.id === state.projectId);
}

async function projectSnapshot(projectId = state.projectId) {
  if (!projectId) {
    state.handoffs = [];
    state.messages = [];
    return;
  }
  const [handoffResult, boardResult] = await Promise.all([
    callTool<{ handoffs: Handoff[] }>("list_project_handoffs", { projectId, offset: 0 }),
    callTool<{ messages: BoardMessage[] }>("read_project_board", { projectId, offset: 0 }),
  ]);
  state.handoffs = handoffResult.handoffs || [];
  state.messages = (boardResult.messages || []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
}

function recentChatPairs() {
  const pairs: { prompt: string; response: string }[] = [];
  for (let index = 0; index < state.chatTurns.length; index++) {
    const turn = state.chatTurns[index];
    if (turn.role !== "stoic" || turn.thinking) continue;
    const previous = state.chatTurns[index - 1];
    if (previous?.role === "user") pairs.push({ prompt: previous.body.slice(0, 700), response: turn.body.slice(0, 700) });
  }
  return pairs.slice(-2);
}

function addChatFiles(files: File[]) {
  const accepted: File[] = [];
  for (const file of files) {
    if (!file.size) { showError(`${file.name} is empty.`); continue; }
    if (file.size > 25 * 1024 * 1024) { showError(`${file.name} is larger than the 25 MB file limit.`); continue; }
    if (state.chatFiles.length + accepted.length >= 5) { showError("Attach up to five files to one message."); break; }
    accepted.push(file);
  }
  if (accepted.length) {
    clearNotice();
    state.chatFiles = [...state.chatFiles, ...accepted];
    renderAssistant();
  }
}

async function uploadChatFile(projectId: string, file: File): Promise<ChatAttachment> {
  const mimeType = safeArtifactMime(file.type);
  const reservation = await callTool<{
    artifact: { id: string; name: string; size_bytes: number };
    uploadUrl: string | null;
  }>("create_artifact_upload", {
    projectId,
    name: file.name,
    mimeType,
    sizeBytes: file.size,
    idempotencyKey: crypto.randomUUID(),
  });
  if (reservation.uploadUrl) {
    const response = await fetch(reservation.uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: file });
    if (!response.ok) throw new Error(`Could not upload ${file.name}`);
    await callTool("complete_artifact_upload", { artifactId: reservation.artifact.id });
  }
  return { id: reservation.artifact.id, name: reservation.artifact.name, sizeBytes: reservation.artifact.size_bytes };
}

function proposalStatusLabel(proposal: IntakeProposal) {
  if (proposal.status === "sending") return "ADDING TO TEAM QUEUE";
  if (proposal.status === "sent") return proposal.sentForReview ? "SENT FOR OWNER REVIEW" : "SENT TO TEAM QUEUE";
  if (proposal.status === "dismissed") return "DISMISSED";
  return "READY FOR REVIEW";
}

async function confirmChatProposal(turn: ChatTurn) {
  const proposal = turn.proposal;
  if (!proposal || proposal.status !== "ready" || !state.context || !proposal.projectId) return;
  if (!canAssign()) throw new Error("This profile cannot create a handoff in the current delegation mode.");
  if (connectedWorkers().length === 0) throw new Error("Connect a worker before adding this handoff to the team queue.");
  proposal.status = "sending";
  clearNotice();
  renderAssistant();
  const fileLine = proposal.attachments.map((file) => `${file.name.replace(/[\r\n]/g, " ").slice(0, 180)} (artifact ${file.id})`).join("; ");
  const constraints = [
    proposal.constraints.trim(),
    "Before spending, publishing, deleting, contacting third parties, or changing external services, request owner approval.",
    fileLine && `Relevant project files: ${fileLine}. Read them through Stoic only when needed.`,
  ].filter(Boolean).join("\n\n").slice(0, 10000);
  try {
    const result = await callTool<{ handoff?: Handoff }>("create_handoff", {
      projectId: proposal.projectId,
      teamQueue: true,
      title: proposal.title.trim(),
      goal: proposal.goal.trim(),
      constraints,
      idempotencyKey: proposal.idempotencyKey,
    });
    const handoff = result.handoff;
    const sentForReview = handoff?.status === "proposed";
    proposal.status = "sent";
    proposal.sentForReview = sentForReview;
    proposal.handoffId = handoff?.id;
    turn.body = sentForReview
      ? "Sent for owner review. It will be available to workers after approval."
      : "Added to the shared team queue. The first eligible worker to claim it becomes the assignee.";
    if (state.projectId === proposal.projectId) await projectSnapshot(proposal.projectId);
    renderNav();
    showSuccess(sentForReview ? "Handoff sent for owner review." : "Handoff added. Workers will see it on their next successful inbox check.");
  } catch (error) {
    proposal.status = "ready";
    throw error;
  } finally {
    if (state.tab === "assistant" && state.projectId === proposal.projectId) renderAssistant();
    else void renderCurrentTab();
  }
}

function renderChatTurn(turn: ChatTurn) {
  const row = el("article", `chat-turn chat-turn-${turn.role}`);
  const label = el("div", "chat-turn-label", turn.role === "user" ? "You" : "Stoic");
  const bubble = el("div", "chat-turn-bubble");
  if (turn.thinking) {
    const thinking = el("div", "chat-thinking");
    thinking.append(el("span", "chat-thinking-dots", "···"), el("span", "", "Organizing your request…"));
    bubble.append(thinking);
  } else appendRichText(bubble, turn.body);
  if (turn.attachments?.length) {
    const attachments = el("div", "chat-attachments");
    for (const file of turn.attachments) attachments.append(el("span", "chat-attachment", `${file.name} · ${formatSize(file.sizeBytes)}`));
    bubble.append(attachments);
  }
  if (turn.proposal) bubble.append(renderChatProposal(turn));
  row.append(label, bubble);
  return row;
}

function renderChatProposal(turn: ChatTurn) {
  const proposal = turn.proposal!;
  const card = el("section", "chat-proposal");
  const header = el("div", "chat-proposal-header");
  header.append(el("span", "eyebrow", "HANDOFF DRAFT"), el("span", "chat-proposal-status", proposalStatusLabel(proposal)));
  const title = el("input") as HTMLInputElement;
  title.className = "chat-proposal-title";
  title.setAttribute("aria-label", "Handoff title");
  title.value = proposal.title;
  title.maxLength = 160;
  title.disabled = proposal.status !== "ready";
  title.addEventListener("input", () => { proposal.title = title.value; });
  const goal = el("textarea") as HTMLTextAreaElement;
  goal.className = "chat-proposal-goal";
  goal.setAttribute("aria-label", "Handoff goal");
  goal.value = proposal.goal;
  goal.maxLength = 10000;
  goal.disabled = proposal.status !== "ready";
  goal.addEventListener("input", () => { proposal.goal = goal.value; });
  card.append(header, title, goal);
  const details = el("details", "chat-proposal-details");
  details.append(el("summary", "", "Constraints and approvals"));
  const constraints = el("textarea") as HTMLTextAreaElement;
  constraints.value = proposal.constraints;
  constraints.maxLength = 10000;
  constraints.placeholder = "Boundaries, decisions, or approvals needed";
  constraints.setAttribute("aria-label", "Handoff constraints");
  constraints.disabled = proposal.status !== "ready";
  constraints.addEventListener("input", () => { proposal.constraints = constraints.value; });
  details.append(constraints);
  card.append(details);
  const meta = el("div", "chat-proposal-meta");
  meta.append(el("span", "", `Available to ${proposal.workerCount} connected ${proposal.workerCount === 1 ? "worker" : "workers"}`));
  if (proposal.attachments.length) meta.append(el("span", "", `${proposal.attachments.length} linked ${proposal.attachments.length === 1 ? "file" : "files"}`));
  card.append(meta);
  if (proposal.status === "ready") {
    const actions = el("div", "chat-proposal-actions");
    const addButton = makeButton(state.context?.workspace.delegationLevel === "propose" ? "Send for owner review" : "Add to handoff queue", "button primary", async () => confirmChatProposal(turn));
    const validate = () => { addButton.disabled = title.value.trim().length < 3 || goal.value.trim().length < 10; };
    title.addEventListener("input", validate);
    goal.addEventListener("input", validate);
    validate();
    actions.append(
      addButton,
      makeButton("Dismiss", "button text", () => {
        proposal.status = "dismissed";
        turn.body = "Draft dismissed. No handoff was created.";
        renderAssistant();
      }),
    );
    card.append(actions);
  }
  if (proposal.status === "ready") card.append(el("p", "chat-proposal-note", "Review and edit this draft before adding it. Workers pick up confirmed work on their next successful inbox check."));
  return card;
}

function stopChatRecording() {
  if (state.recorder && state.recorder.state !== "inactive") state.recorder.stop();
}

async function toggleChatRecording() {
  if (state.recorder?.state === "recording") { stopChatRecording(); return; }
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("This browser does not support voice recording.");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
  if (!mime) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error("This browser has no supported recording format.");
  }
  const recorder = new MediaRecorder(stream, { mimeType: mime });
  state.recorder = recorder;
  state.recordingStream = stream;
  state.recordingChunks = [];
  recorder.ondataavailable = (event) => { if (event.data.size) state.recordingChunks.push(event.data); };
  recorder.onstop = () => {
    const type = mime.split(";")[0];
    const blob = new Blob(state.recordingChunks, { type });
    if (blob.size) addChatFiles([new File([blob], `voice-${Date.now()}.${type === "audio/mp4" ? "m4a" : "webm"}`, { type })]);
    stream.getTracks().forEach((track) => track.stop());
    state.recordingStream = null;
    state.recorder = null;
    state.recordingChunks = [];
    if (state.tab === "assistant") renderAssistant();
  };
  recorder.start();
  renderAssistant();
}

function renderAssistant() {
  const page = el("section", "chat-page");
  page.setAttribute("aria-label", "Stoic chat");
  const project = currentProject();
  const workerCount = connectedWorkers().length;
  const canChat = canAssign() && state.context?.self.role === "boss" && Boolean(project);
  const header = el("header", "chat-header");
  const identity = el("div", "chat-identity");
  const statusDot = el("span", "chat-status-dot");
  identity.append(statusDot, el("strong", "", "Stoic"), el("span", "chat-project-name", project?.name || "Create a project to begin"));
  const actions = el("div", "chat-header-actions");
  actions.append(el("span", "chat-worker-count", `${workerCount} ${workerCount === 1 ? "worker" : "workers"} connected`));
  const newChat = makeButton("New conversation", "button text chat-new", () => {
    state.chatTurns = [];
    state.chatMessage = "";
    state.chatFiles = [];
    clearNotice();
    renderAssistant();
  });
  newChat.disabled = state.chatBusy || state.recorder?.state === "recording";
  actions.append(newChat);
  header.append(identity, actions);

  const transcript = el("div", "chat-transcript");
  transcript.setAttribute("role", "log");
  transcript.setAttribute("aria-live", "polite");
  if (!state.chatTurns.length) {
    const welcome = el("div", "chat-welcome");
    welcome.append(el("p", "eyebrow", "A CLEAR PLACE TO START"), el("h1", "", "What should your team work on next?"), el("p", "", "Share one outcome. Stoic brings your project context together and prepares a focused handoff for your review."));
    if (!project) welcome.append(makeButton("Create your first project", "button primary", () => void setTab("projects")));
    if (canChat) {
      const prompts = el("div", "chat-prompts");
      for (const prompt of ["Find the next clear step", "Turn these notes into a handoff"]) {
        prompts.append(makeButton(prompt, "button text chat-prompt", () => {
          state.chatMessage = prompt === "Find the next clear step"
            ? "Review our current project brief and propose one next task for the team."
            : "Turn these notes into one focused task for the team.";
          renderAssistant();
          (byId("chat-message") as HTMLTextAreaElement | null)?.focus();
        }));
      }
      welcome.append(prompts);
    }
    transcript.append(welcome);
  } else {
    for (const turn of state.chatTurns) transcript.append(renderChatTurn(turn));
  }

  const composer = el("form", "chat-composer");
  const projectPicker = el("select", "chat-project-picker") as HTMLSelectElement;
  projectPicker.setAttribute("aria-label", "Project for this conversation");
  for (const item of state.context?.projects || []) {
    const option = el("option", "", item.name);
    option.value = item.id;
    projectPicker.append(option);
  }
  projectPicker.value = state.projectId;
  projectPicker.disabled = !state.context?.projects.length;
  projectPicker.disabled ||= state.chatBusy;
  projectPicker.addEventListener("change", () => {
    state.projectId = projectPicker.value;
    projectSelect.value = state.projectId;
    state.chatTurns = [];
    state.chatMessage = "";
    state.chatFiles = [];
    clearNotice();
    void renderCurrentTab();
  });
  const textarea = el("textarea", "chat-message") as HTMLTextAreaElement;
  textarea.id = "chat-message";
  textarea.maxLength = 12000;
  textarea.rows = 2;
  textarea.placeholder = canChat ? "Message Stoic about the outcome you want…" : "Open your handoffs to review or claim work.";
  textarea.value = state.chatMessage;
  textarea.disabled = !canChat || state.chatBusy;
  let sendButton: HTMLButtonElement | null = null;
  textarea.addEventListener("input", () => {
    state.chatMessage = textarea.value;
    if (sendButton) sendButton.disabled = !canChat || state.chatBusy || (!state.chatMessage.trim() && !state.chatFiles.length);
  });
  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && canChat && !state.chatBusy) {
      event.preventDefault();
      composer.requestSubmit();
    }
  });
  composer.append(projectPicker, textarea);

  const pendingFiles = el("div", "chat-pending-files");
  for (const [index, file] of state.chatFiles.entries()) {
    const chip = el("span", "chat-pending-file", `${file.name} · ${formatSize(file.size)}`);
    const remove = makeButton("Remove " + file.name, "chat-remove-file", () => {
      state.chatFiles.splice(index, 1);
      renderAssistant();
    });
    remove.setAttribute("aria-label", "Remove " + file.name);
    remove.append(svgIcon("stop"));
    chip.append(remove);
    pendingFiles.append(chip);
  }
  if (state.chatFiles.length) composer.append(pendingFiles);

  const toolbar = el("div", "chat-composer-toolbar");
  const controls = el("div", "chat-composer-controls");
  const fileInput = el("input", "sr-only") as HTMLInputElement;
  fileInput.type = "file";
  fileInput.multiple = true;
  fileInput.setAttribute("aria-label", "Attach project files");
  fileInput.addEventListener("change", () => {
    addChatFiles(Array.from(fileInput.files || []));
    fileInput.value = "";
  });
  const attachButton = makeButton("", "chat-tool-button", () => fileInput.click());
  attachButton.disabled = !canChat || state.chatBusy;
  attachButton.setAttribute("aria-label", "Attach project files");
  attachButton.title = "Attach project files";
  attachButton.append(svgIcon("paperclip"));
  const micButton = makeButton("", "chat-tool-button" + (state.recorder?.state === "recording" ? " recording" : ""), async () => toggleChatRecording());
  micButton.disabled = !canChat || state.chatBusy;
  micButton.setAttribute("aria-label", state.recorder?.state === "recording" ? "Stop voice recording" : "Record a voice note");
  micButton.title = state.recorder?.state === "recording" ? "Stop recording" : "Record a voice note";
  micButton.setAttribute("aria-pressed", String(state.recorder?.state === "recording"));
  micButton.append(svgIcon(state.recorder?.state === "recording" ? "stop" : "microphone"));
  const voiceButton = makeButton("", "chat-tool-button" + (state.voiceReply ? " selected" : ""), () => {
    state.voiceReply = !state.voiceReply;
    if (!state.voiceReply && "speechSynthesis" in window) window.speechSynthesis.cancel();
    renderAssistant();
  });
  voiceButton.disabled = !canChat;
  voiceButton.setAttribute("aria-label", state.voiceReply ? "Turn voice replies off" : "Turn voice replies on");
  voiceButton.title = state.voiceReply ? "Voice replies on" : "Voice replies off";
  voiceButton.setAttribute("aria-pressed", String(state.voiceReply));
  voiceButton.append(svgIcon("speaker"));
  controls.append(fileInput, attachButton, micButton, voiceButton);
  toolbar.append(controls);
  sendButton = makeButton("", "button primary chat-send", () => undefined);
  sendButton.type = "submit";
  sendButton.disabled = !canChat || state.chatBusy || (!state.chatMessage.trim() && !state.chatFiles.length);
  sendButton.setAttribute("aria-label", state.chatBusy ? "Stoic is preparing a response" : "Send message");
  sendButton.title = state.chatBusy ? "Stoic is preparing a response" : "Send message";
  sendButton.prepend(svgIcon("send"));
  toolbar.append(sendButton);
  composer.append(toolbar);
  const allowed = canChat;
  composer.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!allowed || state.chatBusy) return;
    const prompt = state.chatMessage.trim();
    const files = [...state.chatFiles];
    if (!prompt && !files.length) return;
    const recent = recentChatPairs();
    state.chatMessage = "";
    state.chatFiles = [];
    state.chatBusy = true;
    state.chatTurns.push(
      { id: crypto.randomUUID(), role: "user", body: prompt || "Please review these project files.", attachments: files.map((file) => ({ id: "", name: file.name, sizeBytes: file.size })) },
      { id: crypto.randomUUID(), role: "stoic", body: "Organizing your request…", thinking: true },
    );
    const userTurn = state.chatTurns[state.chatTurns.length - 2];
    const assistantTurn = state.chatTurns[state.chatTurns.length - 1];
    const projectId = state.projectId;
    renderAssistant();
    void (async () => {
      try {
        const attachments: ChatAttachment[] = [];
        for (const file of files) attachments.push(await uploadChatFile(projectId, file));
        userTurn.attachments = attachments;
        const draft = await callTool<{
          reply: string;
          proposal: { title: string; goal: string; constraints: string } | null;
          transcript: string;
          warnings: string[];
          workerCount: number;
          artifactIds: string[];
        }>("draft_handoff", {
          projectId,
          prompt,
          artifactIds: attachments.map((file) => file.id),
          recent,
        });
        assistantTurn.body = [draft.reply, draft.transcript && `Voice transcript: ${draft.transcript}`].filter(Boolean).join("\n\n");
        assistantTurn.thinking = false;
        if (draft.proposal) {
          assistantTurn.proposal = {
            projectId,
            ...draft.proposal,
            artifactIds: draft.artifactIds,
            attachments,
            workerCount: draft.workerCount,
            idempotencyKey: crypto.randomUUID(),
            status: "ready",
          };
        }
        if (state.voiceReply && assistantTurn.body && "speechSynthesis" in window) {
          window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(plainRichText(assistantTurn.body)));
        }
      } catch (error) {
        assistantTurn.body = error instanceof Error ? error.message : "Stoic could not finish this request. Try again with a shorter message.";
        assistantTurn.thinking = false;
      } finally {
        state.chatBusy = false;
        if (state.projectId === projectId) void projectSnapshot(projectId).catch(() => {});
        if (state.tab === "assistant") renderAssistant();
        else void renderCurrentTab();
      }
    })();
  });
  page.addEventListener("dragover", (event) => { event.preventDefault(); });
  page.addEventListener("drop", (event) => {
    event.preventDefault();
    if (canChat && !state.chatBusy) addChatFiles(Array.from(event.dataTransfer?.files || []));
  });
  page.append(header, transcript, composer, el("p", "chat-footnote", canChat
    ? "Every draft stays yours to review. Workers pick up confirmed handoffs on their next successful inbox check."
    : state.context?.self.role === "worker"
      ? "This profile is a worker. Claim and report work from Handoffs."
      : "This workspace is in observe mode. Change delegation settings in Stoic to prepare handoffs."));
  pageRoot.replaceChildren(page);
  if (state.chatTurns.length) transcript.scrollTop = transcript.scrollHeight;
}

function renderMessage(message: BoardMessage, canReply = false) {
  const card = el("article", "message-card");
  const top = el("div", "message-meta");
  const agent = state.context?.agents.find((item) => message.author_key === "agent:" + item.id);
  const author = agent?.name || (message.author_key.startsWith("user:") ? "Workspace owner" : "Stoic Connector");
  top.append(el("span", "", author + " · " + message.kind.replaceAll("_", " ")), el("time", "", dateValue(message.created_at)));
  card.append(top);
  appendRichText(card, message.body);
  if (canReply) {
    card.append(makeButton("Reply", "button text", () => {
      state.replyTo = message.id;
      void renderCurrentTab().then(() => (byId("board-message") as HTMLTextAreaElement | null)?.focus());
    }));
  }
  return card;
}

function renderHandoffSummary(handoff: Handoff) {
  const card = el("article", "row-card");
  const top = el("div", "row-top");
  const title = el("strong");
  appendRichInline(title, handoff.title);
  top.append(title, statusTag(handoff.status));
  const assignedAgent = state.context?.agents.find((agent) => agent.id === handoff.assigned_agent_id);
  const project = state.context?.projects.find((item) => item.id === handoff.project_id);
  const meta = el("div", "row-meta");
  meta.append(el("span", "", (assignedAgent?.name || "Team queue") + " · " + (project?.name || "Project")));
  if (handoff.updated_at) meta.append(el("time", "", dateValue(handoff.updated_at)));
  card.append(top, meta);
  return card;
}

function handoffDetailView(handoff: Handoff, result: Record<string, unknown>) {
  const detail = el("div", "timeline");
  const fullHandoff = (result.handoff && typeof result.handoff === "object" ? result.handoff : handoff) as Handoff & Record<string, unknown>;
  const goal = textValue(fullHandoff.goal, handoff.goal || "No task description was returned.");
  const constraints = textValue(fullHandoff.constraints, handoff.constraints || "");
  appendRichText(detail, goal);
  if (constraints) appendRichText(detail, "Constraints: " + constraints);

  const events = Array.isArray(result.events) ? result.events as Record<string, unknown>[] : [];
  if (events.length) {
    detail.append(el("strong", "", "History"));
    for (const event of events) {
      const item = el("div", "timeline-item");
      item.append(el("strong", "", textValue(event.event_type, "Update").replaceAll("_", " ")), el("small", "", dateValue(event.created_at)));
      if (textValue(event.body)) appendRichText(item, textValue(event.body));
      detail.append(item);
    }
  }
  const approvals = Array.isArray(result.approvals) ? result.approvals as Record<string, unknown>[] : [];
  for (const approval of approvals) {
    const item = el("div", "timeline-item");
    item.append(el("strong", "", "Approval " + textValue(approval.status, "requested")));
    appendRichText(item, textValue(approval.action_summary));
    detail.append(item);
  }

  const currentStatus = textValue(fullHandoff.status, handoff.status);
  const isWorker = state.context?.self.role === "worker";
  const assignedToSelf = fullHandoff.assigned_agent_id === state.context?.self.agentId;
  const actionPanel = el("div", "form");
  const claimableQueueItem = currentStatus === "assigned" && !fullHandoff.assigned_agent_id;
  if (isWorker && ["assigned", "changes_requested"].includes(currentStatus) && (assignedToSelf || claimableQueueItem)) {
    actionPanel.append(makeButton("Claim this handoff", "button primary", async () => {
      await callTool("claim_handoff", { handoffId: handoff.id, body: "Claimed from the Stoic workspace.", idempotencyKey: crypto.randomUUID() });
      await reloadCurrentTab();
      showSuccess("Handoff claimed.");
    }));
  }
  if (isWorker && ["claimed", "blocked", "changes_requested"].includes(currentStatus) && assignedToSelf) {
    const update = el("textarea") as HTMLTextAreaElement;
    update.maxLength = 20000;
    update.placeholder = "Progress, blocker, or completed result…";
    update.setAttribute("aria-label", "Handoff update");
    const actions = el("div", "row-actions");
    actions.append(
      makeButton("Post update", "button", async () => {
        if (!update.value.trim()) throw new Error("Add a short update first.");
        await callTool("post_update", { handoffId: handoff.id, body: update.value.trim(), idempotencyKey: crypto.randomUUID() });
        await reloadCurrentTab();
        showSuccess("Progress added to the handoff.");
      }),
      makeButton("Mark blocked", "button", async () => {
        if (!update.value.trim()) throw new Error("Explain what is blocking the work.");
        await callTool("mark_blocked", { handoffId: handoff.id, body: update.value.trim(), idempotencyKey: crypto.randomUUID() });
        await reloadCurrentTab();
        showSuccess("Blocker added to the handoff.");
      }),
      makeButton("Submit result", "button primary", async () => {
        if (!update.value.trim()) throw new Error("Add the result before submitting it.");
        await callTool("submit_result", { handoffId: handoff.id, body: update.value.trim(), idempotencyKey: crypto.randomUUID() });
        await reloadCurrentTab();
        showSuccess("Result sent to the boss for review.");
      }),
    );
    actionPanel.append(el("label", "field", "Share a considered update"), update, actions);
  }
  if (!isWorker && currentStatus === "submitted") {
    const response = el("textarea") as HTMLTextAreaElement;
    response.maxLength = 20000;
    response.placeholder = "Optional feedback for the worker…";
    response.setAttribute("aria-label", "Review note");
    const actions = el("div", "row-actions");
    actions.append(
      makeButton("Accept result", "button primary", async () => {
        await callTool("accept_result", { handoffId: handoff.id, body: response.value.trim(), idempotencyKey: crypto.randomUUID() });
        await reloadCurrentTab();
        showSuccess("Result accepted.");
      }),
      makeButton("Request changes", "button", async () => {
        if (!response.value.trim()) throw new Error("Explain what needs to change.");
        await callTool("request_changes", { handoffId: handoff.id, body: response.value.trim(), idempotencyKey: crypto.randomUUID() });
        await reloadCurrentTab();
        showSuccess("Changes requested.");
      }),
    );
    actionPanel.append(el("label", "field", "Review the submitted result"), response, actions);
  }
  if (isWorker && currentStatus === "proposed") {
    actionPanel.append(el("p", "field-help", "This proposal is waiting for the workspace owner to review it in Stoic."));
  }
  if (actionPanel.childElementCount) detail.append(actionPanel);
  return detail;
}

async function renderAssistantHome() {
  if (state.context?.projects.length) await projectSnapshot();
  await renderAssistant();
}

async function renderHandoffs() {
  const page = makePage("WORK", "Handoffs", "Assignments and results stay together, so the team can pick up the next step without replaying old chats.");
  await projectSnapshot();
  const currentItems = state.handoffs;
  const metrics = el("div", "layout-three");
  const active = currentItems.filter((item) => ["assigned", "claimed", "blocked", "changes_requested"].includes(item.status)).length;
  const review = currentItems.filter((item) => item.status === "submitted").length;
  metrics.append(
    metricCard(String(active), "In progress", "Assigned, claimed, or blocked"),
    metricCard(String(review), "Needs review", "Submitted work from agents"),
    metricCard(String(currentItems.length), "Project history", "Recent handoffs"),
  );
  page.append(metrics);
  const surface = makeSurface("Project handoffs", currentProject()?.name || "Select a project");
  if (!currentItems.length) surface.body.append(emptyState("No handoffs yet", canAssign() ? "Create a clear task from Stoic chat when the team is ready." : "Assigned work will appear here when available."));
  else {
    const list = el("div", "list");
    for (const handoff of currentItems) {
      const card = renderHandoffSummary(handoff);
      const details = el("details", "details");
      details.append(el("summary", "", "View task and timeline"));
      details.addEventListener("toggle", () => {
        if (details.open && !details.dataset.loaded) {
          details.dataset.loaded = "true";
          void callTool<Record<string, unknown>>("get_handoff", { handoffId: handoff.id })
            .then((result) => details.append(handoffDetailView(handoff, result)))
            .catch((error: unknown) => { details.dataset.loaded = ""; showError(error instanceof Error ? error.message : "Could not read this handoff."); });
        }
      });
      card.append(details);
      list.append(card);
    }
    surface.body.append(list);
  }
  page.append(surface.surface);
}

function metricCard(value: string, label: string, detail: string) {
  const card = el("article", "metric");
  card.append(el("strong", "", value), el("span", "", label), el("small", "", detail));
  return card;
}

async function renderOverview() {
  const page = makePage("YOUR COMMAND CENTER", "Good to see you.", "A clear view of agent check-ins, active assignments, and work that needs your attention.");
  await projectSnapshot();
  const [checksResult] = await Promise.all([callTool<{ checks: Record<string, unknown>[] }>("get_team_check_history")]);
  state.checks = checksResult.checks || [];
  const connected = (state.context?.agents || []).filter((agent) => agent.status === "connected").length;
  const active = state.handoffs.filter((item) => ["assigned", "claimed", "blocked", "changes_requested"].includes(item.status)).length;
  const submitted = state.handoffs.filter((item) => item.status === "submitted").length;
  const metrics = el("div", "layout-three");
  metrics.append(
    metricCard(String(connected), "Connected agents", "Ready for their next scheduled check"),
    metricCard(String(active), "Active handoffs", "Shared work in progress"),
    metricCard(String(submitted), "Needs your review", "Agent results waiting for the boss"),
  );
  page.append(metrics);
  const columns = el("div", "layout-two");
  const handoffs = makeSurface("Handoffs in motion", currentProject()?.name || "Current project");
  const activeRows = state.handoffs.filter((item) => ["assigned", "claimed", "blocked", "changes_requested", "submitted"].includes(item.status)).slice(0, 5);
  if (activeRows.length) {
    const list = el("div", "list");
    for (const row of activeRows) list.append(renderHandoffSummary(row));
    handoffs.body.append(list);
  } else handoffs.body.append(emptyState("Nothing in motion", "New assignments and completed results will appear here."));
  handoffs.heading.append(makeButton("View all", "button text", () => void setTab("handoffs")));

  const checks = makeSurface("Agent check-ins", "A check confirms the inbox was checked; it does not mean work was completed.");
  const checkRows = (state.context?.agents || []).filter((agent) => agent.status !== "revoked");
  if (checkRows.length) {
    const list = el("div", "list");
    for (const agent of checkRows) {
      const card = el("article", "row-card");
      const top = el("div", "row-top");
      top.append(el("strong", "", agent.name + (agent.id === state.context?.bossAgentId ? " · Boss" : "")), statusTag(agent.status));
      card.append(top, el("div", "row-meta", (agent.harness_name || agent.platform) + " · " + (agent.schedule_enabled ? "Scheduled every " + agent.schedule_cadence_minutes + " min" : "Schedule paused")));
      card.append(el("p", "", "Last check: " + dateValue(agent.last_check_at)));
      const latestCheck = state.checks.find((item) => item.actor_key === "agent:" + agent.id);
      if (latestCheck) card.append(el("p", "", "Activity recorded " + dateValue(latestCheck.created_at)));
      list.append(card);
    }
    checks.body.append(list);
  } else checks.body.append(emptyState("No connected agents yet", "Connect a profile from the Agents page to begin coordinating work."));
  columns.append(handoffs.surface, checks.surface);
  page.append(columns);
  const note = el("div", "quiet-note");
  note.append(el("strong", "", "Let the team work at its own pace."), el("span", "", "Agents receive handoffs on their next successful scheduled check. Stoic does not wake an offline agent."));
  page.append(note);
}

async function renderBoard() {
  const page = makePage("WORK", "Message board", "Project updates, questions, and run reports live in one shared conversation.");
  if (!state.projectId) {
    page.append(emptyState("Create a project first", "The project board becomes available after you add a workspace project."));
    return;
  }
  await projectSnapshot();
  const board = makeSurface(currentProject()?.name || "Project conversation", "Use the board for shared updates. Confirm authoritative decisions in the project brief.");
  const composer = el("form", "form");
  if (state.replyTo) composer.append(el("p", "field-help", "Replying to a project message."));
  const messageInput = el("textarea") as HTMLTextAreaElement;
  messageInput.id = "board-message";
  messageInput.required = true;
  messageInput.maxLength = 12000;
  messageInput.placeholder = "Share a question, answer, or project update…";
  const actions = el("div", "form-actions");
  if (state.replyTo) actions.append(makeButton("Cancel reply", "button text", () => { state.replyTo = null; void renderCurrentTab(); }));
  const submit = makeButton("Post message", "button primary");
  submit.type = "submit";
  actions.append(submit);
  composer.append(messageInput, actions);
  composer.addEventListener("submit", (event) => {
    event.preventDefault();
    const body = messageInput.value.trim();
    if (!body) return;
    submit.disabled = true;
    void callTool("post_project_message", {
      projectId: state.projectId, parentId: state.replyTo || undefined, body, idempotencyKey: crypto.randomUUID(),
    }).then(async () => {
      state.replyTo = null;
      await projectSnapshot();
      showSuccess("Your message is on the project board.");
      await renderCurrentTab();
    }).catch((error: unknown) => showError(error instanceof Error ? error.message : "Could not post the project message."))
      .finally(() => { submit.disabled = false; });
  });
  const messages = el("div", "message-list");
  const visible = state.messages.slice().reverse();
  if (visible.length) {
    for (const message of visible) messages.append(renderMessage(message, true));
  } else messages.append(emptyState("No project conversation yet", "A concise update here gives every connected agent the same context."));
  board.body.append(composer, messages);
  page.append(board.surface);
}

async function renderIdeas() {
  const page = makePage("START", "Ideas", "Suggestions shared by your agents stay visible until you decide whether they deserve a handoff.");
  await projectSnapshot();
  const ideas = state.messages.filter((message) => message.kind === "suggestion").slice().reverse();
  const surface = makeSurface("Project suggestions", currentProject()?.name || "Current project");
  if (!ideas.length) surface.body.append(emptyState("No open suggestions", "Agent suggestions appear here. Review them against the shared project brief before assigning work."));
  else {
    const list = el("div", "list");
    for (const message of ideas) {
      const card = renderMessage(message);
      card.append(makeButton("Review as a handoff", "button text", () => {
        state.chatMessage = `An agent suggested: ${message.body}\n\nHelp me turn this into one clear handoff for the team.`;
        void setTab("assistant").then(() => (byId("chat-message") as HTMLTextAreaElement | null)?.focus());
      }));
      list.append(card);
    }
    surface.body.append(list);
  }
  page.append(surface.surface);
}

function contactField(label: string, type = "text", maxLength = 180) {
  const wrapper = el("label", "field");
  const input = el("input") as HTMLInputElement;
  input.type = type;
  input.maxLength = maxLength;
  wrapper.append(el("span", "field-label", label), input);
  return { wrapper, input };
}

function contactSelect(label: string, options: { value: string; label: string }[], value: string) {
  const wrapper = el("label", "field");
  const select = el("select") as HTMLSelectElement;
  for (const item of options) {
    const option = el("option", "", item.label);
    option.value = item.value;
    select.append(option);
  }
  select.value = value;
  wrapper.append(el("span", "field-label", label), select);
  return { wrapper, select };
}

async function renderContacts() {
  const page = makePage("PRIVATE WORKSPACE", "Contacts", "Keep confirmed leads and relationship context in one private source trail. Stoic never sends outreach.");
  const search = makeSurface("Find and filter contacts", "Search first, then narrow by status, project, missing contact details, or recent activity.");
  const searchForm = el("form", "form contacts-filter-form");
  const query = contactField("Search contacts", "search", 120);
  query.input.value = state.contactFilters.search;
  const field = contactSelect("Search in", [
    { value: "all", label: "All fields" }, { value: "name", label: "Name" }, { value: "company", label: "Company" },
    { value: "email", label: "Email" }, { value: "phone", label: "Phone" }, { value: "notes", label: "Notes" },
    { value: "source", label: "Source label" },
  ], state.contactFilters.field);
  const status = contactSelect("Status", ["all", "new", "contacted", "qualified", "customer", "archived"].map((value) => ({ value, label: value === "all" ? "All statuses" : value.charAt(0).toUpperCase() + value.slice(1) })), state.contactFilters.status);
  const project = contactSelect("Project", [
    { value: "all", label: "All projects" }, { value: "unassigned", label: "Unassigned" },
    ...(state.context?.projects || []).map((item) => ({ value: item.id, label: item.name })),
  ], state.contactFilters.projectId);
  const contactability = contactSelect("Contact details", [
    { value: "any", label: "Any details" }, { value: "has_email", label: "Has email" }, { value: "missing_email", label: "Missing email" },
    { value: "has_phone", label: "Has phone" }, { value: "missing_phone", label: "Missing phone" }, { value: "no_direct", label: "No email or phone" },
  ], state.contactFilters.contactability);
  const activity = contactSelect("Last activity", [
    { value: "any", label: "Any time" }, { value: "7d", label: "Past 7 days" },
    { value: "30d", label: "Past 30 days" }, { value: "90d", label: "Past 90 days" },
  ], state.contactFilters.activity);
  const sort = contactSelect("Sort by", [
    { value: "recent", label: "Recently updated" }, { value: "last_seen", label: "Last interaction" },
    { value: "newest", label: "Newest added" }, { value: "oldest", label: "Oldest added" },
    { value: "name_asc", label: "Name A to Z" }, { value: "name_desc", label: "Name Z to A" },
  ], state.contactFilters.sort);
  const searchActions = el("div", "row-actions");
  const submitSearch = makeButton("Apply filters", "button primary");
  submitSearch.type = "submit";
  searchActions.append(submitSearch, makeButton("Clear", "button text", async () => {
    state.contactFilters = { ...DEFAULT_CONTACT_FILTERS };
    await renderCurrentTab();
  }));
  searchForm.append(query.wrapper, field.wrapper, status.wrapper, project.wrapper, contactability.wrapper, activity.wrapper, sort.wrapper, searchActions);
  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.contactFilters = {
      search: query.input.value.trim(), field: field.select.value as ContactSearchFilters["field"],
      status: status.select.value as ContactSearchFilters["status"], projectId: project.select.value,
      contactability: contactability.select.value as ContactSearchFilters["contactability"],
      activity: activity.select.value as ContactSearchFilters["activity"],
      sort: sort.select.value as ContactSearchFilters["sort"], offset: 0,
    };
    void renderCurrentTab();
  });
  search.body.append(searchForm);
  page.append(search.surface);

  const result = await callTool<{ contacts: Contact[]; total: number; nextOffset: number | null }>("search_contacts", state.contactFilters);
  const found = makeSurface("Your contacts", `${result.total} matching · ${result.contacts?.length ? `showing ${state.contactFilters.offset + 1}–${state.contactFilters.offset + result.contacts.length}` : "no rows on this page"}`);
  if (!result.contacts?.length) found.body.append(emptyState("No matching contacts", "Confirm the person's identity before creating a new record."));
  else {
    const list = el("div", "list");
    for (const contact of result.contacts) {
      const card = el("article", "row-card");
      const top = el("div", "row-top");
      top.append(el("strong", "", contact.full_name), statusTag(contact.status));
      const projectName = state.context?.projects.find((item) => item.id === contact.project_id)?.name || "Unassigned";
      card.append(top, el("div", "row-meta", [contact.email || "No email", contact.phone || "No phone", contact.company, projectName, "Last activity " + dateValue(contact.last_seen_at)].filter(Boolean).join(" · ")));
      const sources = el("details", "details");
      sources.append(el("summary", "", "Recent sources · " + (contact.sources?.length || 0)));
      if (contact.sources?.length) {
        const history = el("div", "timeline");
        for (const source of contact.sources) {
          const entry = el("div", "timeline-item");
          entry.append(el("strong", "", source.source_label), el("small", "", dateValue(source.created_at)));
          if (source.notes) entry.append(el("p", "", source.notes));
          if (source.artifact_id) entry.append(makeButton("Open related artifact", "button text", async () => {
            const file = await callTool<{ downloadUrl: string }>("get_artifact", { artifactId: source.artifact_id });
            await app.openLink({ url: file.downloadUrl });
          }));
          history.append(entry);
        }
        sources.append(history);
      }
      sources.append(el("p", "field-help", "The signed-in owner can page through the complete interaction history in the web dashboard."));
      card.append(sources);

      const link = el("details", "details");
      link.append(el("summary", "", "Link a verified interaction"));
      const form = el("form", "form");
      const label = contactField("Source and date");
      label.input.required = true;
      label.input.minLength = 2;
      const url = contactField("Safe source URL (optional)", "url", 2000);
      const noteField = el("label", "field");
      const notes = el("textarea") as HTMLTextAreaElement;
      notes.maxLength = 5000;
      notes.placeholder = "Short factual note, not a raw message or transcript";
      noteField.append(el("span", "field-label", "What happened"), notes);
      const email = !contact.email ? contactField("Confirmed email (optional)", "email", 254) : null;
      const phone = !contact.phone ? contactField("Confirmed phone (optional)", "tel", 60) : null;
      const company = !contact.company ? contactField("Confirmed company (optional)", "text", 160) : null;
      const send = makeButton("Link interaction", "button primary");
      send.type = "submit";
      form.append(label.wrapper, url.wrapper, noteField);
      for (const field of [email, phone, company]) if (field) form.append(field.wrapper);
      form.append(send);
      let attempt: { fingerprint: string; key: string } | null = null;
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const payload = { contactId: contact.id, sourceLabel: label.input.value.trim(), sourceUrl: url.input.value.trim() || null,
          notes: notes.value.trim(), email: email?.input.value.trim() || null, phone: phone?.input.value.trim() || null,
          company: company?.input.value.trim() || null };
        const fingerprint = JSON.stringify(payload);
        if (attempt?.fingerprint !== fingerprint) attempt = { fingerprint, key: crypto.randomUUID() };
        send.disabled = true;
        void callTool<{ alreadyLinked: boolean }>("link_contact", { ...payload, idempotencyKey: attempt.key })
          .then(async (saved) => { await renderCurrentTab(); showSuccess(saved.alreadyLinked ? "This interaction was already recorded." : "Interaction linked to this contact."); })
          .catch((error: unknown) => showError(error instanceof Error ? error.message : "Could not link this interaction."))
          .finally(() => { send.disabled = false; });
      });
      link.append(form);
      card.append(link);
      list.append(card);
    }
    found.body.append(list);
  }
  const pagination = el("div", "row-actions");
  if (state.contactFilters.offset > 0) pagination.append(makeButton("Previous", "button", async () => {
    state.contactFilters.offset = Math.max(0, state.contactFilters.offset - 50);
    await renderCurrentTab();
  }));
  if (result.nextOffset !== null) pagination.append(makeButton("Next", "button", async () => {
    state.contactFilters.offset = result.nextOffset!;
    await renderCurrentTab();
  }));
  found.body.append(pagination);
  page.append(found.surface);

  const create = makeSurface("Add a confirmed contact", "Save only details from the work you were authorized to do.");
  const createForm = el("form", "form");
  const name = contactField("Full name", "text", 160);
  name.input.required = true;
  name.input.minLength = 2;
  const newEmail = contactField("Confirmed email (optional)", "email", 254);
  const newCompany = contactField("Company (optional)", "text", 160);
  const source = contactField("Source and date");
  source.input.required = true;
  source.input.minLength = 2;
  const createNote = el("textarea") as HTMLTextAreaElement;
  createNote.maxLength = 5000;
  createNote.placeholder = "Concise factual context, no raw correspondence";
  const createNoteField = el("label", "field");
  createNoteField.append(el("span", "field-label", "Notes"), createNote);
  const createButton = makeButton("Save contact", "button primary");
  createButton.type = "submit";
  createForm.append(name.wrapper, newEmail.wrapper, newCompany.wrapper, source.wrapper, createNoteField, createButton);
  let createAttempt: { fingerprint: string; key: string } | null = null;
  createForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const payload = { fullName: name.input.value.trim(), email: newEmail.input.value.trim() || null,
      company: newCompany.input.value.trim() || null, sourceLabel: source.input.value.trim(), notes: createNote.value.trim(),
      projectId: state.projectId || null };
    const fingerprint = JSON.stringify(payload);
    if (createAttempt?.fingerprint !== fingerprint) createAttempt = { fingerprint, key: crypto.randomUUID() };
    createButton.disabled = true;
    void callTool<{ created: number; updated: number; skipped: number }>("create_contact", { ...payload, idempotencyKey: createAttempt.key })
      .then(async (saved) => { await renderCurrentTab(); showSuccess(`Contact result: ${saved.created} added, ${saved.updated} updated, ${saved.skipped} skipped.`); })
      .catch((error: unknown) => showError(error instanceof Error ? error.message : "Could not save this contact."))
      .finally(() => { createButton.disabled = false; });
  });
  create.body.append(createForm);
  page.append(create.surface);
}

function renderPrompts() {
  const page = makePage("AGENT PLAYBOOKS", "Prompt library", "Copy task instructions for another agent. A prompt does not configure MCP, grant access to email, or start a schedule.");
  const setup = makeSurface("Connect the agent first", "Use its own private Stoic connection, or an owner-authorized browser session for Muse.");
  setup.body.append(makeButton("Open owner setup", "button", async () => { await app.openLink({ url: SITE_URL }); }));
  page.append(setup.surface);
  for (const item of promptLibrary) {
    const surface = makeSurface(item.title, item.audience);
    surface.body.append(el("p", "field-help", item.description));
    const preview = el("details", "details");
    preview.append(el("summary", "", "Preview prompt"), el("pre", "preformatted", renderStoicPrompt(item.id, "https://stoic.bishoptech.dev/api/mcp")));
    surface.body.append(preview, makeButton("Copy prompt", "button primary", async () => {
      try {
        await navigator.clipboard.writeText(renderStoicPrompt(item.id, "https://stoic.bishoptech.dev/api/mcp"));
        showSuccess(item.title + " copied. Confirm the other agent's Stoic connection before using it.");
      } catch {
        preview.open = true;
        showError("Clipboard access is unavailable in this host. Select the preview text to copy it manually.");
      }
    }));
    page.append(surface.surface);
  }
}

async function renderProjects() {
  const page = makePage("WORK", "Projects", "Each project holds a shared brief, a message board, handoffs, knowledge, and files.");
  if (state.context?.self.role === "boss") {
    const create = makeSurface("Create a project", "Start a focused space for one outcome or ongoing effort.");
    const form = el("form", "form");
    const field = el("label", "field");
    field.append(el("span", "field-label", "Project name"));
    const input = el("input") as HTMLInputElement;
    input.required = true;
    input.minLength = 2;
    input.maxLength = 100;
    input.placeholder = "e.g. Product launch";
    field.append(input);
    const submit = makeButton("Create project", "button primary");
    submit.type = "submit";
    form.append(field, submit);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submit.disabled = true;
      void callTool("create_project", { name: input.value.trim(), idempotencyKey: crypto.randomUUID() })
        .then(async () => { input.value = ""; await loadWorkspace(false); showSuccess("Project created."); })
        .catch((error: unknown) => showError(error instanceof Error ? error.message : "Could not create the project."))
        .finally(() => { submit.disabled = false; });
    });
    create.body.append(form);
    page.append(create.surface);
  }

  const projects = makeSurface("Your projects", String(state.context?.projects.length || 0) + " shared spaces");
  if (!state.context?.projects.length) projects.body.append(emptyState("No projects yet", "Create a project to give the team one reliable place for decisions and work."));
  else {
    const list = el("div", "list");
    for (const project of state.context.projects) {
      const card = el("article", "row-card");
      const top = el("div", "row-top");
      top.append(el("strong", "", project.name), el("span", "tag info", "Brief v" + project.brief_version));
      card.append(top);
      const defaultAgent = state.context.agents.find((agent) => agent.id === project.default_agent_id);
      card.append(el("div", "row-meta", defaultAgent ? "Default worker · " + defaultAgent.name : "No default worker"));
      card.append(makeButton(project.id === state.projectId ? "Current project" : "Open project", "button text", async () => {
        state.projectId = project.id;
        projectSelect.value = project.id;
        await renderCurrentTab();
      }));
      if (project.id === state.projectId) {
        const briefResult = await callTool<Record<string, unknown>>("get_project_brief", { projectId: project.id });
        const brief = textValue(briefResult.brief, "");
        const briefBox = el("div", "details");
        briefBox.append(el("strong", "", "Shared project brief"));
        if (state.context.self.role === "boss") {
          const editor = el("textarea") as HTMLTextAreaElement;
          editor.value = brief;
          editor.maxLength = 20000;
          editor.placeholder = "Record current decisions, constraints, and what success looks like.";
          editor.setAttribute("aria-label", "Shared project brief");
          const save = makeButton("Save shared brief", "button", async () => {
            await callTool("update_project_brief", { projectId: project.id, brief: editor.value, expectedVersion: project.brief_version });
            await loadWorkspace(false);
            showSuccess("Shared project brief updated.");
          });
          briefBox.append(editor, save);
        } else briefBox.append(el("pre", "preformatted", brief || "No shared brief yet."));
        card.append(briefBox);
      }
      list.append(card);
    }
    projects.body.append(list);
  }
  page.append(projects.surface);
}

async function renderAgents() {
  const page = makePage("TEAM", "Agents", "See which profiles are connected, what role they hold, and when they last checked their inbox.");
  const roster = makeSurface("Connected profiles", (state.context?.agents.length || 0) + " profiles");
  if (!state.context?.agents.length) roster.body.append(emptyState("No agent profiles connected", "Connect an agent from the Stoic dashboard. Each profile gets its own revocable access."));
  else {
    const list = el("div", "list");
    for (const agent of state.context.agents) {
      const card = el("article", "row-card");
      const top = el("div", "row-top");
      const name = el("strong", "", agent.name + (agent.id === state.context?.bossAgentId ? " · Boss" : ""));
      top.append(name, statusTag(agent.status));
      card.append(top);
      card.append(el("p", "", (agent.harness_name || agent.platform) + (agent.id === state.context?.self.agentId ? " · This connected profile" : "")));
      const cadence = agent.schedule_enabled ? "Scheduled every " + agent.schedule_cadence_minutes + " minutes" : "Scheduled inbox check paused";
      card.append(el("div", "row-meta", cadence));
      card.append(el("p", "", "Last successful check: " + dateValue(agent.last_check_at)));
      if (agent.access_notes) card.append(el("p", "", "Owner notes: " + agent.access_notes));
      list.append(card);
    }
    roster.body.append(list);
  }
  page.append(roster.surface);
}

async function renderKnowledge() {
  const page = makePage("TEAM", "Knowledge", "Validated notes help every agent use the same current project context.");
  if (!state.projectId) {
    page.append(emptyState("Create a project first", "Project knowledge is scoped to a shared workspace project."));
    return;
  }
  const search = el("input", "search-input") as HTMLInputElement;
  search.placeholder = "Search project knowledge";
  search.value = state.searchTerm;
  search.maxLength = 120;
  const searchButton = makeButton("Search", "button");
  searchButton.addEventListener("click", () => {
    state.searchTerm = search.value.trim();
    state.selectedNote = null;
    state.selectedNoteBody = "";
    void renderCurrentTab();
  });
  const headingActions = el("div", "top-actions");
  headingActions.append(search, searchButton);
  const surface = makeSurface("Project knowledge", currentProject()?.name || "Current project");
  surface.heading.append(headingActions);
  const queryName = state.searchTerm ? "search_project_knowledge" : "list_project_knowledge";
  const queryArgs = state.searchTerm
    ? { projectId: state.projectId, query: state.searchTerm, offset: 0 }
    : { projectId: state.projectId, offset: 0 };
  const result = await callTool<{ notes: Record<string, unknown>[] }>(queryName, queryArgs);
  const notes = result.notes || [];
  const columns = el("div", "layout-two");
  const list = el("div", "list");
  if (notes.length) {
    for (const note of notes) {
      const noteId = textValue(note.id);
      const card = el("article", "row-card");
      const top = el("div", "row-top");
      top.append(el("strong", "", textValue(note.title, "Untitled note")), statusTag(textValue(note.status, "current")));
      card.append(top, el("div", "row-meta", textValue(note.kind, "knowledge") + " · " + textValue(note.path, "Project note")));
      card.append(makeButton(state.selectedNote === noteId ? "Selected" : "Read note", "button text", async () => {
        const read = await callTool<{ note: Record<string, unknown> }>("read_knowledge_note", { projectId: state.projectId, noteId });
        state.selectedNote = noteId;
        state.selectedNoteBody = textValue(read.note.markdown, textValue(read.note.body));
        await renderCurrentTab();
      }));
      list.append(card);
    }
  } else list.append(emptyState("No matching notes", state.searchTerm ? "Try another phrase or clear the search." : "Validated knowledge notes appear here when a project has them."));
  columns.append(list);
  if (state.selectedNote) appendRichText(columns, state.selectedNoteBody || "This note has no readable text.", "rich-text knowledge-note-content");
  else columns.append(emptyState("Choose a note", "Read the source Markdown and its provenance before using a note as a decision."));
  surface.body.append(columns);
  page.append(surface.surface);
}

async function renderFiles() {
  const page = makePage("TEAM", "Artifacts", "Project files use private storage and short-lived download links.");
  if (!state.projectId) {
    page.append(emptyState("Create a project first", "Shared files are attached to a project or a specific handoff."));
    return;
  }
  const result = await callTool<{ artifacts: Record<string, unknown>[] }>("list_project_artifacts", { projectId: state.projectId, offset: 0 });
  const surface = makeSurface("Project files", currentProject()?.name || "Current project");
  const artifacts = result.artifacts || [];
  if (!artifacts.length) surface.body.append(emptyState("No project files yet", "Files attached to a particular assignment appear in that handoff's history."));
  else {
    const list = el("div", "list");
    for (const artifact of artifacts) {
      const card = el("article", "row-card");
      const top = el("div", "row-top");
      top.append(el("strong", "", textValue(artifact.name, "Shared file")), el("span", "tag info", formatSize(artifact.size_bytes)));
      card.append(top, el("div", "row-meta", textValue(artifact.mime_type, "File") + " · " + dateValue(artifact.created_at)));
      const actions = el("div", "row-actions");
      const download = makeButton("Create download link", "button", async () => {
        const file = await callTool<{ downloadUrl: string; expiresInSeconds: number }>("get_artifact", { artifactId: artifact.id });
        const link = el("a", "file-link", "Open download · expires in " + file.expiresInSeconds + " seconds") as HTMLAnchorElement;
        link.href = file.downloadUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        actions.replaceChildren(link);
      });
      actions.append(download);
      card.append(actions);
      list.append(card);
    }
    surface.body.append(list);
  }
  page.append(surface.surface);
}

async function renderCurrentTab() {
  if (!state.context) return;
  updateShell();
  pageRoot.replaceChildren(emptyState("Loading workspace", "Reading the shared Stoic project data."));
  try {
    switch (state.tab) {
      case "assistant": await renderAssistantHome(); break;
      case "ideas": await renderIdeas(); break;
      case "overview": await renderOverview(); break;
      case "handoffs": await renderHandoffs(); break;
      case "board": await renderBoard(); break;
      case "contacts": await renderContacts(); break;
      case "projects": await renderProjects(); break;
      case "agents": await renderAgents(); break;
      case "prompts": renderPrompts(); break;
      case "knowledge": await renderKnowledge(); break;
      case "files": await renderFiles(); break;
    }
  } catch (error) {
    showError(error instanceof Error ? error.message : "Could not load this Stoic view.");
    pageRoot.replaceChildren(emptyState("This view could not load", "Refresh the Stoic workspace or try another page."));
  }
}

async function setTab(tab: NavTab) {
  if (tab !== "assistant" && state.recorder?.state === "recording") stopChatRecording();
  state.tab = tab;
  state.replyTo = null;
  clearNotice();
  updateShell();
  await renderCurrentTab();
}

async function reloadCurrentTab() {
  await renderCurrentTab();
}

async function loadWorkspace(checkInbox = true) {
  clearNotice();
  contextStatus.querySelector("span:last-child")!.textContent = "Connecting to Stoic…";
  const contextPromise = callTool<TeamContext>("get_team_context");
  const inboxPromise = checkInbox
    ? callTool<{ handoffs: Handoff[] }>("check_inbox", { offset: 0 })
    : Promise.resolve({ handoffs: state.inbox });
  const [context, inbox] = await Promise.all([contextPromise, inboxPromise]);
  state.context = context;
  state.inbox = inbox.handoffs || [];
  if (!context.projects.some((project) => project.id === state.projectId)) state.projectId = context.projects[0]?.id || "";
  updateShell();
  await renderCurrentTab();
}

projectSelect.addEventListener("change", () => {
  clearNotice();
  if (state.recorder?.state === "recording") stopChatRecording();
  state.projectId = projectSelect.value;
  state.chatTurns = [];
  state.chatMessage = "";
  state.chatFiles = [];
  void renderCurrentTab();
});

byId("refresh-button").append(svgIcon("refresh"));
byId("refresh-button").addEventListener("click", () => {
  const button = byId("refresh-button") as HTMLButtonElement;
  button.disabled = true;
  void loadWorkspace(true)
    .catch((error: unknown) => { showError(error instanceof Error ? error.message : "Could not connect to Stoic."); contextStatus.querySelector("span:last-child")!.textContent = "Connection needs attention"; })
    .finally(() => { button.disabled = false; });
});

const themeButton = byId("theme-button") as HTMLButtonElement;
type WidgetAppearance = { accent: "forest" | "slate" | "ocean" | "clay"; density: "comfortable" | "compact"; corners: "soft" | "crisp" };
const DEFAULT_WIDGET_APPEARANCE: WidgetAppearance = { accent: "forest", density: "comfortable", corners: "soft" };
const APPEARANCE_STORAGE_KEY = "stoic-appearance";
function isWidgetAppearance(value: unknown): value is WidgetAppearance {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return ["forest", "slate", "ocean", "clay"].includes(String(candidate.accent))
    && ["comfortable", "compact"].includes(String(candidate.density))
    && ["soft", "crisp"].includes(String(candidate.corners));
}
function readWidgetAppearance(): WidgetAppearance {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY) || "null");
    if (isWidgetAppearance(value)) return value;
  } catch { /* Storage may be disabled or contain malformed preferences. */ }
  return { ...DEFAULT_WIDGET_APPEARANCE };
}
function applyAppearance(appearance: WidgetAppearance, persist = true) {
  const root = byId("stoic-app");
  root.dataset.accent = appearance.accent;
  root.dataset.density = appearance.density;
  root.dataset.corners = appearance.corners;
  (byId("appearance-accent") as HTMLSelectElement).value = appearance.accent;
  (byId("appearance-density") as HTMLSelectElement).value = appearance.density;
  (byId("appearance-corners") as HTMLSelectElement).value = appearance.corners;
  if (persist) {
    try { localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance)); } catch { /* Appearance still applies for this app session. */ }
  }
}
let widgetAppearance = readWidgetAppearance();
applyAppearance(widgetAppearance, false);
for (const [id, key] of [["appearance-accent", "accent"], ["appearance-density", "density"], ["appearance-corners", "corners"]] as const) {
  byId(id).addEventListener("change", () => {
    const controls = {
      accent: (byId("appearance-accent") as HTMLSelectElement).value,
      density: (byId("appearance-density") as HTMLSelectElement).value,
      corners: (byId("appearance-corners") as HTMLSelectElement).value,
    };
    const candidate = { ...widgetAppearance, [key]: controls[key] };
    if (isWidgetAppearance(candidate)) {
      widgetAppearance = candidate;
      applyAppearance(widgetAppearance);
    }
  });
}
byId("appearance-menu").addEventListener("toggle", () => {
  if (!(byId("appearance-menu") as HTMLDetailsElement).open) return;
  themeSelect.focus();
});

type WidgetThemeMode = "system" | "light" | "dark";
const themeSelect = byId("appearance-theme") as HTMLSelectElement;
function getThemeMode(): WidgetThemeMode {
  try {
    const dashboardTheme = localStorage.getItem("stoic-theme");
    if (dashboardTheme === "light" || dashboardTheme === "dark" || dashboardTheme === "system") return dashboardTheme;
    const widgetTheme = localStorage.getItem("stoic-widget-theme");
    return widgetTheme === "light" || widgetTheme === "dark" ? widgetTheme : "system";
  } catch { return "system"; }
}
let themeMode = getThemeMode();
let savedTheme: "light" | "dark" | null = themeMode === "system" ? null : themeMode;
themeSelect.value = themeMode;
function systemTheme(): "light" | "dark" {
  const hostTheme = app.getHostContext()?.theme;
  if (hostTheme === "light" || hostTheme === "dark") return hostTheme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function applyTheme(theme: "light" | "dark", persist = true) {
  byId("stoic-app").setAttribute("data-theme", theme);
  themeButton.replaceChildren(svgIcon(theme === "light" ? "moon" : "sun"));
  themeButton.setAttribute("aria-label", theme === "light" ? "Switch to dark theme" : "Switch to light theme");
  themeButton.title = theme === "light" ? "Switch to dark theme" : "Switch to light theme";
  if (persist) {
    themeMode = theme;
    savedTheme = theme;
    themeSelect.value = theme;
    try {
      localStorage.setItem("stoic-theme", theme);
      localStorage.setItem("stoic-widget-theme", theme);
    } catch { /* Storage may be disabled in an embedded app. */ }
  }
}
function applySystemTheme() {
  themeMode = "system";
  savedTheme = null;
  themeSelect.value = "system";
  applyTheme(systemTheme(), false);
}
themeSelect.addEventListener("change", () => {
  const value = themeSelect.value;
  if (value === "light" || value === "dark") applyTheme(value);
  else if (value === "system") {
    try {
      localStorage.setItem("stoic-theme", "system");
      localStorage.removeItem("stoic-widget-theme");
    } catch { /* System mode still applies for this app session. */ }
    applySystemTheme();
  } else themeSelect.value = themeMode;
});
themeButton.addEventListener("click", () => {
  const next = byId("stoic-app").getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(next);
});
window.addEventListener("storage", (event) => {
  if (event.key === APPEARANCE_STORAGE_KEY) {
    widgetAppearance = readWidgetAppearance();
    applyAppearance(widgetAppearance, false);
  }
  if (event.key === "stoic-theme" || event.key === "stoic-widget-theme") {
    themeMode = getThemeMode();
    savedTheme = themeMode === "system" ? null : themeMode;
    themeSelect.value = themeMode;
    if (savedTheme) applyTheme(savedTheme, false);
    else applySystemTheme();
  }
});
function applyHostTheme(theme: unknown) {
  if (savedTheme || (theme !== "light" && theme !== "dark")) return;
  applyTheme(theme, false);
}
app.onhostcontextchanged = (context) => applyHostTheme(context.theme);
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (!savedTheme && app.getHostContext()?.theme !== "light" && app.getHostContext()?.theme !== "dark") applySystemTheme();
});
if (savedTheme) applyTheme(savedTheme, false);
else applySystemTheme();

async function start() {
  try {
    await app.connect(new PostMessageTransport(window.parent, window.parent));
    if (!savedTheme) applySystemTheme();
    await loadWorkspace(true);
  } catch (error) {
    contextStatus.querySelector("span:last-child")!.textContent = "Not connected";
    showError(error instanceof Error ? error.message : "This host could not connect to Stoic.");
    pageRoot.replaceChildren(emptyState("Connect Stoic to continue", "The widget uses the currently connected MCP profile and its workspace permissions."));
  }
}

void start();
