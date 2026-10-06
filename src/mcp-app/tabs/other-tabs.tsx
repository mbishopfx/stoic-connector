"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  BookOpenText,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Copy,
  CreditCard,
  ExternalLink,
  FileText,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_CONTACT_FILTERS, type ContactSearchFilters } from "@/lib/contact-filters";
import { promptLibrary, renderStoicPrompt, type StoicPromptId } from "@/lib/prompt-library";
import type { McpTabProps } from "../ui-contract";

const DASHBOARD_URL = "https://stoic.bishoptech.dev/dashboard";
const MCP_ENDPOINT = "https://stoic.bishoptech.dev/api/mcp";

type ContactSource = {
  id: string;
  source_label: string;
  source_url: string | null;
  notes: string;
  artifact_id: string | null;
  created_at: string;
};

type Contact = {
  id: string;
  project_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  job_title: string | null;
  status: string;
  last_seen_at: string | null;
  sources: ContactSource[];
};

type ContactSearchResult = { contacts: Contact[]; total: number; nextOffset: number | null };

type Idea = {
  id: string;
  project_id: string;
  title: string;
  summary: string;
  why_now: string;
  next_step: string;
  evidence_ids: string[];
  status: "pending" | "accepted" | "archived" | string;
  accepted_handoff_id?: string | null;
  archived_at?: string | null;
  created_at: string;
};

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function Field({ id, label, children, hint }: { id: string; label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs leading-5 text-muted-foreground">{hint}</p>}
    </div>
  );
}

function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={(nextValue) => onChange(String(nextValue ?? ""))}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function PageHeading({ eyebrow, title, description, icon }: { eyebrow: string; title: string; description: string; icon: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">{icon}</span>
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{eyebrow}</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>
    </header>
  );
}

function ContactLinkForm({ contact, runtime, onSaved }: { contact: Contact; runtime: McpTabProps["runtime"]; onSaved: () => Promise<void> }) {
  const [sourceLabel, setSourceLabel] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const payload = {
      contactId: contact.id,
      sourceLabel: sourceLabel.trim(),
      sourceUrl: sourceUrl.trim() || null,
      notes: notes.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      company: company.trim() || null,
    };
    const fingerprint = JSON.stringify(payload);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: crypto.randomUUID() };
    setBusy(true);
    try {
      const result = await runtime.callTool<{ alreadyLinked: boolean }>("link_contact", {
        ...payload,
        idempotencyKey: attempt.current.key,
      });
      attempt.current = null;
      setSourceLabel("");
      setSourceUrl("");
      setNotes("");
      setEmail("");
      setPhone("");
      setCompany("");
      await runtime.refreshContext();
      await onSaved();
      runtime.notify(result.alreadyLinked ? "This interaction was already recorded." : "Interaction linked to this contact.", "success");
    } catch (caught) {
      const message = errorMessage(caught, "Could not link this interaction.");
      setError(message);
      runtime.notify(message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`source-label-${contact.id}`} label="Source and date">
          <Input id={`source-label-${contact.id}`} value={sourceLabel} onChange={(event) => setSourceLabel(event.target.value)} minLength={2} maxLength={180} required placeholder="Website inquiry · Oct 5, 2026" />
        </Field>
        <Field id={`source-url-${contact.id}`} label="Safe source URL · optional">
          <Input id={`source-url-${contact.id}`} type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} maxLength={2000} placeholder="https://…" />
        </Field>
      </div>
      <Field id={`interaction-notes-${contact.id}`} label="What happened" hint="Keep it factual. Do not paste message threads or private correspondence.">
        <Textarea id={`interaction-notes-${contact.id}`} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={5000} placeholder="A short note about the interaction" />
      </Field>
      {(contact.email === null || contact.phone === null || contact.company === null) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {contact.email === null && <Field id={`confirmed-email-${contact.id}`} label="Confirmed email · optional"><Input id={`confirmed-email-${contact.id}`} type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} /></Field>}
          {contact.phone === null && <Field id={`confirmed-phone-${contact.id}`} label="Confirmed phone · optional"><Input id={`confirmed-phone-${contact.id}`} type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={60} /></Field>}
          {contact.company === null && <Field id={`confirmed-company-${contact.id}`} label="Confirmed company · optional"><Input id={`confirmed-company-${contact.id}`} value={company} onChange={(event) => setCompany(event.target.value)} maxLength={160} /></Field>}
        </div>
      )}
      <div>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Link interaction"}
        </Button>
      </div>
    </form>
  );
}

