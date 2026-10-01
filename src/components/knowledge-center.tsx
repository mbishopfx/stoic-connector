"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AssistantRichInline, AssistantRichText } from "@/components/rich-text";
import { plainRichInline } from "@/lib/rich-text";
import type { KnowledgeGraphEdgeType, KnowledgeGraphIndex, KnowledgeKind } from "@/lib/knowledge";
import type { KnowledgeNoteSummary } from "@/lib/knowledge-store";
import { KNOWLEDGE_SOURCE_SCOPES, type KnowledgeSourceScope } from "@/lib/knowledge-boundary";
import { filterKnowledgeGraph, type KnowledgeGraphScope } from "@/lib/knowledge-view";

type Project = { id: string; name: string };
type Agent = { id: string; name: string };
type NoteDetail = KnowledgeNoteSummary & { body: string; markdown: string };
type KnowledgeSettingsDraft = {
  enabled: boolean;
  timezone: string;
  schedule_slots: string[];
  source_scopes: KnowledgeSourceScope[];
  retention_days: number;
  pinned_note_ids: string[];
};
type Overview = {
  project: Project;
  settings: KnowledgeSettingsDraft & { settings_revision: number; persisted: boolean };
  notes: KnowledgeNoteSummary[];
  graph: { graph: KnowledgeGraphIndex; errors: unknown[]; warnings: unknown[] };
  refreshRuns: Array<{ status?: string; trigger_kind?: string; scheduled_slot?: string; scheduled_local_date?: string; created_at?: string; output_counts?: Record<string, number> }>;
};
type Draft = {
  id: string;
  title: string;
  kind: Exclude<KnowledgeKind, "index" | "brief" | "steward_audit">;
  status: KnowledgeNoteSummary["status"];
  confidence: KnowledgeNoteSummary["confidence"];
  body: string;
};
type Panel = "notes" | "graph";

const kindOptions: Draft["kind"][] = ["decision", "note", "question", "agent_profile", "handoff", "artifact"];
const statusOptions: KnowledgeNoteSummary["status"][] = ["proposed", "active", "conflicted", "stale", "superseded", "archived"];
const confidenceOptions: KnowledgeNoteSummary["confidence"][] = ["uncertain", "likely", "verified"];
const edgeOptions: KnowledgeGraphEdgeType[] = ["related", "supersedes", "wikilink"];
const scopeLabels: Record<KnowledgeSourceScope, string> = {
  brief: "Project brief",
  decisions: "Knowledge decisions and pinned notes",
  board: "Shared project messages",
  handoffs: "Handoffs and task updates",
  artifacts: "File names and metadata",
  agents: "Connected agent status",
};

function settingsDraftFrom(settings: KnowledgeSettingsDraft): KnowledgeSettingsDraft {
  return {
    enabled: settings.enabled,
    timezone: settings.timezone,
    schedule_slots: [...settings.schedule_slots],
    source_scopes: [...settings.source_scopes],
    retention_days: settings.retention_days,
    pinned_note_ids: [...settings.pinned_note_ids],
  };
}

function nextScheduleSlot(slots: readonly string[]) {
  const existing = new Set(slots);
  for (let hour = 0; hour < 24; hour += 1) {
    const candidate = `${String(hour).padStart(2, "0")}:00`;
    if (!existing.has(candidate)) return candidate;
  }
  return "23:59";
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Stoic could not load project knowledge.";
}

