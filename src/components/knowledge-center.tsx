"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AssistantRichInline, AssistantRichText } from "@/components/rich-text";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
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
const previewKnowledgeBodies: Record<string, string> = {
  "preview-note-voice": "## Working rule\nKeep customer-facing recommendations direct, specific, and easy to verify.\n\n## Evidence\nLink every factual claim to the source that supports it. Mark estimates as estimates and open questions as unresolved.\n\n## Review\nAsk the project owner before publishing or contacting anyone.",
  "preview-note-positioning": "The current positioning centers on a calm, useful workspace for teams coordinating more than one agent. Show the shared project context before describing automation.",
  "preview-note-decision": "Keep customer records private to the workspace. Source notes should describe where a record came from and what needs verification, without implying permission to contact.",
};

function makePreviewOverview(project: Project): Overview {
  const now = Date.now();
  const ago = (hours: number) => new Date(now - hours * 3_600_000).toISOString();
  const notes: KnowledgeNoteSummary[] = [
    { id: "preview-note-voice", project_id: project.id, path: "decisions/brand-voice.md", kind: "decision", title: "Brand voice and evidence rules", status: "proposed", confidence: "likely", created_at: ago(4), updated_at: ago(2), source_agent: "agent-editor", supersedes: [], related: ["preview-note-positioning"], evidence: ["handoff:campaign-refresh"], stale: false, stored_updated_at: ago(2) },
    { id: "preview-note-positioning", project_id: project.id, path: "notes/positioning.md", kind: "note", title: "Positioning: calm team workspace", status: "active", confidence: "verified", created_at: ago(40), updated_at: ago(12), source_user: "workspace-owner", supersedes: [], related: ["preview-note-voice"], evidence: ["project-brief:v3"], stale: false, stored_updated_at: ago(12) },
    { id: "preview-note-decision", project_id: project.id, path: "decisions/contact-boundary.md", kind: "decision", title: "Contact records need source context", status: "stale", confidence: "likely", created_at: ago(240), updated_at: ago(120), source_user: "workspace-owner", supersedes: [], related: [], evidence: ["handoff:contact-import"], stale: true, stored_updated_at: ago(120) },
  ];
  const graph: KnowledgeGraphIndex = {
    contract_version: 1,
    project_id: project.id,
    nodes: notes.map((note) => ({
      id: note.id, project_id: project.id, kind: note.kind, title: note.title, status: note.status,
      confidence: note.confidence, updated_at: note.updated_at, source_path: note.path,
      ...(note.source_agent ? { source_agent: note.source_agent } : {}),
      ...(note.source_user ? { source_user: note.source_user } : {}),
      evidence: note.evidence, stale: note.stale, orphan: false,
    })),
    edges: [
      { id: "preview-edge-voice", source: "preview-note-voice", target: "preview-note-positioning", type: "related", target_exists: true },
      { id: "preview-edge-positioning", source: "preview-note-positioning", target: "preview-note-voice", type: "wikilink", target_exists: true },
    ],
  };
  return {
    project,
    settings: { enabled: true, timezone: "America/Chicago", schedule_slots: ["08:00", "13:00", "18:00"], source_scopes: [...KNOWLEDGE_SOURCE_SCOPES], retention_days: 365, pinned_note_ids: ["preview-note-positioning"], settings_revision: 3, persisted: true },
    notes,
    graph: { graph, errors: [], warnings: [] },
    refreshRuns: [{ status: "complete", trigger_kind: "scheduled", scheduled_slot: "08:00", scheduled_local_date: new Date(now).toLocaleDateString("en-CA"), created_at: ago(3), output_counts: { proposed: 1, indexed: 2 } }],
  };
}
type Draft = {
  id: string;
  title: string;
  kind: Exclude<KnowledgeKind, "index" | "brief" | "steward_audit">;
  status: KnowledgeNoteSummary["status"];
  confidence: KnowledgeNoteSummary["confidence"];
  body: string;
};
type Panel = "notes" | "diary" | "graph";

const kindOptions: Draft["kind"][] = ["decision", "note", "question", "agent_profile", "handoff", "artifact"];
const filterKindOptions: KnowledgeKind[] = [...kindOptions, "agent_diary"];
const statusOptions: KnowledgeNoteSummary["status"][] = ["proposed", "active", "conflicted", "stale", "superseded", "archived"];
const confidenceOptions: KnowledgeNoteSummary["confidence"][] = ["uncertain", "likely", "verified"];
const edgeOptions: KnowledgeGraphEdgeType[] = ["related", "supersedes", "wikilink"];
const scopeOptions: Array<{ value: KnowledgeGraphScope; label: string }> = [
  { value: "all", label: "All notes" },
  { value: "needs_review", label: "Needs review" },
  { value: "stale", label: "Stale" },
  { value: "orphan", label: "Unlinked" },
];
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

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "active" || status === "verified") return "default";
  if (status === "conflicted") return "destructive";
  if (status === "proposed" || status === "needs_review") return "secondary";
  return "outline";
}