function ContactCard({
  contact,
  projectName,
  runtime,
  onSaved,
}: {
  contact: Contact;
  projectName: string;
  runtime: McpTabProps["runtime"];
  onSaved: () => Promise<void>;
}) {
  const [openSources, setOpenSources] = useState(false);
  const [openLinkForm, setOpenLinkForm] = useState(false);
  const [openingArtifact, setOpeningArtifact] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState("");

  async function openArtifact(artifactId: string) {
    setSourceError("");
    setOpeningArtifact(artifactId);
    try {
      const file = await runtime.callTool<{ downloadUrl: string }>("get_artifact", { artifactId });
      await runtime.openLink(file.downloadUrl);
    } catch (error) {
      const message = errorMessage(error, "Could not open this artifact.");
      setSourceError(message);
      runtime.notify(message, "error");
    } finally {
      setOpeningArtifact(null);
    }
  }

  async function openSource(url: string) {
    try {
      await runtime.openLink(url);
    } catch (error) {
      const message = errorMessage(error, "Could not open this source.");
      setSourceError(message);
      runtime.notify(message, "error");
    }
  }

  return (
    <Card size="sm" className="gap-4">
      <CardHeader className="gap-3 sm:grid-cols-[1fr_auto]">
        <div className="min-w-0 space-y-1">
          <CardTitle className="truncate">{contact.full_name}</CardTitle>
          <CardDescription className="break-words">
            {[contact.email, contact.phone, contact.company, projectName].filter(Boolean).join(" · ") || "No contact details recorded"}
          </CardDescription>
        </div>
        <Badge variant={contact.status === "customer" ? "default" : "secondary"}>{contact.status}</Badge>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {contact.job_title && <span>{contact.job_title}</span>}
          <span>Last activity {dateLabel(contact.last_seen_at)}</span>
        </div>
        {sourceError && <p className="text-sm text-destructive" role="alert">{sourceError}</p>}
        <Separator />
        <Collapsible open={openSources} onOpenChange={setOpenSources}>
          <CollapsibleTrigger className="flex min-h-9 w-full items-center justify-between gap-3 rounded-lg px-2 text-left text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
            <span>Recent sources <span className="font-normal text-muted-foreground">({contact.sources?.length ?? 0})</span></span>
            <span aria-hidden="true" className="text-muted-foreground">{openSources ? "−" : "+"}</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="grid gap-3 px-2 pt-3">
            {contact.sources?.length ? contact.sources.map((source) => (
              <div key={source.id} className="grid gap-1.5 rounded-lg border bg-muted/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{source.source_label}</p>
                  <span className="text-xs text-muted-foreground">{dateLabel(source.created_at)}</span>
                </div>
                {source.notes && <p className="whitespace-pre-wrap text-sm leading-5 text-muted-foreground">{source.notes}</p>}
                {(source.source_url || source.artifact_id) && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {source.source_url && <Button type="button" variant="outline" size="sm" onClick={() => void openSource(source.source_url!)}><ExternalLink />Open source</Button>}
                    {source.artifact_id && <Button type="button" variant="outline" size="sm" disabled={openingArtifact === source.artifact_id} onClick={() => void openArtifact(source.artifact_id!)}><FileText />{openingArtifact === source.artifact_id ? "Opening…" : "Open related file"}</Button>}
                  </div>
                )}
              </div>
            )) : (
              <p className="text-sm text-muted-foreground">No source history has been recorded yet.</p>
            )}
            <p className="text-xs leading-5 text-muted-foreground">For full interaction history, use the signed-in owner dashboard. Contact details remain private; Stoic does not send outreach.</p>
          </CollapsibleContent>
        </Collapsible>
        <Collapsible open={openLinkForm} onOpenChange={setOpenLinkForm}>
          <CollapsibleTrigger className="flex min-h-9 w-full items-center justify-between gap-3 rounded-lg border px-3 text-left text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
            <span>Link a verified interaction</span>
            <span aria-hidden="true" className="text-muted-foreground">{openLinkForm ? "−" : "+"}</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4">
            <ContactLinkForm contact={contact} runtime={runtime} onSaved={onSaved} />
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

export function ContactsTab({ context, projectId, runtime }: McpTabProps) {
  const [filters, setFilters] = useState<ContactSearchFilters>({ ...DEFAULT_CONTACT_FILTERS });
  const [searchDraft, setSearchDraft] = useState<ContactSearchFilters>({ ...DEFAULT_CONTACT_FILTERS });
  const [result, setResult] = useState<ContactSearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingContact, setSavingContact] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [createError, setCreateError] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [notes, setNotes] = useState("");
  const requestSequence = useRef(0);
  const createAttempt = useRef<{ fingerprint: string; key: string } | null>(null);

  const loadContacts = useCallback(async (nextFilters: ContactSearchFilters) => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setSearchError("");
    try {
      const data = await runtime.callTool<ContactSearchResult>("search_contacts", nextFilters);
      if (requestId === requestSequence.current) setResult(data);
    } catch (error) {
      const message = errorMessage(error, "Could not load workspace contacts.");
      if (requestId === requestSequence.current) setSearchError(message);
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [runtime]);

  useEffect(() => {
    let active = true;
    const requestId = ++requestSequence.current;
    runtime.callTool<ContactSearchResult>("search_contacts", { ...DEFAULT_CONTACT_FILTERS })
      .then((data) => {
        if (active && requestId === requestSequence.current) setResult(data);
      })
      .catch((error: unknown) => {
        if (active && requestId === requestSequence.current) setSearchError(errorMessage(error, "Could not load workspace contacts."));
      })
      .finally(() => {
        if (active && requestId === requestSequence.current) setLoading(false);
      });
    return () => { active = false; };
  }, [runtime]);

  const projectNames = useMemo(() => new Map(context.projects.map((project) => [project.id, project.name])), [context.projects]);

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextFilters = { ...searchDraft, search: searchDraft.search.trim(), offset: 0 };
    setFilters(nextFilters);
    void loadContacts(nextFilters);
  }

  function clearSearch() {
    const defaults = { ...DEFAULT_CONTACT_FILTERS };
    setSearchDraft(defaults);
    setFilters(defaults);
    void loadContacts(defaults);
  }

  async function refreshResults() {
    await loadContacts(filters);
  }

  async function createContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError("");
    const payload = {
      fullName: fullName.trim(),
      email: email.trim() || null,
      company: company.trim() || null,
      sourceLabel: sourceLabel.trim(),
      notes: notes.trim(),
      projectId: projectId || null,
    };
    const fingerprint = JSON.stringify(payload);
    if (createAttempt.current?.fingerprint !== fingerprint) createAttempt.current = { fingerprint, key: crypto.randomUUID() };
    setSavingContact(true);
    try {
      const saved = await runtime.callTool<{ created: number; updated: number; skipped: number }>("create_contact", {
        ...payload,
        idempotencyKey: createAttempt.current.key,
      });
      createAttempt.current = null;
      setFullName("");
      setEmail("");
      setCompany("");
      setSourceLabel("");
      setNotes("");
      await runtime.refreshContext();
      await loadContacts(filters);
      runtime.notify(`Contact result: ${saved.created} added, ${saved.updated} updated, ${saved.skipped} skipped.`, "success");
    } catch (error) {
      const message = errorMessage(error, "Could not save this contact.");
      setCreateError(message);
      runtime.notify(message, "error");
    } finally {
      setSavingContact(false);
    }
  }

  const currentCount = result?.contacts.length ?? 0;
  const rangeStart = currentCount ? filters.offset + 1 : 0;
  const rangeEnd = filters.offset + currentCount;

  return (
    <main className="grid min-w-0 gap-6">
      <PageHeading eyebrow="Private workspace" title="Contacts" description="Keep confirmed leads and relationship context in one private source trail. Search, review source history, and save verified interactions. Stoic never sends outreach." icon={<UsersRound className="size-5" />} />

      <Card>
        <CardHeader>
          <CardTitle>Find and filter contacts</CardTitle>
          <CardDescription>Search first, then narrow by status, project, available contact details, or recent activity.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={applySearch}>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Field id="contact-search" label="Search contacts"><Input id="contact-search" type="search" value={searchDraft.search} onChange={(event) => setSearchDraft((current) => ({ ...current, search: event.target.value }))} maxLength={120} placeholder="Name, company, email…" /></Field>
              <FilterSelect id="contact-search-field" label="Search in" value={searchDraft.field} onChange={(value) => setSearchDraft((current) => ({ ...current, field: value as ContactSearchFilters["field"] }))} options={[
                { value: "all", label: "All fields" }, { value: "name", label: "Name" }, { value: "company", label: "Company" }, { value: "email", label: "Email" }, { value: "phone", label: "Phone" }, { value: "notes", label: "Notes" }, { value: "source", label: "Source label" },
              ]} />
              <FilterSelect id="contact-status" label="Status" value={searchDraft.status} onChange={(value) => setSearchDraft((current) => ({ ...current, status: value as ContactSearchFilters["status"] }))} options={["all", "new", "contacted", "qualified", "customer", "archived"].map((value) => ({ value, label: value === "all" ? "All statuses" : value.charAt(0).toUpperCase() + value.slice(1) }))} />
              <FilterSelect id="contact-project" label="Project" value={searchDraft.projectId} onChange={(value) => setSearchDraft((current) => ({ ...current, projectId: value }))} options={[
                { value: "all", label: "All projects" }, { value: "unassigned", label: "Unassigned" }, ...context.projects.map((project) => ({ value: project.id, label: project.name })),
              ]} />
              <FilterSelect id="contact-details" label="Contact details" value={searchDraft.contactability} onChange={(value) => setSearchDraft((current) => ({ ...current, contactability: value as ContactSearchFilters["contactability"] }))} options={[
                { value: "any", label: "Any details" }, { value: "has_email", label: "Has email" }, { value: "missing_email", label: "Missing email" }, { value: "has_phone", label: "Has phone" }, { value: "missing_phone", label: "Missing phone" }, { value: "no_direct", label: "No email or phone" },
              ]} />
              <FilterSelect id="contact-activity" label="Last activity" value={searchDraft.activity} onChange={(value) => setSearchDraft((current) => ({ ...current, activity: value as ContactSearchFilters["activity"] }))} options={[
                { value: "any", label: "Any time" }, { value: "7d", label: "Past 7 days" }, { value: "30d", label: "Past 30 days" }, { value: "90d", label: "Past 90 days" },
              ]} />
              <FilterSelect id="contact-sort" label="Sort by" value={searchDraft.sort} onChange={(value) => setSearchDraft((current) => ({ ...current, sort: value as ContactSearchFilters["sort"] }))} options={[
                { value: "recent", label: "Recently updated" }, { value: "last_seen", label: "Last interaction" }, { value: "newest", label: "Newest added" }, { value: "oldest", label: "Oldest added" }, { value: "name_asc", label: "Name A to Z" }, { value: "name_desc", label: "Name Z to A" },
              ]} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={loading}><Search />{loading ? "Searching…" : "Apply filters"}</Button>
              <Button type="button" variant="outline" onClick={clearSearch}>Clear filters</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="sm:grid-cols-[1fr_auto]">
          <div className="space-y-1">
            <CardTitle>Your contacts</CardTitle>
            <CardDescription>{result ? `${result.total} matching · ${rangeStart}–${rangeEnd} shown` : "Reading private workspace contacts…"}</CardDescription>
          </div>
          {result && <Badge variant="secondary">50 per page</Badge>}
        </CardHeader>
        <CardContent className="grid gap-3">
          {searchError && <p className="text-sm text-destructive" role="alert">{searchError}</p>}
          {loading && !result && <p className="text-sm text-muted-foreground">Loading contacts…</p>}
          {!loading && result && result.contacts.length === 0 && (
            <Empty className="min-h-48 border">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Search /></EmptyMedia>
                <EmptyTitle>No matching contacts</EmptyTitle>
                <EmptyDescription>Try a broader search, or add a contact below after confirming the person and source.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {result?.contacts.map((contact) => (
            <ContactCard key={contact.id} contact={contact} projectName={contact.project_id ? projectNames.get(contact.project_id) || "Project" : "Unassigned"} runtime={runtime} onSaved={refreshResults} />
          ))}
        </CardContent>
        <CardFooter className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">Contact details are private to this workspace.</span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={loading || filters.offset === 0} onClick={() => {
              const previous = { ...filters, offset: Math.max(0, filters.offset - 50) };
              setFilters(previous);
              void loadContacts(previous);
            }}><ChevronLeft />Previous</Button>
            <Button type="button" variant="outline" size="sm" disabled={loading || result?.nextOffset === null || result === null} onClick={() => {
              if (result?.nextOffset === null || result === null) return;
              const next = { ...filters, offset: result.nextOffset };
              setFilters(next);
              void loadContacts(next);
            }}>Next<ChevronRight /></Button>
          </div>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plus className="size-4" />Add a confirmed contact</CardTitle>
          <CardDescription>Save only details from work you were authorized to do. Include the exact source and date so the record can be reviewed later.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={createContact}>
            {createError && <p className="text-sm text-destructive" role="alert">{createError}</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="new-contact-name" label="Full name"><Input id="new-contact-name" value={fullName} onChange={(event) => setFullName(event.target.value)} minLength={2} maxLength={160} required placeholder="Confirmed name" /></Field>
              <Field id="new-contact-email" label="Confirmed email · optional"><Input id="new-contact-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} /></Field>
              <Field id="new-contact-company" label="Company · optional"><Input id="new-contact-company" value={company} onChange={(event) => setCompany(event.target.value)} maxLength={160} /></Field>
              <Field id="new-contact-source" label="Source and date"><Input id="new-contact-source" value={sourceLabel} onChange={(event) => setSourceLabel(event.target.value)} minLength={2} maxLength={180} required placeholder="Referral · Oct 5, 2026" /></Field>
            </div>
            <Field id="new-contact-notes" label="Notes" hint="Concise factual context only. Do not include raw correspondence or sensitive personal information.">
              <Textarea id="new-contact-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={5000} placeholder="What is useful to remember about this relationship?" />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={savingContact}>{savingContact ? "Saving…" : "Save contact"}</Button>
              {projectId && <span className="text-xs text-muted-foreground">Linked to the selected project.</span>}
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

export function IdeasTab({ context, runtime }: McpTabProps) {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [projectFilter, setProjectFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"pending" | "accepted" | "archived" | "all">("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState("__none__");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadIdeas = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await runtime.callTool<Idea[]>("list_team_ideas", {});
      setIdeas(Array.isArray(result) ? result : []);
    } catch (caught) {
      setError(errorMessage(caught, "Could not load team ideas."));
    } finally {
      setLoading(false);
    }
  }, [runtime]);

  useEffect(() => { void loadIdeas(); }, [loadIdeas]);

  const projectNames = useMemo(() => new Map(context.projects.map((project) => [project.id, project.name])), [context.projects]);
  const workers = useMemo(() => context.agents.filter((agent) => agent.status === "connected" && agent.id !== context.bossAgentId && agent.platform !== "muse"), [context.agents, context.bossAgentId]);
  const visibleIdeas = useMemo(() => ideas
    .filter((idea) => projectFilter === "all" || idea.project_id === projectFilter)
    .filter((idea) => statusFilter === "all" || idea.status === statusFilter)
    .sort((left, right) => right.created_at.localeCompare(left.created_at)), [ideas, projectFilter, statusFilter]);
  const statusLabel = (status: string) => status === "pending" ? "Needs review" : status === "accepted" ? "Handoff created" : "Denied";

  function openIdea(idea: Idea) {
    setSelectedIdea(idea);
    setSelectedWorkerId("__none__");
    setActionError("");
  }

  async function reviewIdea(idea: Idea, action: "assign" | "deny") {
    if (busy) return;
    setBusy(true);
    setActionError("");
    try {
      if (action === "assign") {
        await runtime.callTool("assign_team_idea", { ideaId: idea.id, agentId: selectedWorkerId });
      } else {
        await runtime.callTool("deny_team_idea", { ideaId: idea.id });
      }
      setIdeas((current) => current.map((item) => item.id === idea.id ? { ...item, status: action === "assign" ? "accepted" : "archived" } : item));
      setSelectedIdea(null);
      setSelectedWorkerId("__none__");
      runtime.notify(action === "assign" ? "Idea assigned and handoff created." : "Idea denied and kept in the review history.", "success");
    } catch (caught) {
      const message = errorMessage(caught, action === "assign" ? "Could not assign this idea." : "Could not deny this idea.");
      setActionError(message);
      runtime.notify(message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-w-0 gap-6">
      <PageHeading eyebrow="Owner review" title="Ideas" description="Review each agent suggestion, open its evidence and next step, then assign it to a connected worker or deny it." icon={<Sparkles className="size-5" />} />
      <Card className="min-w-0">
        <CardHeader className="gap-4 border-b sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-1">
            <CardTitle>For your review</CardTitle>
            <CardDescription>{visibleIdeas.length} {visibleIdeas.length === 1 ? "idea" : "ideas"} in this view · select a row to review its evidence and next step</CardDescription>
          </div>
          <div className="flex min-w-0 flex-col gap-2 sm:w-56">
            <Label htmlFor="ideas-project-filter" className="text-xs text-muted-foreground">Project</Label>
            <Select value={projectFilter} onValueChange={(value) => setProjectFilter(value || "all")}>
              <SelectTrigger id="ideas-project-filter" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All projects</SelectItem>{context.projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter ideas by status">
            {(["pending", "accepted", "archived", "all"] as const).map((status) => <Button key={status} type="button" size="sm" variant={statusFilter === status ? "secondary" : "outline"} aria-pressed={statusFilter === status} onClick={() => setStatusFilter(status)}>
              {status === "all" ? "All" : statusLabel(status)}
              {status !== "all" && <Badge variant="outline" className="ml-1 px-1.5">{ideas.filter((idea) => idea.status === status).length}</Badge>}
            </Button>)}
            <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={() => void loadIdeas()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</Button>
          </div>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          {loading && ideas.length === 0 && <p className="text-sm text-muted-foreground" role="status">Loading suggestions…</p>}
          {!loading && !error && visibleIdeas.length === 0 && <Empty className="min-h-48 border border-dashed bg-muted/30">
            <EmptyHeader><EmptyMedia variant="icon"><Sparkles /></EmptyMedia><EmptyTitle>{statusFilter === "pending" ? "No ideas need review" : "Nothing in this view"}</EmptyTitle><EmptyDescription>{projectFilter === "all" ? "New agent suggestions will appear here for your review." : "There are no suggestions for this project in the selected view."}</EmptyDescription></EmptyHeader>
          </Empty>}
          {visibleIdeas.length > 0 && <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader><TableRow><TableHead>Idea</TableHead><TableHead>Project</TableHead><TableHead>Status</TableHead><TableHead>Added</TableHead><TableHead className="text-right">Review</TableHead></TableRow></TableHeader>
              <TableBody>{visibleIdeas.map((idea) => <TableRow key={idea.id} className="cursor-pointer" onClick={() => openIdea(idea)}>
                <TableCell className="max-w-[28rem] whitespace-normal">
                  <button type="button" aria-haspopup="dialog" className="text-left font-medium hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" onClick={(event) => { event.stopPropagation(); openIdea(idea); }}>{idea.title}</button>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{idea.summary}</p>
                </TableCell>
                <TableCell className="text-muted-foreground">{projectNames.get(idea.project_id) || "Project"}</TableCell>
                <TableCell><Badge variant={idea.status === "pending" ? "secondary" : "outline"}>{statusLabel(idea.status)}</Badge></TableCell>
                <TableCell><time dateTime={idea.created_at} className="text-xs text-muted-foreground">{dateLabel(idea.created_at)}</time></TableCell>
                <TableCell className="text-right"><span className="text-xs font-medium text-primary">{idea.status === "pending" ? "Open review" : "View details"}</span></TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </div>}
        </CardContent>
      </Card>

      <Dialog open={selectedIdea !== null} onOpenChange={(open) => { if (!open && !busy) { setSelectedIdea(null); setSelectedWorkerId("__none__"); setActionError(""); } }}>
        {selectedIdea && <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader className="pr-8">
            <div className="flex flex-wrap items-center gap-2"><Badge variant={selectedIdea.status === "pending" ? "secondary" : "outline"}>{statusLabel(selectedIdea.status)}</Badge><span className="text-xs text-muted-foreground">{projectNames.get(selectedIdea.project_id) || "Project"} · {dateLabel(selectedIdea.created_at)}</span></div>
            <DialogTitle className="text-xl leading-7">{selectedIdea.title}</DialogTitle>
            <DialogDescription className="whitespace-pre-wrap leading-6">{selectedIdea.summary}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <section className="rounded-lg border bg-muted/30 p-4"><h3 className="mb-1 text-sm font-semibold">Why now</h3><p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{selectedIdea.why_now || "No timing details were attached."}</p></section>
            <section className="rounded-lg border bg-muted/30 p-4"><h3 className="mb-1 text-sm font-semibold">First step</h3><p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{selectedIdea.next_step || "No next step was attached."}</p></section>
            <section className="space-y-2"><div className="flex items-center gap-2"><h3 className="text-sm font-semibold">Source evidence</h3><Badge variant="outline">{selectedIdea.evidence_ids.length}</Badge></div>{selectedIdea.evidence_ids.length ? <ul className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">{selectedIdea.evidence_ids.map((source) => <li key={source} className="break-all rounded-md border bg-muted/30 px-3 py-2">{source}</li>)}</ul> : <p className="text-sm text-muted-foreground">No evidence references were attached.</p>}</section>
            {selectedIdea.status === "pending" && context.self.role === "boss" && <section className="space-y-3 rounded-lg border bg-muted/30 p-4">
              <div><h3 className="text-sm font-semibold">Assign this idea</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Choose a connected worker. Assignment creates a handoff for that worker.</p></div>
              <div className="grid gap-2"><Label htmlFor="idea-worker">Connected worker</Label><Select value={selectedWorkerId} onValueChange={(value) => setSelectedWorkerId(value || "__none__")} disabled={busy || !workers.length || context.workspace.delegationLevel === "observe"}>
                <SelectTrigger id="idea-worker" aria-label="Choose a connected worker" className="w-full"><SelectValue placeholder="Choose a worker" /></SelectTrigger>
                <SelectContent><SelectItem value="__none__" disabled>Choose a worker</SelectItem>{workers.map((worker) => <SelectItem key={worker.id} value={worker.id}>{worker.name}</SelectItem>)}</SelectContent>
              </Select></div>
              {!workers.length && <p className="text-xs text-muted-foreground">Connect an eligible MCP worker before assigning this idea.</p>}
              {context.workspace.delegationLevel === "observe" && <p className="text-xs text-muted-foreground">This workspace is in Observe mode. Change delegation policy before creating a handoff.</p>}
            </section>}
            {selectedIdea.status === "pending" && context.self.role !== "boss" && <p className="rounded-lg border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">Only the designated boss can assign or deny an idea. You can still review its source evidence and suggested next step.</p>}
            {selectedIdea.status === "accepted" && <p className="text-xs text-muted-foreground">Handoff {selectedIdea.accepted_handoff_id ? `#${selectedIdea.accepted_handoff_id.slice(0, 8)}` : "created"} from this idea.</p>}
            {selectedIdea.status === "archived" && <p className="text-xs text-muted-foreground">This idea was denied and kept in the review history.</p>}
            {actionError && <p className="text-sm text-destructive" role="alert">{actionError}</p>}
          </div>
          <DialogFooter className="border-t pt-4 sm:justify-between">
            {selectedIdea.status === "pending" && context.self.role === "boss" ? <>
              <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => void reviewIdea(selectedIdea, "deny")}>{busy ? "Saving…" : "Deny idea"}</Button>
              <Button type="button" disabled={busy || !workers.some((worker) => worker.id === selectedWorkerId) || context.workspace.delegationLevel === "observe"} onClick={() => void reviewIdea(selectedIdea, "assign")}>{busy ? "Assigning…" : workers.find((worker) => worker.id === selectedWorkerId) ? `Assign to ${workers.find((worker) => worker.id === selectedWorkerId)?.name}` : "Choose a worker"}</Button>
            </> : <Button type="button" variant="outline" onClick={() => setSelectedIdea(null)}>Close</Button>}
          </DialogFooter>
        </DialogContent>}
      </Dialog>
    </main>
  );
}

export function PromptsTab({ runtime }: McpTabProps) {
  const [openPrompt, setOpenPrompt] = useState<StoicPromptId | null>(null);
  const [copyError, setCopyError] = useState<StoicPromptId | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState<StoicPromptId | null>(null);

  async function copyPrompt(id: StoicPromptId) {
    setCopiedPrompt(null);
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(renderStoicPrompt(id, MCP_ENDPOINT));
      setCopiedPrompt(id);
      runtime.notify("Prompt copied. Confirm the other agent’s Stoic connection before using it.", "success");
    } catch {
      setCopyError(id);
      setOpenPrompt(id);
      runtime.notify("Clipboard access is unavailable in this host. Select the prompt preview and copy it manually.", "error");
    }
  }

  return (
    <main className="grid min-w-0 gap-6">
      <PageHeading eyebrow="Agent playbooks" title="Prompt library" description="Copy scoped instructions for an agent you already use. A prompt does not configure MCP, grant access to email, or start a schedule." icon={<BookOpenText className="size-5" />} />
      <Card className="sm:flex-row sm:items-center sm:justify-between">
        <CardHeader>
          <CardTitle>Connect the agent first</CardTitle>
          <CardDescription>Use its own private Stoic connection, or an owner-authorized browser session for Muse. Never paste credentials into a prompt.</CardDescription>
        </CardHeader>
        <CardContent className="sm:pr-4">
          <Button type="button" variant="outline" onClick={() => void runtime.openLink(DASHBOARD_URL)}><ExternalLink />Open owner setup</Button>
        </CardContent>
      </Card>
      <section className="grid gap-4 xl:grid-cols-2" aria-label="Available prompts">
        {promptLibrary.map((item) => {
          const text = renderStoicPrompt(item.id, MCP_ENDPOINT);
          const expanded = openPrompt === item.id;
          return (
            <Card key={item.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>{item.title}</CardTitle>
                  <Badge variant="secondary">{item.audience}</Badge>
                </div>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <Collapsible open={expanded} onOpenChange={(open) => setOpenPrompt(open ? item.id : null)}>
                  <CollapsibleTrigger className="flex min-h-9 w-full items-center justify-between gap-3 rounded-lg border px-3 text-left text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
                    <span>{expanded ? "Hide prompt preview" : "Preview prompt"}</span><span aria-hidden="true" className="text-muted-foreground">{expanded ? "−" : "+"}</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3">
                    <Textarea readOnly value={text} className="min-h-64 resize-y font-mono text-xs leading-5" aria-label={`${item.title} prompt preview`} />
                    {copyError === item.id && <p className="pt-2 text-xs text-muted-foreground">Clipboard access is unavailable. Select the text above and copy it manually.</p>}
                  </CollapsibleContent>
                </Collapsible>
                <Button type="button" onClick={() => void copyPrompt(item.id)}>{copiedPrompt === item.id ? <Check /> : <Copy />}{copiedPrompt === item.id ? "Copied" : "Copy prompt"}</Button>
              </CardContent>
            </Card>
          );
        })}
      </section>
      <Card size="sm">
        <CardContent className="flex items-start gap-3 py-4">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-sm leading-6 text-muted-foreground">Prompts are instructions only. They never grant access, initiate an external action, or guarantee that an agent is scheduled to run.</p>
        </CardContent>
      </Card>
    </main>
  );
}

export function BillingTab({ runtime }: McpTabProps) {
  return (
    <main className="grid min-w-0 gap-6">
      <PageHeading eyebrow="Account" title="Plan & billing" description="Manage the subscription for your Stoic workspace. Agent providers continue to bill for their own models and schedules." icon={<CreditCard className="size-5" />} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(17rem,0.8fr)]">
        <Card>
          <CardHeader className="sm:grid-cols-[1fr_auto]">
            <div className="space-y-1">
              <CardTitle>Stoic Connector</CardTitle>
              <CardDescription>One subscription covers coordination for the workspace and its connected agents.</CardDescription>
            </div>
            <Badge variant="secondary">$5 / month</Badge>
          </CardHeader>
          <CardContent className="grid gap-5">
            <Separator />
            <div className="grid gap-3 sm:grid-cols-2">
              <Card size="sm"><CardContent className="grid gap-1 py-3"><p className="text-xs text-muted-foreground">Workspace plan</p><p className="font-semibold">One monthly subscription</p></CardContent></Card>
              <Card size="sm"><CardContent className="grid gap-1 py-3"><p className="text-xs text-muted-foreground">Plan limits</p><p className="font-semibold">No monthly caps on agents, projects, or handoffs</p></CardContent></Card>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                "Shared briefs, handoffs, and project board",
                "Private files and project routing",
                "Periodic next-step suggestions for review",
                "Human approval controls and work history",
              ].map((feature) => <div key={feature} className="flex items-start gap-2 rounded-lg border bg-muted/20 p-3 text-sm leading-5"><Check className="mt-0.5 size-4 shrink-0 text-primary" />{feature}</div>)}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void runtime.openLink(DASHBOARD_URL)}><ExternalLink />Open plan and billing</Button>
            </div>
          </CardContent>
        </Card>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CircleAlert className="size-4" />Provider costs</CardTitle>
            <CardDescription>Stoic and your agent providers bill separately.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <p className="text-sm leading-6 text-muted-foreground">Stoic coordinates the agents you bring. Model usage and native scheduled runs are billed by each agent provider under your provider account.</p>
            <Separator />
            <p className="text-sm leading-6 text-muted-foreground">Billing details and cancellation options are available to the workspace owner in the secure dashboard.</p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
