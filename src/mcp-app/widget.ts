import { App, PostMessageTransport } from "@modelcontextprotocol/ext-apps";

type TeamContext = {
  workspace: { id: string; name: string; delegationLevel: string };
  self: { agentId: string; role: "boss" | "worker" };
  agents: { id: string; name: string; platform: string; status: string }[];
  projects: { id: string; name: string; brief_version: number }[];
};
type Handoff = { id: string; title: string; goal: string; status: string; assigned_agent_id: string; updated_at: string };
type BoardMessage = { id: string; author_key: string; kind: string; parent_id: string | null; body: string; created_at: string };

const app = new App({ name: "Stoic Connector", version: "0.1.0" });
const byId = (id: string) => document.getElementById(id)!;
const contextStatus = byId("connection-status");
const errorBox = byId("error-message");
const projectSelect = byId("project-select") as HTMLSelectElement;
const state: { context?: TeamContext; handoffs: Handoff[]; messages: BoardMessage[]; projectId: string; replyTo: string | null } = {
  handoffs: [], messages: [], projectId: "", replyTo: null,
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function showError(message: string) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

function clearError() {
  errorBox.textContent = "";
  errorBox.classList.add("hidden");
}

async function callTool<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const result = await app.callServerTool({ name, arguments: args });
  const text = result.content.find((item) => item.type === "text")?.text || "{}";
  let value: unknown;
  try { value = result.structuredContent ?? JSON.parse(text); } catch { value = { error: text }; }
  if (result.isError || (value && typeof value === "object" && "error" in value)) {
    throw new Error(value && typeof value === "object" && "error" in value ? String(value.error) : "Stoic could not complete that request.");
  }
  return value as T;
}

function renderSummary() {
  const summary = byId("workspace-summary");
  summary.replaceChildren();
  if (!state.context) return;
  const values = [
    state.context.workspace.name,
    `${state.context.self.role} agent`,
    `${state.context.projects.length} projects`,
    `${state.context.workspace.delegationLevel} mode`,
  ];
  for (const value of values) summary.append(el("span", "pill", value));
  const assignForm = byId("new-handoff-form");
  const canAssign = state.context.self.role === "boss" && state.context.workspace.delegationLevel !== "observe";
  assignForm.classList.toggle("hidden", !canAssign || state.context.projects.length === 0);
  byId("new-project-form").classList.toggle("hidden", state.context.self.role !== "boss" || state.context.workspace.delegationLevel === "observe");

  const assignees = byId("assignee-select") as HTMLSelectElement;
  assignees.replaceChildren();
  for (const agent of state.context.agents.filter((item) => item.status === "connected" && item.id !== state.context?.self.agentId)) {
    const option = el("option", "", agent.name);
    option.value = agent.id;
    assignees.append(option);
  }
  if (!assignees.options.length) {
    const option = el("option", "", "Connect a worker first");
    option.value = "";
    assignees.append(option);
  }
}