function noteLabel(kind: string) {
  return kind.replaceAll("_", " ");
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function relativeTime(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Time unavailable";
  const hours = Math.max(0, Math.floor((Date.now() - timestamp) / 3_600_000));
  if (hours < 1) return "Updated just now";
  if (hours < 24) return `Updated ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Updated ${days}d ago`;
}

export function KnowledgeCenter({ projects, agents, onManageProjects }: {
  projects: Project[];
  agents: Agent[];
  onManageProjects: () => void;
}) {
  const [requestedProjectId, setRequestedProjectId] = useState(projects[0]?.id || "");
  const projectId = projects.some((project) => project.id === requestedProjectId) ? requestedProjectId : projects[0]?.id || "";
  const [overview, setOverview] = useState<Overview | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState("");
  const [selectedNote, setSelectedNote] = useState<NoteDetail | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [panel, setPanel] = useState<Panel>("notes");
  const [scope, setScope] = useState<KnowledgeGraphScope>("all");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KnowledgeKind | "all">("all");
  const [agentId, setAgentId] = useState("all");
  const [edgeTypes, setEdgeTypes] = useState<KnowledgeGraphEdgeType[]>([...edgeOptions]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [settingsDraft, setSettingsDraft] = useState<KnowledgeSettingsDraft | null>(null);
  const [stewardSaving, setStewardSaving] = useState(false);
  const [stewardRunning, setStewardRunning] = useState(false);
  const noteLoadRevision = useRef(0);

  const refreshOverview = useCallback(async (preferredNoteId?: string, signal?: AbortSignal) => {
    if (!projectId) return null;
    const response = await fetch(`/api/knowledge?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store", signal });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not load knowledge");
    if (signal?.aborted) return null;
    const next = body as Overview;
    setOverview(next);
    setSettingsDraft(settingsDraftFrom(next.settings));
    setSelectedNoteId(preferredNoteId && next.notes.some((note) => note.id === preferredNoteId) ? preferredNoteId : next.notes[0]?.id || "");
    return next;
  }, [projectId]);

  const loadNote = useCallback(async (noteId: string, signal?: AbortSignal) => {
    if (!projectId || !noteId) return;
    const revision = ++noteLoadRevision.current;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/knowledge?projectId=${encodeURIComponent(projectId)}&noteId=${encodeURIComponent(noteId)}`, { cache: "no-store", signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not open this note");
      if (signal?.aborted || revision !== noteLoadRevision.current) return;
      setSelectedNote(body.note as NoteDetail);
    } catch (cause) {
      if (signal?.aborted || revision !== noteLoadRevision.current) return;
      setSelectedNote(null);
      setError(messageFrom(cause));
    } finally { if (!signal?.aborted && revision === noteLoadRevision.current) setLoading(false); }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    async function loadProject() {
      try {
        const response = await fetch(`/api/knowledge?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not load knowledge");
        if (controller.signal.aborted) return;
        const next = body as Overview;
        setOverview(next);
        setSettingsDraft(settingsDraftFrom(next.settings));
        const firstNoteId = next.notes[0]?.id || "";
        setSelectedNoteId(firstNoteId);
        if (firstNoteId) await loadNote(firstNoteId, controller.signal);
      } catch (cause) {
        if (!controller.signal.aborted) setError(messageFrom(cause));
      }
    }
    void loadProject();
    return () => controller.abort();
  }, [loadNote, projectId]);

  const currentOverview = overview?.project.id === projectId ? overview : null;
  const filteredGraph = useMemo(() => currentOverview
    ? filterKnowledgeGraph(currentOverview.graph.graph, { query, scope, kind, agentId, edgeTypes })
    : { nodes: [], edges: [], totalNodes: 0 }, [agentId, currentOverview, edgeTypes, kind, query, scope]);

  const agentOptions = useMemo(() => {
    const ids = new Set((currentOverview?.graph.graph.nodes || []).flatMap((node) => node.source_agent ? [node.source_agent] : []));
    return [...ids].sort().map((id) => ({ id, name: id === "stoic-knowledge-steward" ? "Stoic Knowledge Steward" : agents.find((agent) => agent.id === id)?.name || `Agent ${id.slice(0, 8)}` }));
  }, [agents, currentOverview]);

  function chooseNote(noteId: string) {
    setDraft(null);
    setSelectedNote(null);
    setSelectedNoteId(noteId);
    setError("");
    void loadNote(noteId);
  }

  function chooseProject(nextProjectId: string) {
    noteLoadRevision.current += 1;
    setLoading(false);
    setRequestedProjectId(nextProjectId);
    setSettingsDraft(null);
    setSelectedNoteId("");
    setSelectedNote(null);
    setDraft(null);
    setError("");
    setNotice("");
  }

  function createNote() {
    if (!projectId) return;
    noteLoadRevision.current += 1;
    setLoading(false);
    const id = crypto.randomUUID();
    setPanel("notes");
    setSelectedNoteId(id);
    setSelectedNote(null);
    setDraft({ id, title: "New knowledge note", kind: "note", status: "proposed", confidence: "uncertain", body: "" });
    setError("");
    setNotice("");
  }

  function editSelectedNote() {
    if (!selectedNote) return;
    if (kindOptions.includes(selectedNote.kind as Draft["kind"])) {
      setDraft({
        id: selectedNote.id,
        title: selectedNote.title,
        kind: selectedNote.kind as Draft["kind"],
        status: selectedNote.status,
        confidence: selectedNote.confidence,
        body: selectedNote.body,
      });
      setError("");
      setNotice("");
    }
  }

  async function saveNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId || !draft || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_note", projectId, ...draft }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not save this note");
      setDraft(null);
      setSelectedNote(null);
      setSelectedNoteId(draft.id);
      await refreshOverview(draft.id);
      setSelectedNoteId(draft.id);
      await loadNote(draft.id);
      setNotice("Saved to project knowledge. Agents can read it through Stoic’s scoped knowledge tools.");
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setSaving(false);
    }
  }

  function toggleEdge(type: KnowledgeGraphEdgeType) {
    setEdgeTypes((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type]);
  }

  function updateStewardSettings(patch: Partial<KnowledgeSettingsDraft>) {
    if (!currentOverview) return;
    setSettingsDraft((current) => ({ ...settingsDraftFrom(current || currentOverview.settings), ...patch }));
  }

  async function saveStewardSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId || !settingsDraft || stewardSaving) return;
    setStewardSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_settings", projectId, ...settingsDraft }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not save Knowledge Steward settings");
      setSettingsDraft(settingsDraftFrom(body.data.settings));
      await refreshOverview(selectedNoteId);
      setNotice("Knowledge Steward settings saved. Scheduled notes remain proposed until you review them.");
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setStewardSaving(false);
    }
  }

  async function runStewardNow() {
    if (!projectId || stewardRunning) return;
    setStewardRunning(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh_now", projectId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not refresh project knowledge");
      await refreshOverview(selectedNoteId);
      setNotice(body.data.status === "skipped"
        ? "The Steward found no new durable context to propose."
        : body.data.status === "partial"
          ? `Refresh complete with safety checks applied. ${body.data.created} proposed ${body.data.created === 1 ? "note is" : "notes are"} ready for review; unsupported or unsafe candidates were discarded.`
          : body.data.created
            ? `Refresh complete. ${body.data.created} proposed ${body.data.created === 1 ? "note is" : "notes are"} ready for review.${body.data.archived ? ` ${body.data.archived} old Steward ${body.data.archived === 1 ? "note was" : "notes were"} archived.` : ""}`
            : body.data.archived
              ? `No new notes were needed. ${body.data.archived} old Steward ${body.data.archived === 1 ? "note was" : "notes were"} archived.`
              : "Refresh complete. No duplicate notes were added.");
    } catch (cause) {
      setError(messageFrom(cause));
    } finally {
      setStewardRunning(false);
    }
  }

  if (!projects.length) return <section className="knowledge-empty-page"><span className="eyebrow muted">PROJECT MEMORY</span><h1>Knowledge</h1><p>Create a project before building shared notes. Project knowledge gives your agents the same concise context without copying entire chat histories.</p><button className="button" onClick={onManageProjects}>Set up a project</button></section>;

  const stewardSettings = currentOverview ? settingsDraft || currentOverview.settings : null;
  const latestRun = currentOverview?.refreshRuns[0];
  const pinnedSet = new Set(stewardSettings?.pinned_note_ids || []);
  const pinnableNotes = currentOverview ? [
    ...currentOverview.notes.filter((note) => pinnedSet.has(note.id)),
    ...currentOverview.notes.filter((note) => !pinnedSet.has(note.id) && ["active", "proposed"].includes(note.status)).slice(0, 30),
  ] : [];

  return <div className="knowledge-center">
    <header className="knowledge-page-heading">
      <div><span className="eyebrow muted">PROJECT MEMORY</span><h1>Knowledge</h1><p>Keep useful decisions and context in one place. Connected agents can search these notes before they start work.</p></div>
      <label className="knowledge-project-select">Project<select aria-label="Project knowledge" value={projectId} onChange={(event) => chooseProject(event.target.value)}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
    </header>

    <div className="knowledge-cadence-note" role="note"><strong>{stewardSettings?.enabled ? "Steward scheduled." : "Quiet by default."}</strong><span>{stewardSettings?.enabled ? `The Knowledge Steward checks this project ${stewardSettings.schedule_slots.length} times per day in ${stewardSettings.timezone}. Runs create proposed notes for your review and do not wake agents.` : "Notes are available to connected agents through Stoic. Scheduled model calls begin only after you enable the Knowledge Steward."}</span></div>

    {error && <div className="alert error" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")}>Dismiss</button></div>}
    {notice && <div className="alert success" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice("")}>Dismiss</button></div>}

    <details className="knowledge-steward-panel" open>
      <summary><span><strong>Knowledge Steward</strong><small>Keep shared project memory current on a calm schedule</small></span><span className={`knowledge-steward-state${stewardSettings?.enabled ? " enabled" : ""}`}>{stewardSettings?.enabled ? "Scheduled" : "Off"}</span></summary>
      {stewardSettings ? <form className="knowledge-steward-form" onSubmit={saveStewardSettings}>
        <p className="knowledge-steward-explainer">Stoic reviews bounded project context and adds proposed Markdown notes. It never edits the authoritative brief, assigns work, approves actions, or wakes an offline agent. Each run uses Stoic’s AI coordinator.</p>
        <label className="knowledge-steward-toggle"><input type="checkbox" checked={stewardSettings.enabled} onChange={(event) => updateStewardSettings({ enabled: event.target.checked })} /><span><strong>Enable scheduled refresh</strong><small>Runs are checked hourly and may start after the selected local times.</small></span></label>
        <div className="knowledge-steward-fields">
          <label>Project time zone<input value={stewardSettings.timezone} onChange={(event) => updateStewardSettings({ timezone: event.target.value })} maxLength={64} placeholder="America/Chicago" required /></label>
          <label>Archive Steward notes after (days)<input type="number" min={1} max={3650} value={stewardSettings.retention_days} onChange={(event) => updateStewardSettings({ retention_days: Number(event.target.value) })} required /><small>Older Steward-created notes move to Archived. Pinned notes stay.</small></label>
        </div>
        <fieldset className="knowledge-steward-schedule"><legend>Local run times</legend><div className="knowledge-time-slots">{stewardSettings.schedule_slots.map((slot, index) => <label key={`${slot}-${index}`}><span>Run {index + 1}</span><input type="time" value={slot} onChange={(event) => updateStewardSettings({ schedule_slots: stewardSettings.schedule_slots.map((value, slotIndex) => slotIndex === index ? event.target.value : value) })} />{stewardSettings.schedule_slots.length > 1 && <button type="button" className="subtle-link" onClick={() => updateStewardSettings({ schedule_slots: stewardSettings.schedule_slots.filter((_, slotIndex) => slotIndex !== index) })}>Remove</button>}</label>)}</div>{stewardSettings.schedule_slots.length < 6 && <button type="button" className="subtle-link" onClick={() => updateStewardSettings({ schedule_slots: [...stewardSettings.schedule_slots, nextScheduleSlot(stewardSettings.schedule_slots)] })}>Add a run time</button>}</fieldset>
        <fieldset className="knowledge-steward-sources"><legend>Sources the Steward may summarize</legend>{KNOWLEDGE_SOURCE_SCOPES.map((source) => <label key={source}><input type="checkbox" checked={stewardSettings.source_scopes.includes(source)} onChange={(event) => updateStewardSettings({ source_scopes: event.target.checked ? [...stewardSettings.source_scopes, source] : stewardSettings.source_scopes.filter((item) => item !== source) })} /><span>{scopeLabels[source]}</span></label>)}</fieldset>
        {pinnableNotes.length ? <fieldset className="knowledge-steward-sources"><legend>Pinned notes kept in every refresh</legend>{pinnableNotes.map((note) => <label key={note.id}><input type="checkbox" checked={stewardSettings.pinned_note_ids.includes(note.id)} disabled={!stewardSettings.pinned_note_ids.includes(note.id) && stewardSettings.pinned_note_ids.length >= 100} onChange={(event) => updateStewardSettings({ pinned_note_ids: event.target.checked ? [...stewardSettings.pinned_note_ids, note.id] : stewardSettings.pinned_note_ids.filter((id) => id !== note.id) })} /><span><AssistantRichInline text={note.title} /></span></label>)}</fieldset> : null}
        <div className="knowledge-steward-footer"><span>{latestRun ? `Last ${latestRun.trigger_kind === "manual" ? "manual" : "scheduled"} run: ${latestRun.status || "unknown"} · ${latestRun.created_at ? new Date(latestRun.created_at).toLocaleString() : "time unavailable"}` : "No refresh has run yet."}</span><div><button type="button" className="button button-outline button-small" onClick={() => void runStewardNow()} disabled={stewardRunning}>{stewardRunning ? "Refreshing…" : "Refresh now"}</button><button type="submit" className="button button-small" disabled={stewardSaving || stewardRunning || !stewardSettings.source_scopes.length || !stewardSettings.schedule_slots.length || stewardSettings.schedule_slots.some((slot) => !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(slot)) || new Set(stewardSettings.schedule_slots).size !== stewardSettings.schedule_slots.length}>{stewardSaving ? "Saving…" : "Save settings"}</button></div></div>
      </form> : <p className="knowledge-loading">Loading Steward settings…</p>}
    </details>

    <div className="knowledge-toolbar">
      <div className="knowledge-view-switch" role="group" aria-label="Knowledge view">
        <button type="button" className={panel === "notes" ? "selected" : ""} aria-pressed={panel === "notes"} onClick={() => setPanel("notes")}>Notes</button>
        <button type="button" className={panel === "graph" ? "selected" : ""} aria-pressed={panel === "graph"} onClick={() => setPanel("graph")}>Graph</button>
      </div>
      <div className="knowledge-toolbar-meta"><span>{currentOverview ? `${currentOverview.notes.length} ${currentOverview.notes.length === 1 ? "note" : "notes"}` : "Loading notes…"}</span><span>{currentOverview?.settings.enabled ? "Scheduled refresh on" : "Manual review"}</span></div>
      <button type="button" className="button button-small" onClick={createNote} disabled={loading}>New note</button>
    </div>

    {panel === "notes" ? <div className="knowledge-notes-layout">
      <aside className="knowledge-library" aria-label="Project notes">
        <div className="knowledge-library-heading"><strong>Project notes</strong><span>{overview?.notes.length || 0}</span></div>
        <label className="knowledge-search-label">Search notes<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title, ID, or path" /></label>
        <div className="knowledge-scope-list" role="group" aria-label="Filter notes">
          {(["all", "needs_review", "stale", "orphan"] as const).map((value) => <button type="button" key={value} className={scope === value ? "selected" : ""} aria-pressed={scope === value} onClick={() => setScope(value)}>{value === "all" ? "All notes" : value === "needs_review" ? "Needs review" : value === "stale" ? "Stale" : "Unlinked"}</button>)}
        </div>
        {currentOverview && filteredGraph.nodes.length ? <div className="knowledge-note-list">{filteredGraph.nodes.map((note) => <button type="button" key={note.id} className={`knowledge-note-item${selectedNoteId === note.id ? " selected" : ""}`} onClick={() => chooseNote(note.id)}>
          <span className="knowledge-note-kind">{noteLabel(note.kind)}</span><strong><AssistantRichInline text={note.title} /></strong><span className="knowledge-note-meta"><span className={`knowledge-status-dot ${note.status}`} />{statusLabel(note.status)} · {note.confidence}</span><small>{relativeTime(note.updated_at)}</small>
        </button>)}</div> : currentOverview ? <div className="knowledge-list-empty"><strong>{currentOverview.notes.length ? "No matching notes" : "Your project memory starts here"}</strong><p>{currentOverview.notes.length ? "Try a different search or filter." : "Capture one decision or open question, then let every connected agent read it on its next run."}</p>{!currentOverview.notes.length && <button type="button" className="subtle-link" onClick={createNote}>Create the first note</button>}</div> : <p className="knowledge-loading">Loading project notes…</p>}
      </aside>

      <section className="knowledge-detail-pane" aria-label="Knowledge note details">
        {draft ? <KnowledgeNoteEditor draft={draft} saving={saving} onChange={setDraft} onCancel={() => { const previousId = selectedNote?.id || ""; setDraft(null); setSelectedNoteId(previousId); if (previousId) void loadNote(previousId); }} onSave={saveNote} />
          : selectedNote && selectedNote.project_id === projectId ? <KnowledgeNoteDetail note={selectedNote} graph={currentOverview?.graph.graph} loading={loading} onEdit={editSelectedNote} />
            : loading ? <p className="knowledge-loading">Opening note…</p>
              : <div className="knowledge-list-empty"><strong>Select a note to inspect it</strong><p>Source, confidence, and links stay visible so your team can see where shared context came from.</p></div>}
      </section>
    </div> : <section className="knowledge-graph-panel">
      <div className="knowledge-graph-heading"><div><h2>How project notes connect</h2><p>The graph is generated from Markdown links and stays a read-only view of your notes.</p></div><label>Note type<select aria-label="Filter graph by note type" value={kind} onChange={(event) => setKind(event.target.value as KnowledgeKind | "all")}><option value="all">All types</option>{kindOptions.map((value) => <option key={value} value={value}>{noteLabel(value)}</option>)}</select></label><label>Source agent<select aria-label="Filter graph by source agent" value={agentId} onChange={(event) => setAgentId(event.target.value)}><option value="all">All agents</option>{agentOptions.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label></div>
      <label className="knowledge-graph-search">Search this graph<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a note by title, ID, or path" /></label>
      <div className="knowledge-scope-list graph-scopes" role="group" aria-label="Filter graph nodes">{(["all", "needs_review", "stale", "orphan"] as const).map((value) => <button type="button" key={value} className={scope === value ? "selected" : ""} aria-pressed={scope === value} onClick={() => setScope(value)}>{value === "all" ? "All notes" : value === "needs_review" ? "Needs review" : value === "stale" ? "Stale" : "Unlinked"}</button>)}</div>
      <div className="knowledge-edge-filters" role="group" aria-label="Show relationship types">{edgeOptions.map((value) => <label key={value}><input type="checkbox" checked={edgeTypes.includes(value)} onChange={() => toggleEdge(value)} />{noteLabel(value)}</label>)}</div>
      {currentOverview ? <KnowledgeGraph graph={filteredGraph} selectedId={selectedNoteId} onSelect={chooseNote} /> : <p className="knowledge-loading">Loading project graph…</p>}
      {selectedNote && selectedNote.project_id === projectId && <KnowledgeNoteDetail note={selectedNote} graph={currentOverview?.graph.graph} loading={loading} onEdit={editSelectedNote} />}
      {currentOverview && currentOverview.graph.warnings.length > 0 && <details className="knowledge-graph-warnings"><summary>{currentOverview.graph.warnings.length} unresolved note references</summary><p>Some Markdown links point to notes that are not in this project yet. They are shown as source references and do not grant access.</p></details>}
    </section>}
  </div>;
}

function KnowledgeNoteEditor({ draft, saving, onChange, onCancel, onSave }: {
  draft: Draft;
  saving: boolean;
  onChange: (draft: Draft) => void;
  onCancel: () => void;
  onSave: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => onChange({ ...draft, [key]: value });
  return <form className="knowledge-editor" onSubmit={onSave}>
    <div className="knowledge-editor-heading"><div><span className="eyebrow muted">OWNER-EDITED NOTE</span><h2><AssistantRichInline text={draft.title || "New note"} /></h2><p>Notes stay separate from the authoritative project brief. Use a short source summary, not a full chat transcript.</p></div><code>{draft.id}</code></div>
    <label>Title<input value={draft.title} onChange={(event) => set("title", event.target.value)} maxLength={160} required /></label>
    <div className="knowledge-editor-fields"><label>Type<select value={draft.kind} onChange={(event) => set("kind", event.target.value as Draft["kind"])}>{kindOptions.map((value) => <option key={value} value={value}>{noteLabel(value)}</option>)}</select></label><label>Review state<select value={draft.status} onChange={(event) => set("status", event.target.value as Draft["status"])}>{statusOptions.map((value) => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></label><label>Confidence<select value={draft.confidence} onChange={(event) => set("confidence", event.target.value as Draft["confidence"])}>{confidenceOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div>
    <label>Note body<textarea value={draft.body} onChange={(event) => set("body", event.target.value)} rows={12} maxLength={24_000} placeholder="Write one decision, verified fact, or open question…" required /></label>
    <div className="knowledge-editor-footer"><span>{draft.body.length.toLocaleString()} / 24,000 characters · credentials and full transcripts are rejected</span><div><button type="button" className="button button-outline button-small" onClick={onCancel} disabled={saving}>Cancel</button><button type="submit" className="button button-small" disabled={saving || !draft.title.trim() || !draft.body.trim()}>{saving ? "Saving…" : "Save note"}</button></div></div>
  </form>;
}

function KnowledgeNoteDetail({ note, graph, loading, onEdit }: {
  note: NoteDetail;
  graph?: KnowledgeGraphIndex;
  loading: boolean;
  onEdit: () => void;
}) {
  const links = (graph?.edges || []).filter((edge) => edge.source === note.id || edge.target === note.id);
  const connectedIds = new Set(links.flatMap((edge) => [edge.source, edge.target]).filter((id) => id !== note.id));
  const connected = (graph?.nodes || []).filter((node) => connectedIds.has(node.id));
  return <article className="knowledge-note-detail">
    <div className="knowledge-detail-heading"><div><span className="knowledge-note-kind">{noteLabel(note.kind)}</span><h2><AssistantRichInline text={note.title} /></h2><p>{relativeTime(note.updated_at)} · {note.confidence} confidence</p></div><button type="button" className="button button-outline button-small" onClick={onEdit} disabled={loading}>Edit note</button></div>
    <div className="knowledge-detail-badges"><span className={`knowledge-status-dot ${note.status}`} />{statusLabel(note.status)}<span>{note.source_agent ? "Agent sourced" : note.source_handoff ? "Handoff sourced" : "Owner sourced"}</span></div>
    <div className="knowledge-note-body"><AssistantRichText text={note.body} /></div>
    <details className="knowledge-source-details" open><summary>Source and relationships</summary><dl><dt>Markdown path</dt><dd><code>{note.path}</code></dd><dt>Stable note ID</dt><dd><code>{note.id}</code></dd>{note.source_agent && <><dt>Source agent</dt><dd><code>{note.source_agent}</code></dd></>}{note.source_handoff && <><dt>Source handoff</dt><dd><code>{note.source_handoff}</code></dd></>}{note.source_user && <><dt>Owner provenance</dt><dd><code>{note.source_user}</code></dd></>}<dt>Evidence references</dt><dd>{note.evidence.length ? note.evidence.map((reference) => <code key={reference}>{reference}</code>) : "No source references recorded."}</dd><dt>Linked notes</dt><dd>{connected.length ? connected.map((item) => <span key={item.id}><AssistantRichInline text={item.title} /></span>) : "No links to other notes."}</dd><dt>Last saved</dt><dd><time dateTime={note.stored_updated_at}>{new Date(note.stored_updated_at).toLocaleString()}</time></dd></dl></details>
  </article>;
}

function KnowledgeGraph({ graph, selectedId, onSelect }: {
  graph: { nodes: KnowledgeGraphIndex["nodes"]; edges: KnowledgeGraphIndex["edges"]; totalNodes: number };
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const renderedNodes = graph.nodes.slice(0, 80);
  const positions = useMemo(() => {
    const count = renderedNodes.length;
    return new Map(renderedNodes.map((node, index) => {
      if (count === 1) return [node.id, { x: 400, y: 260 }] as const;
      const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
      const ring = count > 32 ? 0.72 + (index % 4) * 0.07 : 1;
      return [node.id, { x: 400 + Math.cos(angle) * 300 * ring, y: 260 + Math.sin(angle) * 188 * ring }] as const;
    }));
  }, [renderedNodes]);
  const visibleIds = new Set(renderedNodes.map((node) => node.id));
  const edges = graph.edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target));
  if (!graph.totalNodes) return <div className="knowledge-graph-empty"><strong>No notes to map yet</strong><p>Save a decision or question to create the first point in this project graph.</p></div>;
  if (!renderedNodes.length) return <div className="knowledge-graph-empty"><strong>No notes match these filters</strong><p>Clear one of the filters to see more of the project memory.</p></div>;
  return <div className="knowledge-graph-canvas">
    <svg viewBox="0 0 800 520" role="group" aria-label={`Knowledge graph, showing ${renderedNodes.length} of ${graph.totalNodes} notes`}>
      {edges.map((edge) => {
        const source = positions.get(edge.source);
        const target = positions.get(edge.target);
        if (!source || !target) return null;
        return <line key={edge.id} className="knowledge-graph-edge" data-kind={edge.type} x1={source.x} y1={source.y} x2={target.x} y2={target.y} />;
      })}
      {renderedNodes.map((node) => {
        const point = positions.get(node.id);
        if (!point) return null;
        return <g key={node.id} className={`knowledge-graph-node${selectedId === node.id ? " selected" : ""}`} data-status={node.status} role="button" tabIndex={0} aria-label={`${node.title}, ${statusLabel(node.status)}, ${noteLabel(node.kind)}`} aria-pressed={selectedId === node.id} transform={`translate(${point.x} ${point.y})`} onClick={() => onSelect(node.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(node.id); } }}>
          <title>{plainRichInline(node.title)} · {statusLabel(node.status)} · {noteLabel(node.kind)}</title><circle r={selectedId === node.id ? 11 : 8} /><text y={24}>{plainRichInline(renderedNodes.length <= 24 ? node.title.slice(0, 22) : node.title.slice(0, 14))}</text>
        </g>;
      })}
    </svg>
    <div className="knowledge-graph-footer"><span>{renderedNodes.length} of {graph.totalNodes} notes shown</span><span>{edges.length} visible relationships</span>{graph.totalNodes > renderedNodes.length && <span>Use search or filters to focus the graph.</span>}</div>
    <div className="knowledge-graph-node-list" aria-label="Visible graph notes">{renderedNodes.map((node) => <button type="button" key={node.id} className={selectedId === node.id ? "selected" : ""} onClick={() => onSelect(node.id)}><span className={`knowledge-status-dot ${node.status}`} /><span><AssistantRichInline text={node.title} /></span><small>{noteLabel(node.kind)} · {statusLabel(node.status)}</small></button>)}</div>
  </div>;
}
