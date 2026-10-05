"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps, FormEvent } from "react";
import { ArrowUpRight, Building2, CalendarDays, FileUp, History, Link2, Mail, Phone, RefreshCw, Search, UserRound, UsersRound, X } from "lucide-react";
import { CONTACT_STATUSES, DEFAULT_CONTACT_FILTERS, contactSearchParams, type ContactSearchFilters } from "@/lib/contact-filters";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

type Project = { id: string; name: string };
type ContactSource = { id: string; source_label: string; source_url: string | null; notes: string; artifact_id: string | null; created_at: string };
type Contact = {
  id: string; project_id: string | null; full_name: string; email: string | null; phone: string | null;
  company: string | null; job_title: string | null; status: typeof CONTACT_STATUSES[number]; notes: string;
  created_at: string; updated_at: string; last_seen_at: string; sources: ContactSource[];
};
type Command = (action: string, payload?: Record<string, unknown>) => Promise<unknown>;

const statusNames: Record<ContactSearchFilters["status"], string> = {
  all: "All", new: "New", contacted: "Contacted", qualified: "Qualified", customer: "Customer", archived: "Archived",
};
const fieldNames: Record<ContactSearchFilters["field"], string> = {
  all: "All fields", name: "Name", company: "Company", email: "Email", phone: "Phone", notes: "Notes", source: "Source label",
};
const contactabilityNames: Record<ContactSearchFilters["contactability"], string> = {
  any: "Any contact details", has_email: "Has email", missing_email: "Missing email",
  has_phone: "Has phone", missing_phone: "Missing phone", no_direct: "No email or phone",
};
const activityNames: Record<ContactSearchFilters["activity"], string> = {
  any: "Any time", "7d": "Past 7 days", "30d": "Past 30 days", "90d": "Past 90 days",
};
const sortNames: Record<ContactSearchFilters["sort"], string> = {
  recent: "Recently updated", last_seen: "Last interaction", newest: "Newest added",
  oldest: "Oldest added", name_asc: "Name A to Z", name_desc: "Name Z to A",
};

function formattedDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Unknown" : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

type SelectOption = { value: string; label: string };

function TextField({ id, label, help, fieldClassName, ...inputProps }: Omit<ComponentProps<typeof Input>, "id"> & {
  id: string; label: string; help?: string; fieldClassName?: string;
}) {
  return <Field className={fieldClassName}>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Input id={id} {...inputProps} />
    {help && <FieldDescription>{help}</FieldDescription>}
  </Field>;
}

function TextareaField({ id, label, help, fieldClassName, ...textareaProps }: Omit<ComponentProps<typeof Textarea>, "id"> & {
  id: string; label: string; help?: string; fieldClassName?: string;
}) {
  return <Field className={fieldClassName}>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Textarea id={id} {...textareaProps} />
    {help && <FieldDescription>{help}</FieldDescription>}
  </Field>;
}

function SelectField({ id, label, options, value, defaultValue, onChange, name, help, required, fieldClassName, placeholder = "Choose an option" }: {
  id: string; label: string; options: SelectOption[]; value?: string; defaultValue?: string;
  onChange?: (value: string) => void; name?: string; help?: string; required?: boolean;
  fieldClassName?: string; placeholder?: string;
}) {
  return <Field className={fieldClassName}>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Select
      id={id}
      name={name}
      value={value}
      defaultValue={defaultValue}
      required={required}
      onValueChange={(nextValue) => { if (typeof nextValue === "string") onChange?.(nextValue); }}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
    {help && <FieldDescription>{help}</FieldDescription>}
  </Field>;
}

function StatusBadge({ status }: { status: Contact["status"] }) {
  const tones: Record<Contact["status"], string> = {
    new: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    contacted: "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300",
    qualified: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    customer: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    archived: "border-border bg-muted text-muted-foreground",
  };
  return <Badge variant="outline" className={tones[status]}>{statusNames[status]}</Badge>;
}

async function jsonResponse(response: Response) {
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error(`Stoic returned an unexpected response (${response.status}).`);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
  return body.data;
}