export function KnowledgeCenter({ projects, agents, onManageProjects, preview = false }: {
  projects: Project[];
  agents: Agent[];
  onManageProjects: () => void;
  preview?: boolean;
}) {
  const [requestedProjectId, setRequestedProjectId] = useState(projects[0]?.id || "");
  const projectId = projects.some((project) => project.id === requestedProjectId) ? requestedProjectId : projects[0]?.id || "";
  const selectedProject = projects.find((project) => project.id === projectId) || projects[0];
  const demoOverview = useMemo(() => preview && selectedProject ? makePreviewOverview(selectedProject) : null, [preview, selectedProject?.id, selectedProject?.name]);
  const firstDemoNote = demoOverview?.notes[0];
  const [overview, setOverview] = useState<Overview | null>(demoOverview);
  const [selectedNoteId, setSelectedNoteId] = useState(firstDemoNote?.id || "");
  const [selectedNote, setSelectedNote] = useState<NoteDetail | null>(() => firstDemoNote ? { ...firstDemoNote, body: previewKnowledgeBodies[firstDemoNote.id] || "", markdown: previewKnowledgeBodies[firstDemoNote.id] || "" } : null);
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
  const [stewardOpen, setStewardOpen] = useState<boolean | null>(null);
  const noteLoadRevision = useRef(0);
  const currentOverview = overview?.project.id === projectId ? overview : null;
  const stewardSettings = currentOverview ? settingsDraft || currentOverview.settings : null;

  const stewardPanelOpen = stewardOpen ?? Boolean(stewardSettings?.enabled || error);

  useEffect(() => {
    if (!preview || !demoOverview) return;
    const note = demoOverview.notes[0];
    setOverview(demoOverview);
    setSettingsDraft(settingsDraftFrom(demoOverview.settings));
    setSelectedNoteId(note?.id || "");
    setSelectedNote(note ? { ...note, body: previewKnowledgeBodies[note.id] || "", markdown: previewKnowledgeBodies[note.id] || "" } : null);
  }, [demoOverview, preview]);

  const refreshOverview = useCallback(async (preferredNoteId?: string, signal?: AbortSignal) => {
    if (!projectId) return null;
    if (preview) { setOverview(demoOverview); return demoOverview; }
    const response = await fetch(`/api/knowledge?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store", signal });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not load knowledge");
    if (signal?.aborted) return null;
    const next = body as Overview;
    setOverview(next);
    setSettingsDraft(settingsDraftFrom(next.settings));
    setSelectedNoteId(preferredNoteId && next.notes.some((note) => note.id === preferredNoteId) ? preferredNoteId : next.notes[0]?.id || "");
    return next;
  }, [demoOverview, preview, projectId]);

  const loadNote = useCallback(async (noteId: string, signal?: AbortSignal) => {
    if (!projectId || !noteId) return;
    if (preview) {
      const note = demoOverview?.notes.find((item) => item.id === noteId);
      if (note) setSelectedNote({ ...note, body: previewKnowledgeBodies[note.id] || "", markdown: previewKnowledgeBodies[note.id] || "" });
      return;
    }
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
    } finally {
      if (!signal?.aborted && revision === noteLoadRevision.current) setLoading(false);
    }
  }, [demoOverview, preview, projectId]);

  useEffect(() => {
    if (preview) return;
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
  }, [loadNote, preview, projectId]);

  useEffect(() => {
    if (preview) return;
    if (!projectId) return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void refreshOverview(selectedNoteId).then((next) => {
        if (selectedNoteId && next?.notes.some((note) => note.id === selectedNoteId)) void loadNote(selectedNoteId);
      }).catch(() => undefined);
    };
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [loadNote, preview, projectId, refreshOverview, selectedNoteId]);

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
    if (preview) { setNotice("Design preview · changes are not saved."); return; }
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
    if (preview) { setNotice("Design preview · changes are not saved."); return; }
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
    if (preview) { setNotice("Design preview · refreshes are not run."); return; }
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

  if (!projects.length) return <Empty className="min-h-80 rounded-2xl border bg-card p-8 text-left sm:p-12">
    <EmptyHeader className="items-start text-left">
      <Badge variant="outline" className="mb-1">Project memory</Badge>
      <EmptyTitle className="text-2xl tracking-tight">Start with a project</EmptyTitle>
      <EmptyDescription className="max-w-xl text-left">Create a project before building shared notes. Project knowledge gives your agents the same concise context without copying entire chat histories.</EmptyDescription>
    </EmptyHeader>
    <EmptyContent className="items-start">
      <Button onClick={onManageProjects}>Set up a project</Button>
    </EmptyContent>
  </Empty>;

  const latestRun = currentOverview?.refreshRuns[0];
  const agentDiaries = (currentOverview?.notes || []).filter((note) => note.kind === "agent_diary");
  const diaryTimezone = stewardSettings?.timezone || "UTC";
  const pinnedSet = new Set(stewardSettings?.pinned_note_ids || []);
  const pinnableNotes = currentOverview ? [
    ...currentOverview.notes.filter((note) => pinnedSet.has(note.id)),
    ...currentOverview.notes.filter((note) => !pinnedSet.has(note.id) && ["active", "proposed"].includes(note.status)).slice(0, 30),
  ] : [];

  return <div className="grid gap-4 text-foreground sm:gap-5">
    <header className="flex flex-col justify-between gap-4 border-b pb-5 md:flex-row md:items-end">
      <div className="min-w-0">
        <Badge variant="outline" className="mb-2">Project memory</Badge>
        <h1 className="text-3xl font-semibold tracking-tight">Knowledge</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Keep useful decisions and context in one place. Connected agents can search these notes before they start work.</p>
      </div>
      <Field className="w-full max-w-sm">
        <FieldLabel htmlFor="knowledge-project">Project</FieldLabel>
        <Select items={projects.map((project) => ({ value: project.id, label: project.name }))} value={projectId} onValueChange={(value) => { if (value !== null) chooseProject(value); }}>
          <SelectTrigger id="knowledge-project" className="w-full"><SelectValue placeholder="Choose a project" /></SelectTrigger>
          <SelectContent>
            {projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
    </header>

    <div className="flex flex-col gap-2 rounded-xl border bg-muted/30 px-4 py-3 text-sm sm:flex-row sm:items-baseline">
      <Badge variant={stewardSettings?.enabled ? "default" : "secondary"}>{stewardSettings?.enabled ? "Scheduled" : "Quiet by default"}</Badge>
      <p className="m-0 leading-6 text-muted-foreground">{stewardSettings?.enabled ? `The Knowledge Steward checks this project ${stewardSettings.schedule_slots.length} times per day in ${stewardSettings.timezone}. Runs create proposed notes for your review and do not wake agents.` : "Notes are available to connected agents through Stoic. Scheduled model calls begin only after you enable the Knowledge Steward."}</p>
    </div>

    <Card size="sm">
      <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2"><Badge variant="secondary">Agent diary</Badge><CardTitle className="text-base">Nightly check-in · 11:30 PM</CardTitle></div>
          <CardDescription>Entries use {diaryTimezone}. Add the 30- or 60-minute Stoic Chat check-in prompt to an agent with a native schedule; Stoic cannot wake an offline host. The daily Ideas run reads these self-reported notes as context.</CardDescription>
        </div>
        <Badge variant="outline">{agentDiaries.length} {agentDiaries.length === 1 ? "entry" : "entries"}</Badge>
      </CardHeader>
    </Card>

    {error && <Alert variant="destructive" className="grid-cols-[1fr_auto] items-start">
      <div><AlertTitle>Could not complete that action</AlertTitle><AlertDescription className="break-words">{error}</AlertDescription></div>
      <Button type="button" variant="ghost" size="sm" onClick={() => setError("")}>Dismiss</Button>
    </Alert>}
    {notice && <Alert role="status" className="grid-cols-[1fr_auto] items-start border-emerald-700/20 bg-emerald-500/5 text-foreground">
      <div><AlertTitle>Knowledge updated</AlertTitle><AlertDescription>{notice}</AlertDescription></div>
      <Button type="button" variant="ghost" size="sm" onClick={() => setNotice("")}>Dismiss</Button>
    </Alert>}

    <Accordion value={stewardPanelOpen ? ["steward"] : []} onValueChange={(value) => setStewardOpen(value.includes("steward"))} className="overflow-hidden rounded-xl border bg-card">
      <AccordionItem value="steward" className="border-0">
        <AccordionTrigger className="px-4 py-4 hover:no-underline sm:px-5">
          <span className="grid gap-1">
            <span className="text-base font-semibold">Knowledge Steward</span>
            <span className="text-sm font-normal text-muted-foreground">Keep shared project memory current on a calm schedule</span>
          </span>
          <Badge variant={stewardSettings?.enabled ? "default" : "outline"} className="mr-3">{stewardSettings?.enabled ? "Scheduled" : "Off"}</Badge>
        </AccordionTrigger>
        <AccordionContent className="px-4 sm:px-5">
          {stewardSettings ? <form className="pb-5" onSubmit={saveStewardSettings}>
            <FieldGroup>
              <FieldDescription className="max-w-4xl">Stoic reviews bounded project context and adds proposed Markdown notes. It never edits the authoritative brief, assigns work, approves actions, or wakes an offline agent. Each run uses Stoic’s AI coordinator.</FieldDescription>
              <Field orientation="horizontal" className="items-center justify-between gap-4 rounded-xl border bg-muted/20 p-4">
                <FieldContent>
                  <FieldTitle>Enable scheduled refresh</FieldTitle>
                  <FieldDescription>Runs are checked hourly and may start after the selected local times.</FieldDescription>
                </FieldContent>
                <Switch aria-label="Enable scheduled refresh" checked={stewardSettings.enabled} onCheckedChange={(checked) => updateStewardSettings({ enabled: checked })} />
              </Field>

              <div className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="knowledge-timezone">Project time zone</FieldLabel>
                  <Input id="knowledge-timezone" value={stewardSettings.timezone} onChange={(event) => updateStewardSettings({ timezone: event.target.value })} maxLength={64} placeholder="America/Chicago" required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="knowledge-retention">Archive Steward notes after (days)</FieldLabel>
                  <Input id="knowledge-retention" type="number" min={1} max={3650} value={stewardSettings.retention_days} onChange={(event) => updateStewardSettings({ retention_days: Number(event.target.value) })} required />
                  <FieldDescription>Older Steward-created notes move to Archived. Pinned notes stay.</FieldDescription>
                </Field>
              </div>

              <FieldSet className="rounded-xl border p-4">
                <FieldLegend variant="label">Local run times</FieldLegend>
                <div className="flex flex-wrap gap-x-4 gap-y-3">
                  {stewardSettings.schedule_slots.map((slot, index) => <div key={`${slot}-${index}`} className="flex flex-wrap items-end gap-2">
                    <Field className="w-36">
                      <FieldLabel htmlFor={`knowledge-time-${index}`}>Run {index + 1}</FieldLabel>
                      <Input id={`knowledge-time-${index}`} type="time" value={slot} onChange={(event) => updateStewardSettings({ schedule_slots: stewardSettings.schedule_slots.map((value, slotIndex) => slotIndex === index ? event.target.value : value) })} />
                    </Field>
                    {stewardSettings.schedule_slots.length > 1 && <Button type="button" variant="ghost" size="sm" onClick={() => updateStewardSettings({ schedule_slots: stewardSettings.schedule_slots.filter((_, slotIndex) => slotIndex !== index) })}>Remove</Button>}
                  </div>)}
                </div>
                {stewardSettings.schedule_slots.length < 6 && <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => updateStewardSettings({ schedule_slots: [...stewardSettings.schedule_slots, nextScheduleSlot(stewardSettings.schedule_slots)] })}>Add a run time</Button>}
              </FieldSet>

              <FieldSet className="rounded-xl border p-4">
                <FieldLegend variant="label">Sources the Steward may summarize</FieldLegend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {KNOWLEDGE_SOURCE_SCOPES.map((source) => <Field key={source} orientation="horizontal" className="items-start gap-2">
                    <Checkbox id={`knowledge-source-${source}`} aria-label={scopeLabels[source]} checked={stewardSettings.source_scopes.includes(source)} onCheckedChange={(checked) => updateStewardSettings({ source_scopes: checked === true ? [...stewardSettings.source_scopes, source] : stewardSettings.source_scopes.filter((item) => item !== source) })} />
                    <FieldContent><FieldLabel htmlFor={`knowledge-source-${source}`} className="text-sm font-normal leading-5">{scopeLabels[source]}</FieldLabel></FieldContent>
                  </Field>)}
                </div>
              </FieldSet>

              {pinnableNotes.length > 0 && <FieldSet className="rounded-xl border p-4">
                <FieldLegend variant="label">Pinned notes kept in every refresh</FieldLegend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {pinnableNotes.map((note) => <Field key={note.id} orientation="horizontal" className="items-start gap-2">
                    <Checkbox id={`knowledge-pin-${note.id}`} aria-label={`Pin ${plainRichInline(note.title)}`} checked={stewardSettings.pinned_note_ids.includes(note.id)} disabled={!stewardSettings.pinned_note_ids.includes(note.id) && stewardSettings.pinned_note_ids.length >= 100} onCheckedChange={(checked) => updateStewardSettings({ pinned_note_ids: checked === true ? [...stewardSettings.pinned_note_ids, note.id] : stewardSettings.pinned_note_ids.filter((id) => id !== note.id) })} />
                    <FieldContent><FieldLabel htmlFor={`knowledge-pin-${note.id}`} className="text-sm font-normal leading-5"><AssistantRichInline text={note.title} /></FieldLabel></FieldContent>
                  </Field>)}
                </div>
              </FieldSet>}

              <div className="flex flex-col gap-3 border-t pt-4 md:flex-row md:items-center md:justify-between">
                <p className="m-0 text-xs leading-5 text-muted-foreground">{latestRun ? `Last ${latestRun.trigger_kind === "manual" ? "manual" : "scheduled"} run: ${latestRun.status || "unknown"} · ${latestRun.created_at ? new Date(latestRun.created_at).toLocaleString() : "time unavailable"}` : "No refresh has run yet."}</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => void runStewardNow()} disabled={stewardRunning}>{stewardRunning ? "Refreshing…" : "Refresh now"}</Button>
                  <Button type="submit" disabled={stewardSaving || stewardRunning || !stewardSettings.source_scopes.length || !stewardSettings.schedule_slots.length || stewardSettings.schedule_slots.some((slot) => !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(slot)) || new Set(stewardSettings.schedule_slots).size !== stewardSettings.schedule_slots.length}>{stewardSaving ? "Saving…" : "Save settings"}</Button>
                </div>
              </div>
            </FieldGroup>
          </form> : <div className="grid gap-3 pb-5"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-1/2" /></div>}
        </AccordionContent>
      </AccordionItem>
    </Accordion>

    <Tabs value={panel} onValueChange={(value) => setPanel(value as Panel)} className="gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <TabsList aria-label="Knowledge view" className="w-full sm:w-fit">
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="diary">Agent diary <Badge variant="outline" className="ml-2 px-1.5">{agentDiaries.length}</Badge></TabsTrigger>
          <TabsTrigger value="graph">Graph</TabsTrigger>
        </TabsList>
        <div className="flex flex-1 flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">{currentOverview ? `${currentOverview.notes.length} ${currentOverview.notes.length === 1 ? "note" : "notes"}` : "Loading notes"}</Badge>
          <Badge variant={currentOverview?.settings.enabled ? "default" : "secondary"}>{currentOverview?.settings.enabled ? "Scheduled refresh on" : "Manual review"}</Badge>
        </div>
        <Button className="w-full sm:w-auto" onClick={createNote} disabled={loading}>New note</Button>
      </div>

      <TabsContent value="notes">
        <div className="grid min-h-[32rem] gap-4 lg:grid-cols-[minmax(15rem,0.78fr)_minmax(0,1.65fr)]">
          <Card className="min-w-0 gap-0 bg-muted/20">
            <CardHeader className="gap-3 border-b pb-4">
              <div className="flex items-center justify-between gap-2">
                <CardTitle>Project notes</CardTitle>
                <Badge variant="secondary">{currentOverview?.notes.length ?? "…"}</Badge>
              </div>
              <Field>
                <FieldLabel htmlFor="knowledge-search">Search notes</FieldLabel>
                <Input id="knowledge-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title, ID, or path" />
              </Field>
              <Tabs value={scope} onValueChange={(value) => setScope(value as KnowledgeGraphScope)}>
                <TabsList aria-label="Filter notes" className="h-auto w-full flex-wrap justify-start">
                  {scopeOptions.map((option) => <TabsTrigger key={option.value} value={option.value} className="flex-none px-2 text-xs">{option.label}</TabsTrigger>)}
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 p-0">
              {currentOverview && filteredGraph.nodes.length > 0 ? <div className="grid max-h-[36rem] overflow-y-auto">
                {filteredGraph.nodes.map((note) => <Button key={note.id} type="button" variant="ghost" aria-pressed={selectedNoteId === note.id} onClick={() => chooseNote(note.id)} className={`h-auto w-full justify-start rounded-none border-b px-4 py-3 text-left ${selectedNoteId === note.id ? "bg-accent/60" : ""}`}>
                  <span className="grid w-full min-w-0 gap-1.5 whitespace-normal">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{noteLabel(note.kind)}</span>
                    <strong className="line-clamp-2 text-sm font-medium leading-5 text-foreground"><AssistantRichInline text={note.title} /></strong>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Badge variant={statusBadgeVariant(note.status)} className="capitalize">{statusLabel(note.status)}</Badge><span>{note.confidence} confidence</span></span>
                    <span className="text-xs text-muted-foreground">{relativeTime(note.updated_at)}</span>
                  </span>
                </Button>)}
              </div> : currentOverview ? <Empty className="min-h-64 border-0 p-6">
                <EmptyHeader>
                  <EmptyMedia variant="icon"><span className="text-xs font-semibold tracking-wide">KN</span></EmptyMedia>
                  <EmptyTitle>{currentOverview.notes.length ? "No matching notes" : "Your project memory starts here"}</EmptyTitle>
                  <EmptyDescription>{currentOverview.notes.length ? "Try a different search or filter." : "Capture one decision or open question, then let every connected agent read it on its next run."}</EmptyDescription>
                </EmptyHeader>
                {!currentOverview.notes.length && <EmptyContent><Button type="button" variant="outline" onClick={createNote}>Create the first note</Button></EmptyContent>}
              </Empty> : <div className="grid gap-3 p-4"><Skeleton className="h-5 w-2/5" /><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>}
            </CardContent>
          </Card>

          <div aria-label="Knowledge note details" className="min-w-0">
            {draft ? <KnowledgeNoteEditor draft={draft} saving={saving} onChange={setDraft} onCancel={() => { const previousId = selectedNote?.id || ""; setDraft(null); setSelectedNoteId(previousId); if (previousId) void loadNote(previousId); }} onSave={saveNote} />
              : selectedNote && selectedNote.project_id === projectId ? <KnowledgeNoteDetail note={selectedNote} graph={currentOverview?.graph.graph} loading={loading} onEdit={editSelectedNote} />
                : loading ? <Card className="h-full min-h-72"><CardContent className="grid content-start gap-4 p-6"><Skeleton className="h-5 w-1/3" /><Skeleton className="h-9 w-4/5" /><Skeleton className="h-4 w-1/2" /><Skeleton className="mt-4 h-28 w-full" /></CardContent></Card>
                  : <Empty className="min-h-72 rounded-xl border bg-card p-8">
                    <EmptyHeader>
                      <EmptyMedia variant="icon"><span className="text-xs font-semibold tracking-wide">KN</span></EmptyMedia>
                      <EmptyTitle>Select a note to inspect it</EmptyTitle>
                      <EmptyDescription>Source, confidence, and links stay visible so your team can see where shared context came from.</EmptyDescription>
                    </EmptyHeader>
                  </Empty>}
          </div>
        </div>
      </TabsContent>

      <TabsContent value="diary">
        <div className="grid min-h-[32rem] gap-4 lg:grid-cols-[minmax(15rem,0.78fr)_minmax(0,1.65fr)]">
          <Card className="min-w-0 gap-0 bg-muted/20">
            <CardHeader className="border-b pb-4"><div className="flex items-center justify-between gap-2"><CardTitle>Nightly entries</CardTitle><Badge variant="secondary">{agentDiaries.length}</Badge></div><CardDescription>One bounded, self-reported entry per agent, project, and local date.</CardDescription></CardHeader>
            <CardContent className="min-h-0 flex-1 p-0">
              {agentDiaries.length ? <div className="grid max-h-[36rem] overflow-y-auto">{agentDiaries.map((note) => <Button key={note.id} type="button" variant="ghost" aria-pressed={selectedNoteId === note.id} onClick={() => chooseNote(note.id)} className={`h-auto w-full justify-start rounded-none border-b px-4 py-3 text-left ${selectedNoteId === note.id ? "bg-accent/60" : ""}`}>
                <span className="grid w-full min-w-0 gap-1.5 whitespace-normal"><strong className="line-clamp-2 text-sm font-medium leading-5 text-foreground"><AssistantRichInline text={note.title} /></strong><span className="text-xs text-muted-foreground">{agents.find((agent) => agent.id === note.source_agent)?.name || "Connected agent"} · {note.updated_at.slice(0, 10)}</span><span className="text-xs text-muted-foreground">{relativeTime(note.updated_at)} · self-reported</span></span>
              </Button>)}</div> : <Empty className="min-h-64 border-0 p-6"><EmptyHeader><EmptyMedia variant="icon"><span className="text-xs font-semibold tracking-wide">AD</span></EmptyMedia><EmptyTitle>No agent diaries yet</EmptyTitle><EmptyDescription>Paste the Stoic Chat check-in prompt into a connected agent and verify its own scheduler.</EmptyDescription></EmptyHeader></Empty>}
            </CardContent>
          </Card>
          <div aria-label="Agent diary details" className="min-w-0">{selectedNote?.kind === "agent_diary" && selectedNote.project_id === projectId
            ? <KnowledgeNoteDetail note={selectedNote} graph={currentOverview?.graph.graph} loading={loading} onEdit={editSelectedNote} />
            : <Empty className="min-h-72 rounded-xl border bg-card p-8"><EmptyHeader><EmptyTitle>Select a nightly entry</EmptyTitle><EmptyDescription>Important threads, work completed, stated feelings, expectations, predictions, and blockers stay attributed to the agent that recorded them.</EmptyDescription></EmptyHeader></Empty>}</div>
        </div>
      </TabsContent>

      <TabsContent value="graph">
        <Card>
          <CardHeader className="gap-4 border-b sm:flex-row sm:items-end sm:justify-between">
            <div className="grid gap-1">
              <CardTitle>How project notes connect</CardTitle>
              <CardDescription>The graph is generated from Markdown links and stays a read-only view of your notes.</CardDescription>
            </div>
            <div className="grid w-full gap-3 sm:grid-cols-2 sm:gap-4 sm:w-auto">
              <Field>
                <FieldLabel htmlFor="knowledge-kind-filter">Note type</FieldLabel>
                <Select items={[{ value: "all", label: "All types" }, ...filterKindOptions.map((value) => ({ value, label: noteLabel(value) }))]} value={kind} onValueChange={(value) => setKind(value as KnowledgeKind | "all")}>
                  <SelectTrigger id="knowledge-kind-filter" className="w-full sm:min-w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {filterKindOptions.map((value) => <SelectItem key={value} value={value}>{noteLabel(value)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="knowledge-agent-filter">Source agent</FieldLabel>
                <Select items={[{ value: "all", label: "All agents" }, ...agentOptions.map((agent) => ({ value: agent.id, label: agent.name }))]} value={agentId} onValueChange={(value) => { if (value !== null) setAgentId(value); }}>
                  <SelectTrigger id="knowledge-agent-filter" className="w-full sm:min-w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All agents</SelectItem>
                    {agentOptions.map((agent) => <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </CardHeader>
          <CardContent className="grid gap-5 pt-5">
            <Field className="max-w-2xl">
              <FieldLabel htmlFor="knowledge-graph-search">Search this graph</FieldLabel>
              <Input id="knowledge-graph-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a note by title, ID, or path" />
            </Field>
            <Tabs value={scope} onValueChange={(value) => setScope(value as KnowledgeGraphScope)}>
              <TabsList aria-label="Filter graph nodes" className="h-auto w-full flex-wrap justify-start sm:w-fit">
                {scopeOptions.map((option) => <TabsTrigger key={option.value} value={option.value} className="flex-none px-2 text-xs">{option.label}</TabsTrigger>)}
              </TabsList>
            </Tabs>
            <FieldSet>
              <FieldLegend variant="label">Relationship types</FieldLegend>
              <div className="flex flex-wrap gap-x-5 gap-y-3">
                {edgeOptions.map((value) => <Field key={value} orientation="horizontal" className="items-center gap-2">
                  <Checkbox id={`knowledge-edge-${value}`} aria-label={noteLabel(value)} checked={edgeTypes.includes(value)} onCheckedChange={() => toggleEdge(value)} />
                  <FieldLabel htmlFor={`knowledge-edge-${value}`} className="capitalize">{noteLabel(value)}</FieldLabel>
                </Field>)}
              </div>
            </FieldSet>
            {currentOverview ? <KnowledgeGraph graph={filteredGraph} selectedId={selectedNoteId} onSelect={chooseNote} /> : <div className="grid gap-3"><Skeleton className="h-72 w-full" /><Skeleton className="h-4 w-1/3" /></div>}
            {selectedNote && selectedNote.project_id === projectId && <KnowledgeNoteDetail note={selectedNote} graph={currentOverview?.graph.graph} loading={loading} onEdit={editSelectedNote} />}
            {currentOverview && currentOverview.graph.warnings.length > 0 && <Accordion className="border-t pt-2">
              <AccordionItem value="warnings" className="border-0">
                <AccordionTrigger className="py-3 text-sm">{currentOverview.graph.warnings.length} unresolved note references</AccordionTrigger>
                <AccordionContent><p className="pb-2 text-sm text-muted-foreground">Some Markdown links point to notes that are not in this project yet. They are shown as source references and do not grant access.</p></AccordionContent>
              </AccordionItem>
            </Accordion>}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
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
  return <Card className="h-full">
    <form onSubmit={onSave}>
      <CardHeader className="gap-3 border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Badge variant="outline">Owner-edited note</Badge>
            <CardTitle className="mt-2 text-xl"><AssistantRichInline text={draft.title || "New note"} /></CardTitle>
            <CardDescription className="mt-1 max-w-2xl">Notes stay separate from the authoritative project brief. Use a short source summary, not a full chat transcript.</CardDescription>
          </div>
          <code className="max-w-48 break-all text-right text-xs text-muted-foreground">{draft.id}</code>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 pt-5">
        <Field>
          <FieldLabel htmlFor="knowledge-note-title">Title</FieldLabel>
          <Input id="knowledge-note-title" value={draft.title} onChange={(event) => set("title", event.target.value)} maxLength={160} required />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <KnowledgeSelectField label="Type" id="knowledge-note-kind" value={draft.kind} values={kindOptions} format={noteLabel} onChange={(value) => set("kind", value as Draft["kind"])} />
          <KnowledgeSelectField label="Review state" id="knowledge-note-status" value={draft.status} values={statusOptions} format={statusLabel} onChange={(value) => set("status", value as Draft["status"])} />
          <KnowledgeSelectField label="Confidence" id="knowledge-note-confidence" value={draft.confidence} values={confidenceOptions} format={(value) => value} onChange={(value) => set("confidence", value as Draft["confidence"])} />
        </div>
        <Field>
          <FieldLabel htmlFor="knowledge-note-body">Note body</FieldLabel>
          <Textarea id="knowledge-note-body" value={draft.body} onChange={(event) => set("body", event.target.value)} rows={12} maxLength={24_000} className="min-h-52 resize-y leading-6" placeholder="Write one decision, verified fact, or open question…" required />
        </Field>
      </CardContent>
      <CardFooter className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <span className="text-xs text-muted-foreground">{draft.body.length.toLocaleString()} / 24,000 characters · credentials and full transcripts are rejected</span>
        <div className="flex gap-2 self-end sm:self-auto">
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving || !draft.title.trim() || !draft.body.trim()}>{saving ? "Saving…" : "Save note"}</Button>
        </div>
      </CardFooter>
    </form>
  </Card>;
}

function KnowledgeSelectField<T extends string>({ label, id, value, values, format, onChange }: {
  label: string;
  id: string;
  value: T;
  values: readonly T[];
  format: (value: T) => string;
  onChange: (value: string) => void;
}) {
  return <Field>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Select items={values.map((option) => ({ value: option, label: format(option) }))} value={value} onValueChange={(next) => { if (next !== null) onChange(next); }}>
      <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>{values.map((option) => <SelectItem key={option} value={option}>{format(option)}</SelectItem>)}</SelectContent>
    </Select>
  </Field>;
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
  return <Card>
    <CardHeader className="gap-3 border-b">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="capitalize">{noteLabel(note.kind)}</Badge><Badge variant={statusBadgeVariant(note.status)} className="capitalize">{statusLabel(note.status)}</Badge></div>
          <CardTitle className="mt-3 break-words text-2xl leading-tight"><AssistantRichInline text={note.title} /></CardTitle>
          <CardDescription className="mt-2">{relativeTime(note.updated_at)} · {note.confidence} confidence</CardDescription>
        </div>
        {note.kind !== "agent_diary" && <Button type="button" variant="outline" onClick={onEdit} disabled={loading}>Edit note</Button>}
      </div>
      <Badge variant="secondary" className="w-fit">{note.source_agent ? "Agent sourced" : note.source_handoff ? "Handoff sourced" : "Owner sourced"}</Badge>
    </CardHeader>
    <CardContent className="pt-5">
      <div className="min-h-32 text-sm leading-7 text-foreground"><AssistantRichText text={note.body} /></div>
      <Accordion defaultValue={[]} className="mt-6 border-t">
        <AccordionItem value="source" className="border-0">
          <AccordionTrigger className="py-4">Source and relationships</AccordionTrigger>
          <AccordionContent>
            <dl className="grid gap-x-4 gap-y-3 pb-2 text-sm sm:grid-cols-[minmax(7rem,0.42fr)_minmax(0,1fr)]">
              <dt className="text-muted-foreground">Markdown path</dt><dd className="m-0 break-all"><code>{note.path}</code></dd>
              <dt className="text-muted-foreground">Stable note ID</dt><dd className="m-0 break-all"><code>{note.id}</code></dd>
              {note.source_agent && <><dt className="text-muted-foreground">Source agent</dt><dd className="m-0 break-all"><code>{note.source_agent}</code></dd></>}
              {note.source_handoff && <><dt className="text-muted-foreground">Source handoff</dt><dd className="m-0 break-all"><code>{note.source_handoff}</code></dd></>}
              {note.source_user && <><dt className="text-muted-foreground">Owner provenance</dt><dd className="m-0 break-all"><code>{note.source_user}</code></dd></>}
              <dt className="text-muted-foreground">Evidence references</dt><dd className="m-0 flex flex-wrap gap-2">{note.evidence.length ? note.evidence.map((reference) => <code key={reference} className="break-all">{reference}</code>) : "No source references recorded."}</dd>
              <dt className="text-muted-foreground">Linked notes</dt><dd className="m-0 flex flex-wrap gap-2">{connected.length ? connected.map((item) => <span key={item.id}><AssistantRichInline text={item.title} /></span>) : "No links to other notes."}</dd>
              <dt className="text-muted-foreground">Last saved</dt><dd className="m-0"><time dateTime={note.stored_updated_at}>{new Date(note.stored_updated_at).toLocaleString()}</time></dd>
            </dl>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </CardContent>
  </Card>;
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
  if (!graph.totalNodes) return <Empty className="min-h-56 rounded-xl border bg-muted/20 p-6">
    <EmptyHeader><EmptyTitle>No notes to map yet</EmptyTitle><EmptyDescription>Save a decision or question to create the first point in this project graph.</EmptyDescription></EmptyHeader>
  </Empty>;
  if (!renderedNodes.length) return <Empty className="min-h-56 rounded-xl border bg-muted/20 p-6">
    <EmptyHeader><EmptyTitle>No notes match these filters</EmptyTitle><EmptyDescription>Clear one of the filters to see more of the project memory.</EmptyDescription></EmptyHeader>
  </Empty>;
  return <div className="grid min-w-0 gap-3">
    <svg viewBox="0 0 800 520" className="block min-h-72 w-full rounded-xl border bg-muted/20" role="group" aria-label={`Knowledge graph, showing ${renderedNodes.length} of ${graph.totalNodes} notes`}>
      {edges.map((edge) => {
        const source = positions.get(edge.source);
        const target = positions.get(edge.target);
        if (!source || !target) return null;
        return <line key={edge.id} x1={source.x} y1={source.y} x2={target.x} y2={target.y} className="stroke-border opacity-90" strokeWidth="1.35" strokeDasharray={edge.type === "supersedes" ? "5 3" : edge.type === "wikilink" ? "2 4" : undefined} />;
      })}
      {renderedNodes.map((node) => {
        const point = positions.get(node.id);
        if (!point) return null;
        const statusStroke = node.status === "proposed" ? "stroke-amber-600" : node.status === "conflicted" ? "stroke-destructive" : ["stale", "superseded", "archived"].includes(node.status) ? "stroke-muted-foreground" : "stroke-primary";
        return <g key={node.id} className="cursor-pointer outline-none" data-status={node.status} role="button" tabIndex={0} aria-label={`${node.title}, ${statusLabel(node.status)}, ${noteLabel(node.kind)}`} aria-pressed={selectedId === node.id} transform={`translate(${point.x} ${point.y})`} onClick={() => onSelect(node.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(node.id); } }}>
          <title>{plainRichInline(node.title)} · {statusLabel(node.status)} · {noteLabel(node.kind)}</title>
          <circle r={selectedId === node.id ? 11 : 8} className={`fill-background ${statusStroke} ${selectedId === node.id ? "stroke-[3]" : "stroke-2"}`} />
          <text y={24} textAnchor="middle" className={`pointer-events-none fill-muted-foreground text-[9px] ${selectedId === node.id ? "font-semibold fill-foreground" : ""}`}>{plainRichInline(renderedNodes.length <= 24 ? node.title.slice(0, 22) : node.title.slice(0, 14))}</text>
        </g>;
      })}
    </svg>
    <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground"><span>{renderedNodes.length} of {graph.totalNodes} notes shown</span><span>{edges.length} visible relationships</span>{graph.totalNodes > renderedNodes.length && <span>Use search or filters to focus the graph.</span>}</div>
    <div aria-label="Visible graph notes" className="grid border-t sm:grid-cols-2">
      {renderedNodes.map((node) => <Button key={node.id} type="button" variant="ghost" aria-pressed={selectedId === node.id} onClick={() => onSelect(node.id)} className={`h-auto min-w-0 justify-start rounded-none border-b px-2 py-3 text-left ${selectedId === node.id ? "bg-accent/60" : ""}`}>
        <span className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1 whitespace-normal">
          <span className="truncate"><AssistantRichInline text={node.title} /></span>
          <small className="text-xs capitalize text-muted-foreground">{noteLabel(node.kind)} · {statusLabel(node.status)}</small>
        </span>
      </Button>)}
    </div>
  </div>;
}