function renderHandoffs() {
  const list = byId("handoff-list");
  list.replaceChildren();
  if (!state.handoffs.length) {
    list.append(el("p", "empty", "No project handoffs yet."));
    return;
  }

  const agentNames = new Map((state.context?.agents || []).map((agent) => [agent.id, agent.name]));
  for (const handoff of state.handoffs) {
    const card = el("article", "card");
    const top = el("div", "card-top");
    top.append(el("strong", "", handoff.title), el("span", `tag ${handoff.status}`, handoff.status.replaceAll("_", " ")));
    card.append(top, el("p", "", `${agentNames.get(handoff.assigned_agent_id) || "Agent"} · ${handoff.goal}`));
    const actions = el("div", "actions");
    const isWorker = state.context?.self.role === "worker";
    if (isWorker && ["assigned", "changes_requested"].includes(handoff.status)) {
      actions.append(actionButton("Claim", async () => {
        await callTool("claim_handoff", { handoffId: handoff.id, body: "Claimed from the Stoic workspace widget.", idempotencyKey: crypto.randomUUID() });
        await reloadProject();
      }));
    }
    const detail = el("details", "");
    const detailSummary = el("summary", "", "View history");
    detail.append(detailSummary);
    detail.addEventListener("toggle", () => {
      if (detail.open && !detail.dataset.loaded) {
        detail.dataset.loaded = "true";
        void callTool<{ events: { event_type: string; body: string; created_at: string }[] }>("get_handoff", { handoffId: handoff.id }).then((result) => {
          for (const event of result.events) detail.append(el("p", "", `${event.event_type.replaceAll("_", " ")}: ${event.body}`));
        }).catch((error: unknown) => showError(error instanceof Error ? error.message : "Could not read this handoff."));
      }
    });
    card.append(actions, detail);

    if (isWorker && ["claimed", "blocked", "changes_requested"].includes(handoff.status)) {
      const update = el("textarea", "update-input");
      update.setAttribute("maxlength", "20000");
      update.setAttribute("aria-label", `Progress for ${handoff.title}`);
      update.placeholder = "Progress, blocker, or completed result…";
      const updateButton = actionButton("Post update", async () => {
        if (!update.value.trim()) return;
        await callTool("post_update", { handoffId: handoff.id, body: update.value.trim(), idempotencyKey: crypto.randomUUID() });
        update.value = "";
        await reloadProject();
      });
      const submitButton = actionButton("Submit result", async () => {
        if (!update.value.trim()) return;
        await callTool("submit_result", { handoffId: handoff.id, body: update.value.trim(), idempotencyKey: crypto.randomUUID() });
        update.value = "";
        await reloadProject();
      });
      card.append(update, updateButton, submitButton);
    }
    list.append(card);
  }
}

function actionButton(label: string, action: () => Promise<void>) {
  const button = el("button", "button", label);
  button.type = "button";
  button.addEventListener("click", () => {
    button.disabled = true;
    clearError();
    void action().catch((error: unknown) => showError(error instanceof Error ? error.message : "Stoic could not complete that request.")).finally(() => { button.disabled = false; });
  });
  return button;
}

function renderBoard() {
  const list = byId("board-list");
  list.replaceChildren();
  const names = new Map((state.context?.agents || []).map((agent) => [`agent:${agent.id}`, agent.name]));
  for (const message of state.messages) {
    const item = el("article", "message");
    const author = names.get(message.author_key) || (message.author_key.startsWith("user:") ? "Workspace owner" : "Stoic Connector");
    item.append(el("strong", "", `${author} · ${message.kind.replaceAll("_", " ")}`));
    item.append(el("small", "", new Date(message.created_at).toLocaleString()));
    item.append(el("p", "", message.body));
    const reply = actionButton("Reply", async () => {
      state.replyTo = message.id;
      const input = byId("message-body") as HTMLTextAreaElement;
      input.placeholder = `Replying to ${author}…`;
      input.focus();
    });
    reply.classList.add("reply-button");
    item.append(reply);
    list.append(item);
  }
  if (!state.messages.length) list.append(el("p", "empty", "No project conversation yet."));
  byId("board-status").textContent = state.messages.length ? `${state.messages.length} recent messages` : "No updates yet";
}