export function ContactsWorkspace({ projects, busy, command, onOpenPrompts }: {
  projects: Project[]; busy: boolean; command: Command; onOpenPrompts: () => void;
}) {
  const [filters, setFilters] = useState<ContactSearchFilters>({ ...DEFAULT_CONTACT_FILTERS });
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const requestId = useRef(0);
  const addAttempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const importAttempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const projectNames = useMemo(() => Object.fromEntries(projects.map((project) => [project.id, project.name])), [projects]);

  const load = useCallback(async (signal?: AbortSignal) => {
    const current = ++requestId.current;
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch(`/api/contacts?${contactSearchParams(filters)}`, { cache: "no-store", signal });
      const result = await jsonResponse(response) as { contacts: Contact[]; total: number; nextOffset: number | null };
      if (current !== requestId.current) return;
      setContacts(result.contacts);
      setTotal(result.total);
      setNextOffset(result.nextOffset);
      setHasLoaded(true);
    } catch (cause) {
      if (current !== requestId.current || signal?.aborted) return;
      setLoadError(cause instanceof Error ? cause.message : "Could not load contacts.");
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void load(controller.signal); }, filters.search ? 280 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); requestId.current += 1; };
  }, [filters.search, load]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeMobileDetail = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileDetailOpen(false);
    };
    desktop.addEventListener("change", closeMobileDetail);
    return () => desktop.removeEventListener("change", closeMobileDetail);
  }, []);

  function changeFilter<K extends keyof ContactSearchFilters>(key: K, value: ContactSearchFilters[K]) {
    requestId.current += 1;
    setLoading(true);
    setFilters((current) => ({ ...current, [key]: value, offset: 0 }));
    setSelectedId(null);
    setMobileDetailOpen(false);
    setNotice("");
  }

  function clearFilters() {
    requestId.current += 1;
    setLoading(true);
    setFilters({ ...DEFAULT_CONTACT_FILTERS });
    setSelectedId(null);
    setMobileDetailOpen(false);
    setNotice("");
  }

  function changePage(next: number) {
    requestId.current += 1;
    setLoading(true);
    setFilters((current) => ({ ...current, offset: next }));
    setSelectedId(null);
    setMobileDetailOpen(false);
  }

  function chooseContact(id: string) {
    setSelectedId(id);
    if (window.matchMedia("(max-width: 767px)").matches) setMobileDetailOpen(true);
  }

  async function afterWrite(resetPage = false) {
    if (resetPage && filters.offset) changePage(0);
    else await load();
  }

  async function addContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const selectedProjectId = String(form.get("projectId") || "");
    const payload = {
      fullName: String(form.get("fullName") || "").trim(), email: String(form.get("email") || "").trim() || null,
      phone: String(form.get("phone") || "").trim() || null, company: String(form.get("company") || "").trim() || null,
      projectId: selectedProjectId && selectedProjectId !== "__no_project__" ? selectedProjectId : null, sourceLabel: String(form.get("sourceLabel") || "").trim(),
      sourceUrl: String(form.get("sourceUrl") || "").trim() || null, notes: String(form.get("notes") || "").trim(),
    };
    const fingerprint = JSON.stringify(payload);
    if (addAttempt.current?.fingerprint !== fingerprint) addAttempt.current = { fingerprint, key: crypto.randomUUID() };
    const result = await command("create_contact", { ...payload, idempotencyKey: addAttempt.current.key }) as { created: number; updated: number; skipped: number };
    setNotice(`${result.created} added, ${result.updated} updated, ${result.skipped} skipped.`);
    addAttempt.current = null;
    element.reset();
    await afterWrite(true);
  }

  async function importCsv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    const element = event.currentTarget;
    const form = new FormData(element);
    const sourceLabel = String(form.get("sourceLabel") || "").trim();
    const selectedProjectId = String(form.get("projectId") || "");
    const projectId = selectedProjectId === "__no_project__" ? "" : selectedProjectId;
    form.set("projectId", projectId);
    const fingerprint = JSON.stringify([file.name, file.size, file.lastModified, sourceLabel, projectId]);
    if (importAttempt.current?.fingerprint !== fingerprint) importAttempt.current = { fingerprint, key: crypto.randomUUID() };
    setImporting(true);
    setImportMessage("");
    try {
      form.set("file", file);
      form.set("idempotencyKey", importAttempt.current.key);
      const response = await fetch("/api/contacts/import", { method: "POST", body: form });
      const result = await jsonResponse(response) as { created: number; updated: number; skipped: number };
      setImportMessage(`${result.created} added, ${result.updated} updated, ${result.skipped} skipped.`);
      importAttempt.current = null;
      setFile(null);
      element.reset();
      await afterWrite(true);
    } catch (cause) {
      setImportMessage(cause instanceof Error ? cause.message : "Could not import this CSV.");
    } finally {
      setImporting(false);
    }
  }

  const selected = contacts.find((contact) => contact.id === selectedId);
  const activeFilters = [
    filters.search && { key: "search", label: `Search: ${filters.search}` },
    filters.field !== "all" && { key: "field", label: `In: ${fieldNames[filters.field]}` },
    filters.status !== "all" && { key: "status", label: `Status: ${statusNames[filters.status]}` },
    filters.projectId !== "all" && { key: "projectId", label: `Project: ${filters.projectId === "unassigned" ? "Unassigned" : projectNames[filters.projectId] || "Selected project"}` },
    filters.contactability !== "any" && { key: "contactability", label: contactabilityNames[filters.contactability] },
    filters.activity !== "any" && { key: "activity", label: activityNames[filters.activity] },
  ].filter((item): item is { key: string; label: string } => Boolean(item));

  function clearOneFilter(key: string) {
    switch (key) {
      case "search": changeFilter("search", ""); break;
      case "field": changeFilter("field", "all"); break;
      case "status": changeFilter("status", "all"); break;
      case "projectId": changeFilter("projectId", "all"); break;
      case "contactability": changeFilter("contactability", "any"); break;
      case "activity": changeFilter("activity", "any"); break;
    }
  }

  return <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 pb-8">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-3xl">
        <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">Private workspace CRM</Badge>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Contacts</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Search people and source context, then keep each interaction tied to a verified record. No outreach is sent from this workspace.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={onOpenPrompts}>
          <Link2 aria-hidden="true" />
          Contact Link prompt
        </Button>
        <Badge variant="secondary" className="h-7 px-2.5">
          {hasLoaded ? total + " matching" : loadError ? "Unavailable" : "Loading"}
        </Badge>
      </div>
    </header>

    <Card className="border-border/80 shadow-sm">
      <CardHeader className="border-b border-border/70 pb-4">
        <CardTitle>Find contacts</CardTitle>
        <CardDescription>Search by name, company, contact details, notes, or the source label.</CardDescription>
        <CardAction>
          <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
            <RefreshCw aria-hidden="true" className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_15rem]">
          <Field>
            <FieldLabel htmlFor="contact-search">Search contacts</FieldLabel>
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="contact-search"
                type="search"
                value={filters.search}
                onChange={(event) => changeFilter("search", event.target.value)}
                placeholder="Names, email, company, notes…"
                maxLength={120}
                className="pl-9"
              />
            </div>
          </Field>
          <SelectField
            id="contact-search-field"
            label="Search in"
            value={filters.field}
            onChange={(value) => changeFilter("field", value as ContactSearchFilters["field"])}
            options={Object.entries(fieldNames).map(([value, label]) => ({ value, label }))}
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Status</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Filter by status">
            {(["all", ...CONTACT_STATUSES] as ContactSearchFilters["status"][]).map((value) => (
              <Button
                type="button"
                key={value}
                size="sm"
                variant={filters.status === value ? "secondary" : "ghost"}
                aria-pressed={filters.status === value}
                onClick={() => changeFilter("status", value)}
                className="shrink-0 rounded-full px-3"
              >
                {statusNames[value]}
              </Button>
            ))}
          </div>
        </div>

        <Accordion>
          <AccordionItem value="more-filters" className="border-t border-border/70">
            <AccordionTrigger className="py-3 text-sm hover:no-underline">
              <span className="flex items-center gap-2">
                More filters
                <Badge variant="outline" className="h-5 min-w-5 justify-center px-1.5">
                  {activeFilters.filter((item) => ["projectId", "contactability", "activity"].includes(item.key)).length + (filters.sort !== "recent" ? 1 : 0)}
                </Badge>
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-1">
              <div className="grid grid-cols-1 gap-3 pb-3 sm:grid-cols-2 xl:grid-cols-4">
                <SelectField
                  id="contact-project-filter"
                  label="Project"
                  value={filters.projectId}
                  onChange={(value) => changeFilter("projectId", value)}
                  options={[
                    { value: "all", label: "All projects" },
                    { value: "unassigned", label: "Unassigned" },
                    ...projects.map((project) => ({ value: project.id, label: project.name })),
                  ]}
                />
                <SelectField
                  id="contact-detail-filter"
                  label="Contact details"
                  value={filters.contactability}
                  onChange={(value) => changeFilter("contactability", value as ContactSearchFilters["contactability"])}
                  options={Object.entries(contactabilityNames).map(([value, label]) => ({ value, label }))}
                />
                <SelectField
                  id="contact-activity-filter"
                  label="Last activity"
                  value={filters.activity}
                  onChange={(value) => changeFilter("activity", value as ContactSearchFilters["activity"])}
                  options={Object.entries(activityNames).map(([value, label]) => ({ value, label }))}
                />
                <SelectField
                  id="contact-sort-filter"
                  label="Sort by"
                  value={filters.sort}
                  onChange={(value) => changeFilter("sort", value as ContactSearchFilters["sort"])}
                  options={Object.entries(sortNames).map(([value, label]) => ({ value, label }))}
                />
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {(activeFilters.length > 0 || filters.sort !== "recent") && (
          <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
            {activeFilters.map((item) => (
              <Button
                type="button"
                key={item.key}
                variant="outline"
                size="sm"
                onClick={() => clearOneFilter(item.key)}
                aria-label={"Remove " + item.label + " filter"}
                className="h-7 rounded-full px-2.5 text-xs"
              >
                {item.label}
                <X aria-hidden="true" />
              </Button>
            ))}
            {filters.sort !== "recent" && (
              <Button type="button" variant="outline" size="sm" onClick={() => changeFilter("sort", "recent")} className="h-7 rounded-full px-2.5 text-xs">
                Sort: {sortNames[filters.sort]}
                <X aria-hidden="true" />
              </Button>
            )}
            <Button type="button" variant="link" size="sm" onClick={clearFilters} className="h-7 px-1">
              Clear filters
            </Button>
          </div>
        )}
      </CardContent>
    </Card>

    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          {hasLoaded ? total + (total === 1 ? " result" : " results") : "Finding contacts"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {total > 0 && contacts.length ? "Showing " + (filters.offset + 1) + "–" + (filters.offset + contacts.length) + " of " + total : "Workspace-private records"}
        </p>
      </div>
      <div className="flex flex-wrap gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={() => changeFilter("contactability", "missing_email")}>Needs email</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => changeFilter("contactability", "no_direct")}>No direct contact</Button>
      </div>
    </div>

    {notice && (
      <div role="status" className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300">
        {notice}
      </div>
    )}
    {loadError && (
      <div role="alert" className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
        <span>{loadError}</span>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()}>Retry search</Button>
      </div>
    )}
    {loading && hasLoaded && <p className="sr-only" role="status">Updating results…</p>}

    <Card aria-label="Contact results" aria-busy={loading} className="overflow-hidden border-border/80 shadow-sm">
      <CardHeader className="border-b border-border/70 py-3">
        <CardTitle className="text-sm">Results</CardTitle>
        <CardDescription>Choose a person to review their record and source history.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="grid min-w-0 md:grid-cols-[minmax(17rem,0.8fr)_minmax(0,1.2fr)]">
          <div role="list" aria-label="Matching contacts" className="min-w-0 divide-y divide-border/70 md:max-h-[620px] md:overflow-y-auto">
            {!hasLoaded && loading ? (
              <div className="space-y-2 p-3" role="status">
                <span className="sr-only">Loading contacts…</span>
                {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-[78px] w-full rounded-xl" />)}
              </div>
            ) : !hasLoaded && loadError ? (
              <Empty className="min-h-72 rounded-none border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon"><UsersRound aria-hidden="true" /></EmptyMedia>
                  <EmptyTitle>Contacts could not load</EmptyTitle>
                  <EmptyDescription>Retry the private workspace search. No records were changed.</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button type="button" variant="outline" size="sm" onClick={() => void load()}>Retry search</Button>
                </EmptyContent>
              </Empty>
            ) : contacts.length ? contacts.map((contact) => (
              <div role="listitem" key={contact.id} className="p-2">
                <Button
                  type="button"
                  variant="ghost"
                  aria-pressed={selectedId === contact.id}
                  onClick={() => chooseContact(contact.id)}
                  className={"h-auto w-full justify-start whitespace-normal rounded-xl border px-3 py-3 text-left text-foreground " + (selectedId === contact.id ? "border-primary/20 bg-primary/5" : "border-transparent hover:border-border/70 hover:bg-muted/40")}
                >
                  <span className="grid w-full min-w-0 gap-2.5">
                    <span className="flex min-w-0 items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{contact.full_name}</span>
                        <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
                          {[contact.job_title, contact.company].filter(Boolean).join(" · ") || "No company recorded"}
                        </span>
                      </span>
                      <StatusBadge status={contact.status} />
                    </span>
                    <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs font-normal text-muted-foreground">
                      <span className="flex min-w-0 items-center gap-1.5 truncate">
                        <Building2 aria-hidden="true" className="size-3.5 shrink-0" />
                        {projectNames[contact.project_id || ""] || "Unassigned"}
                        <span aria-hidden="true">·</span>
                        {contact.email ? "Email" : "No email"}
                        <span aria-hidden="true">·</span>
                        {contact.phone ? "Phone" : "No phone"}
                      </span>
                      <time className="shrink-0" dateTime={contact.last_seen_at}>{formattedDate(contact.last_seen_at)}</time>
                    </span>
                  </span>
                </Button>
              </div>
            )) : (
              <Empty className="min-h-72 rounded-none border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon"><UserRound aria-hidden="true" /></EmptyMedia>
                  <EmptyTitle>{activeFilters.length ? "No matching contacts" : "No contacts yet"}</EmptyTitle>
                  <EmptyDescription>
                    {activeFilters.length ? "Remove a filter or change the search to see more people." : "Add a confirmed person or import an approved CSV to begin."}
                  </EmptyDescription>
                </EmptyHeader>
                {activeFilters.length > 0 && (
                  <EmptyContent>
                    <Button type="button" variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>
                  </EmptyContent>
                )}
              </Empty>
            )}
          </div>

          <div className="hidden min-w-0 border-l border-border/70 md:block" aria-label="Contact details">
            {selected && !mobileDetailOpen ? (
              <ContactDetail
                key={selected.id + ":" + selected.updated_at}
                contact={selected}
                projectName={projectNames[selected.project_id || ""] || "Unassigned"}
                busy={busy}
                command={command}
                onSaved={() => afterWrite()}
                onNotice={setNotice}
              />
            ) : (
              <Empty className="min-h-72 h-full border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon"><UserRound aria-hidden="true" /></EmptyMedia>
                  <EmptyTitle>Choose a contact</EmptyTitle>
                  <EmptyDescription>Review notes, update status, record a verified interaction, and inspect the source trail.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col gap-3 border-t border-border/70 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm text-muted-foreground">
          {total > 0 && contacts.length ? (filters.offset + 1) + "–" + (filters.offset + contacts.length) + " of " + total : total + " results"}
        </span>
        <div className="flex w-full items-center justify-between gap-2 sm:w-auto">
          <Button type="button" variant="outline" size="sm" disabled={filters.offset === 0 || loading} onClick={() => changePage(Math.max(0, filters.offset - 50))}>
            Previous
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={nextOffset === null || loading} onClick={() => { if (nextOffset !== null) changePage(nextOffset); }}>
            Next
            <ArrowUpRight aria-hidden="true" className="rotate-45" />
          </Button>
        </div>
      </CardFooter>
    </Card>

    <Accordion className="grid gap-3 lg:grid-cols-2">
      <AccordionItem value="add-contact" className="rounded-xl border border-border/80 bg-card px-4 shadow-sm sm:px-5">
        <AccordionTrigger className="py-4 hover:no-underline">
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><UserRound aria-hidden="true" className="size-4" /></span>
            <span className="min-w-0 text-left">
              <span className="block text-sm font-semibold">Add a contact</span>
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">Save one observed person with its source.</span>
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent className="pb-4">
          <form className="space-y-4" onSubmit={(event) => { void addContact(event).catch(() => {}); }}>
            <FieldGroup className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
              <TextField id="new-contact-name" label="Name" name="fullName" placeholder="Full name" minLength={2} maxLength={160} required />
              <TextField id="new-contact-email" label="Email" name="email" type="email" maxLength={254} />
              <TextField id="new-contact-phone" label="Phone" name="phone" type="tel" maxLength={60} />
              <TextField id="new-contact-company" label="Company" name="company" maxLength={160} />
              <SelectField
                id="new-contact-project"
                label="Project"
                name="projectId"
                defaultValue="__no_project__"
                options={[{ value: "__no_project__", label: "No project" }, ...projects.map((project) => ({ value: project.id, label: project.name }))]}
              />
              <TextField id="new-contact-source" label="Source" name="sourceLabel" minLength={2} maxLength={180} placeholder="Where this detail was observed" required />
              <TextField id="new-contact-source-url" label="Source URL" name="sourceUrl" type="url" maxLength={2000} fieldClassName="sm:col-span-2" />
              <TextareaField
                id="new-contact-notes"
                label="Notes"
                name="notes"
                rows={2}
                maxLength={5000}
                placeholder="Concise context, not a private transcript"
                fieldClassName="sm:col-span-2"
              />
            </FieldGroup>
            <div className="flex justify-end">
              <Button type="submit" disabled={busy}><UserRound aria-hidden="true" />Save contact</Button>
            </div>
          </form>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="import-contacts" className="rounded-xl border border-border/80 bg-card px-4 shadow-sm sm:px-5">
        <AccordionTrigger className="py-4 hover:no-underline">
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground"><FileUp aria-hidden="true" className="size-4" /></span>
            <span className="min-w-0 text-left">
              <span className="block text-sm font-semibold">Import a CSV</span>
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">Deduplicate an approved list and retain its source.</span>
            </span>
          </span>
        </AccordionTrigger>
        <AccordionContent className="pb-4">
          <form className="space-y-4" onSubmit={(event) => { void importCsv(event); }}>
            <FieldGroup className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
              <TextField
                id="contacts-import-file"
                label="CSV file"
                type="file"
                accept=".csv,text/csv"
                required
                help={file?.name || "Choose a CSV file to review and import."}
                onChange={(event) => { setFile(event.target.files?.[0] || null); importAttempt.current = null; }}
              />
              <TextField id="contacts-import-source" label="Source label" name="sourceLabel" defaultValue="CSV import" minLength={2} maxLength={180} required />
              <SelectField
                id="contacts-import-project"
                label="Project"
                name="projectId"
                defaultValue="__no_project__"
                options={[{ value: "__no_project__", label: "No project" }, ...projects.map((project) => ({ value: project.id, label: project.name }))]}
              />
            </FieldGroup>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-muted-foreground">Stoic maps columns, deduplicates contacts, and records the import source.</p>
              <Button type="submit" variant="outline" disabled={!file || importing}>
                <FileUp aria-hidden="true" className={importing ? "animate-pulse" : ""} />
                {importing ? "Importing…" : "Review and import"}
              </Button>
            </div>
            {importMessage && <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm" role="status">{importMessage}</p>}
          </form>
        </AccordionContent>
      </AccordionItem>
    </Accordion>

    <Sheet open={mobileDetailOpen} onOpenChange={setMobileDetailOpen}>
      <SheetContent side="bottom" className="h-[92dvh] max-h-[92dvh] w-full gap-0 overflow-hidden rounded-t-2xl border-x-0 border-b-0 p-0 sm:max-w-none md:hidden">
        <SheetHeader className="border-b border-border/70 px-5 py-4">
          <SheetTitle>Contact details</SheetTitle>
          <SheetDescription>Review the record and its verified source history.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {selected && mobileDetailOpen && (
            <ContactDetail
              key={selected.id + ":" + selected.updated_at}
              contact={selected}
              projectName={projectNames[selected.project_id || ""] || "Unassigned"}
              busy={busy}
              command={command}
              onSaved={() => afterWrite()}
              onNotice={setNotice}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  </div>;
}

function ContactDetail({ contact, projectName, busy, command, onSaved, onNotice }: {
  contact: Contact; projectName: string; busy: boolean; command: Command; onSaved: () => Promise<void>; onNotice: (message: string) => void;
}) {
  const [status, setStatus] = useState(contact.status);
  const [notes, setNotes] = useState(contact.notes);
  const [sources, setSources] = useState<ContactSource[] | null>(null);
  const [sourceTotal, setSourceTotal] = useState(0);
  const [nextSourceOffset, setNextSourceOffset] = useState<number | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState("");
  const linkAttempt = useRef<{ fingerprint: string; key: string } | null>(null);

  async function loadSources(offset: number) {
    setSourceLoading(true);
    setSourceError("");
    try {
      const query = new URLSearchParams({ sourcesFor: contact.id, offset: String(offset) });
      const result = await jsonResponse(await fetch(`/api/contacts?${query}`, { cache: "no-store" })) as { sources: ContactSource[]; total: number; nextOffset: number | null };
      setSources((previous) => offset === 0 ? result.sources : [...(previous || []), ...result.sources]);
      setSourceTotal(result.total);
      setNextSourceOffset(result.nextOffset);
    } catch (cause) {
      setSourceError(cause instanceof Error ? cause.message : "Could not load source history.");
    } finally {
      setSourceLoading(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await command("update_contact", { contactId: contact.id, status, notes });
    onNotice(`Changes saved for ${contact.full_name}.`);
    await onSaved();
  }

  async function link(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const payload = {
      contactId: contact.id, sourceLabel: String(form.get("sourceLabel") || "").trim(),
      sourceUrl: String(form.get("sourceUrl") || "").trim() || null,
      notes: String(form.get("notes") || "").trim(),
      email: String(form.get("email") || "").trim() || null,
      phone: String(form.get("phone") || "").trim() || null,
      company: String(form.get("company") || "").trim() || null,
    };
    const fingerprint = JSON.stringify(payload);
    if (linkAttempt.current?.fingerprint !== fingerprint) linkAttempt.current = { fingerprint, key: crypto.randomUUID() };
    const result = await command("link_contact", { ...payload, idempotencyKey: linkAttempt.current.key }) as { alreadyLinked: boolean };
    onNotice(result.alreadyLinked ? "This source was already recorded." : `Interaction linked to ${contact.full_name}.`);
    linkAttempt.current = null;
    element.reset();
    await onSaved();
  }

  async function openArtifact(id: string) {
    const result = await command("artifact_download", { artifactId: id }) as { downloadUrl: string };
    window.open(result.downloadUrl, "_blank", "noopener,noreferrer");
  }

  const visibleSources = sources || contact.sources;

  return <div className="space-y-5 p-4 sm:p-5">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <Badge variant="outline" className="mb-2 border-primary/20 bg-primary/5 text-primary">Contact record</Badge>
        <h2 className="break-words text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{contact.full_name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {[contact.job_title, contact.company].filter(Boolean).join(" · ") || "No company recorded"}
        </p>
      </div>
      <StatusBadge status={contact.status} />
    </div>

    <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/70 bg-muted/20 p-3 sm:grid-cols-3">
      <div className="min-w-0">
        <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Project</span>
        <strong className="mt-1 block truncate text-sm font-medium text-foreground">{projectName}</strong>
      </div>
      <div className="min-w-0">
        <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Added</span>
        <strong className="mt-1 block text-sm font-medium text-foreground">{formattedDate(contact.created_at)}</strong>
      </div>
      <div className="col-span-2 min-w-0 sm:col-span-1">
        <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Last interaction</span>
        <strong className="mt-1 block text-sm font-medium text-foreground">{formattedDate(contact.last_seen_at)}</strong>
      </div>
    </div>

    <div className="grid gap-2 sm:grid-cols-2">
      <div className="flex min-w-0 items-start gap-3 rounded-xl border border-border/70 p-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Mail aria-hidden="true" className="size-4" /></span>
        <div className="min-w-0">
          <span className="block text-xs font-medium text-muted-foreground">Email</span>
          {contact.email ? (
            <Button render={<a href={"mailto:" + contact.email} />} variant="link" size="sm" className="h-auto max-w-full justify-start break-all px-0 py-0 text-left">
              {contact.email}
            </Button>
          ) : <span className="mt-1 block text-sm text-muted-foreground">Not recorded</span>}
        </div>
      </div>
      <div className="flex min-w-0 items-start gap-3 rounded-xl border border-border/70 p-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Phone aria-hidden="true" className="size-4" /></span>
        <div className="min-w-0">
          <span className="block text-xs font-medium text-muted-foreground">Phone</span>
          {contact.phone ? (
            <Button render={<a href={"tel:" + contact.phone} />} variant="link" size="sm" className="h-auto max-w-full justify-start break-all px-0 py-0 text-left">
              {contact.phone}
            </Button>
          ) : <span className="mt-1 block text-sm text-muted-foreground">Not recorded</span>}
        </div>
      </div>
    </div>

    <Separator />

    <form className="space-y-4 rounded-xl border border-border/80 p-4" onSubmit={(event) => { void save(event).catch(() => {}); }}>
      <div>
        <h3 className="text-sm font-semibold text-foreground">Working record</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Keep a concise status and useful context for the next interaction.</p>
      </div>
      <SelectField
        id={"contact-status-" + contact.id}
        label="Status"
        value={status}
        onChange={(value) => setStatus(value as Contact["status"])}
        options={CONTACT_STATUSES.map((item) => ({ value: item, label: statusNames[item] }))}
      />
      <TextareaField
        id={"contact-notes-" + contact.id}
        label="Working notes"
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        rows={3}
        maxLength={10000}
        placeholder="Useful context, not a raw conversation"
      />
      <div className="flex justify-end">
        <Button type="submit" variant="outline" disabled={busy || (status === contact.status && notes === contact.notes)}>
          Save changes
        </Button>
      </div>
    </form>

    <Accordion multiple className="rounded-xl border border-border/80 px-4">
      <AccordionItem value="link-interaction">
        <AccordionTrigger className="gap-3 py-3 hover:no-underline">
          <span className="flex items-center gap-2"><Link2 aria-hidden="true" className="size-4 text-muted-foreground" />Link a verified interaction</span>
        </AccordionTrigger>
        <AccordionContent className="pb-4">
          <form className="space-y-4" onSubmit={(event) => { void link(event).catch(() => {}); }}>
            <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField id={"contact-source-label-" + contact.id} label="Source and date" name="sourceLabel" minLength={2} maxLength={180} placeholder="Email, Oct 3" required />
              <TextField id={"contact-source-url-" + contact.id} label="Safe source URL" name="sourceUrl" type="url" maxLength={2000} placeholder="https://…" />
              <TextareaField id={"contact-link-notes-" + contact.id} label="What happened" name="notes" maxLength={5000} rows={2} placeholder="Short factual note, not a transcript" fieldClassName="sm:col-span-2" />
              {!contact.email && <TextField id={"contact-link-email-" + contact.id} label="Confirmed email" name="email" type="email" maxLength={254} />}
              {!contact.phone && <TextField id={"contact-link-phone-" + contact.id} label="Confirmed phone" name="phone" type="tel" maxLength={60} />}
              {!contact.company && <TextField id={"contact-link-company-" + contact.id} label="Confirmed company" name="company" maxLength={160} />}
            </FieldGroup>
            <div className="flex justify-end">
              <Button type="submit" disabled={busy}><Link2 aria-hidden="true" />Link interaction</Button>
            </div>
          </form>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem
        value="source-history"
        onOpenChange={(open) => { if (open && sources === null && !sourceLoading) void loadSources(0); }}
      >
        <AccordionTrigger className="gap-3 py-3 hover:no-underline">
          <span className="flex items-center gap-2"><History aria-hidden="true" className="size-4 text-muted-foreground" />Source history</span>
          {sources !== null && <Badge variant="secondary">{sourceTotal}</Badge>}
        </AccordionTrigger>
        <AccordionContent className="pb-4">
          <div className="space-y-3">
            {sourceError && (
              <div role="alert" className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
                <span>{sourceError}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => void loadSources(0)}>Retry history</Button>
              </div>
            )}
            {sourceLoading && sources === null && (
              <div className="space-y-2" role="status">
                <span className="sr-only">Loading source history…</span>
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-5/6" />
              </div>
            )}
            {visibleSources.length ? (
              <ol className="space-y-4 border-l border-border/80 pl-4">
                {visibleSources.map((source) => (
                  <li key={source.id} className="relative space-y-1.5">
                    <span aria-hidden="true" className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-background bg-primary" />
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <strong className="text-sm font-medium text-foreground">{source.source_label}</strong>
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarDays aria-hidden="true" className="size-3.5" />
                        <time dateTime={source.created_at}>{formattedDate(source.created_at)}</time>
                      </span>
                    </div>
                    {source.notes && <p className="text-sm leading-5 text-muted-foreground">{source.notes}</p>}
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {source.source_url && (
                        <Button render={<a href={source.source_url} target="_blank" rel="noopener noreferrer" />} variant="link" size="sm" className="h-auto justify-start px-0 py-0">
                          Open source <ArrowUpRight aria-hidden="true" />
                        </Button>
                      )}
                      {source.artifact_id && (
                        <Button type="button" variant="link" size="sm" className="h-auto justify-start px-0 py-0" onClick={() => { void openArtifact(source.artifact_id!).catch(() => {}); }}>
                          Open artifact <ArrowUpRight aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            ) : !sourceLoading && <p className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">No sources recorded.</p>}
            {nextSourceOffset !== null && (
              <Button type="button" variant="outline" size="sm" disabled={sourceLoading} onClick={() => void loadSources(nextSourceOffset)}>
                Load more history
              </Button>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  </div>;
}