async function reloadProject() {
  if (!state.context || !state.projectId) {
    state.handoffs = [];
    state.messages = [];
    renderHandoffs();
    renderBoard();
    return;
  }
  const [handoffResult, boardResult] = await Promise.all([
    callTool<{ handoffs: Handoff[] }>("list_project_handoffs", { projectId: state.projectId, offset: 0 }),
    callTool<{ messages: BoardMessage[] }>("read_project_board", { projectId: state.projectId, offset: 0 }),
  ]);
  state.handoffs = handoffResult.handoffs;
  state.messages = [...boardResult.messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
  renderHandoffs();
  renderBoard();
}

async function loadWorkspace() {
  clearError();
  contextStatus.textContent = "Checking the Stoic inbox…";
  const [context, inbox] = await Promise.all([
    callTool<TeamContext>("get_team_context"),
    callTool<{ projects: { id: string; name: string }[] }>("check_inbox", { offset: 0 }),
  ]);
  state.context = context;
  const projectOptions = context.projects.length ? context.projects : inbox.projects;
  if (!projectOptions.some((project) => project.id === state.projectId)) state.projectId = projectOptions[0]?.id || "";
  projectSelect.replaceChildren();
  for (const project of projectOptions) {
    const option = el("option", "", project.name);
    option.value = project.id;
    projectSelect.append(option);
  }
  projectSelect.value = state.projectId;
  renderSummary();
  await reloadProject();
  contextStatus.textContent = `Connected as ${context.self.role}`;
}

projectSelect.addEventListener("change", () => {
  state.projectId = projectSelect.value;
  state.replyTo = null;
  clearError();
  void reloadProject().catch((error: unknown) => showError(error instanceof Error ? error.message : "Could not load the project."));
});

byId("refresh-button").addEventListener("click", () => {
  const button = byId("refresh-button") as HTMLButtonElement;
  button.disabled = true;
  void loadWorkspace().catch((error: unknown) => { showError(error instanceof Error ? error.message : "Could not connect to Stoic."); contextStatus.textContent = "Connection needs attention"; }).finally(() => { button.disabled = false; });
});

byId("create-project-button").addEventListener("click", () => {
  const input = byId("new-project-name") as HTMLInputElement;
  if (!input.value.trim()) return;
  const button = byId("create-project-button") as HTMLButtonElement;
  button.disabled = true;
  void callTool("create_project", { name: input.value.trim(), idempotencyKey: crypto.randomUUID() })
    .then(() => { input.value = ""; return loadWorkspace(); })
    .catch((error: unknown) => showError(error instanceof Error ? error.message : "Could not create the project."))
    .finally(() => { button.disabled = false; });
});

byId("new-handoff-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  if (!state.context || !state.projectId) return;
  const title = (byId("handoff-title") as HTMLInputElement).value.trim();
  const goal = (byId("handoff-goal") as HTMLTextAreaElement).value.trim();
  const assignedAgentId = (byId("assignee-select") as HTMLSelectElement).value;
  if (!assignedAgentId) return;
  const button = (event.currentTarget as HTMLFormElement).querySelector("button[type=submit]") as HTMLButtonElement;
  button.disabled = true;
  void callTool("create_handoff", { projectId: state.projectId, assignedAgentId, title, goal, constraints: "", idempotencyKey: crypto.randomUUID() })
    .then(() => { form.reset(); return reloadProject(); })
    .catch((error: unknown) => showError(error instanceof Error ? error.message : "Could not create the handoff."))
    .finally(() => { button.disabled = false; });
});

byId("message-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const input = byId("message-body") as HTMLTextAreaElement;
  if (!input.value.trim() || !state.projectId) return;
  const button = (event.currentTarget as HTMLFormElement).querySelector("button[type=submit]") as HTMLButtonElement;
  button.disabled = true;
  void callTool("post_project_message", { projectId: state.projectId, parentId: state.replyTo || undefined, body: input.value.trim(), idempotencyKey: crypto.randomUUID() })
    .then(() => { form.reset(); input.placeholder = "Share a question, answer, or project update…"; state.replyTo = null; return reloadProject(); })
    .catch((error: unknown) => showError(error instanceof Error ? error.message : "Could not post your message."))
    .finally(() => { button.disabled = false; });
});

async function start() {
  try {
    await app.connect(new PostMessageTransport(window.parent, window.parent));
    await loadWorkspace();
  } catch (error) {
    contextStatus.textContent = "Not connected";
    showError(error instanceof Error ? error.message : "This host could not connect to Stoic.");
  }
}

void start();
