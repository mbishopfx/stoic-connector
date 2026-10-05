import { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BookOpen, Bot, CreditCard, Folder, LayoutDashboard, Lightbulb, ListTodo,
  MessageSquare, MessageSquareText, Moon, Paperclip, RefreshCw, Sun, Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { App, PostMessageTransport } from "@modelcontextprotocol/ext-apps";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { AssistantTab } from "./tabs/assistant-tab";
import { ContactsTab, IdeasTab, PromptsTab, BillingTab } from "./tabs/other-tabs";
import { AgentsTab, FilesTab, KnowledgeTab, ProjectsTab } from "./tabs/team-tabs";
import { BoardTab, HandoffsTab, OverviewTab } from "./tabs/work-tabs";
import { navSections, type McpRuntime, type NavTab, type TeamContext } from "./ui-contract";

const app = new App({ name: "Stoic Connector", version: "0.2.0" });
let connectPromise: Promise<void> | null = null;

const tabIcons: Record<NavTab, LucideIcon> = {
  assistant: MessageSquareText,
  ideas: Lightbulb,
  overview: LayoutDashboard,
  handoffs: ListTodo,
  board: MessageSquare,
  contacts: Users,
  projects: Folder,
  agents: Bot,
  prompts: BookOpen,
  knowledge: BookOpen,
  files: Paperclip,
  billing: CreditCard,
};
const navItems = navSections.flatMap((section) => section.items);

type ThemeMode = "system" | "light" | "dark";
type Accent = "forest" | "slate" | "ocean" | "clay";
type Density = "comfortable" | "compact";
type Corners = "soft" | "crisp";
type Appearance = { accent: Accent; density: Density; corners: Corners };
type Notice = { text: string; tone: "success" | "error" } | null;

function readThemeMode(): ThemeMode {
  try {
    const saved = localStorage.getItem("stoic-theme");
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
    const legacy = localStorage.getItem("stoic-widget-theme");
    if (legacy === "light" || legacy === "dark") return legacy;
  } catch { /* Use the host/device setting when storage is unavailable. */ }
  return "system";
}

function readAppearance(): Appearance {
  const fallback: Appearance = { accent: "forest", density: "comfortable", corners: "soft" };
  try {
    const saved = JSON.parse(localStorage.getItem("stoic-appearance") || "null") as Partial<Appearance> | null;
    if (!saved) return fallback;
    return {
      accent: ["forest", "slate", "ocean", "clay"].includes(String(saved.accent)) ? saved.accent as Accent : fallback.accent,
      density: ["comfortable", "compact"].includes(String(saved.density)) ? saved.density as Density : fallback.density,
      corners: ["soft", "crisp"].includes(String(saved.corners)) ? saved.corners as Corners : fallback.corners,
    };
  } catch { return fallback; }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Stoic could not complete that request.";
}

async function callTool<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const result = await app.callServerTool({ name, arguments: args });
  const text = result.content.find((item) => item.type === "text")?.text || "{}";
  let value: unknown;
  try { value = result.structuredContent ?? JSON.parse(text); }
  catch { value = { error: text }; }
  if (result.isError || (value && typeof value === "object" && "error" in value)) {
    throw new Error(value && typeof value === "object" && "error" in value ? String(value.error) : "Stoic could not complete that request.");
  }
  return value as T;
}

function AppearanceSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      <Select value={value} onValueChange={(next) => { if (next) onChange(next); }}>
        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map((option) => <SelectItem value={option.value} key={option.value}>{option.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

function AppRoot() {
  const [context, setContext] = useState<TeamContext | null>(null);
  const [projectId, setProjectId] = useState("");
  const [tab, setTab] = useState<NavTab>("assistant");
  const [connection, setConnection] = useState<"connecting" | "connected" | "error">("connecting");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [inboxCount, setInboxCount] = useState(0);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(readThemeMode);
  const [appearance, setAppearance] = useState<Appearance>(readAppearance);
  const [hostTheme, setHostTheme] = useState<"light" | "dark" | null>(() => {
    const theme = app.getHostContext()?.theme;
    return theme === "light" || theme === "dark" ? theme : null;
  });
  const [deviceTheme, setDeviceTheme] = useState<"light" | "dark">(() => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

  const resolvedTheme = themeMode === "system" ? hostTheme || deviceTheme : themeMode;
  const currentTab = navItems.find((item) => item.id === tab);

  const notify = useCallback((text: string, tone: "success" | "error" = "error") => {
    setNotice({ text, tone });
    window.setTimeout(() => setNotice((current) => current?.text === text ? null : current), 6500);
  }, []);

  const refreshContext = useCallback(async () => {
    setLoading(true);
    try {
      const [nextContext, inbox] = await Promise.all([
        callTool<TeamContext>("get_team_context"),
        callTool<{ handoffs?: unknown[] }>("check_inbox", { offset: 0 }),
      ]);
      setContext(nextContext);
      setProjectId((current) => nextContext.projects.some((project) => project.id === current) ? current : nextContext.projects[0]?.id || "");
      setInboxCount(inbox.handoffs?.length || 0);
      setConnection("connected");
      setNotice(null);
    } catch (error) {
      setConnection("error");
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const runtime = useMemo<McpRuntime>(() => ({
    callTool,
    openLink: async (url) => { await app.openLink({ url }); },
    notify,
    refreshContext,
    selectProject: (nextProjectId) => setProjectId(nextProjectId),
  }), [notify, refreshContext]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateDeviceTheme = () => setDeviceTheme(media.matches ? "dark" : "light");
    media.addEventListener("change", updateDeviceTheme);
    app.onhostcontextchanged = (next) => {
      if (next.theme === "light" || next.theme === "dark") setHostTheme(next.theme);
      else setHostTheme(null);
    };
    if (!connectPromise) connectPromise = app.connect(new PostMessageTransport(window.parent, window.parent));
    let active = true;
    void connectPromise.then(() => {
      if (!active) return;
      const host = app.getHostContext()?.theme;
      setHostTheme(host === "light" || host === "dark" ? host : null);
      setConnection("connected");
      return refreshContext().catch((error) => notify(errorMessage(error), "error"));
    }).catch((error) => {
      if (!active) return;
      setConnection("error");
      setLoading(false);
      notify(errorMessage(error), "error");
    });
    return () => { active = false; media.removeEventListener("change", updateDeviceTheme); };
  }, [notify, refreshContext]);

  useEffect(() => {
    try { localStorage.setItem("stoic-appearance", JSON.stringify(appearance)); } catch { /* Keep settings for this session. */ }
  }, [appearance]);

  useEffect(() => {
    function syncStorage(event: StorageEvent) {
      if (event.key === "stoic-appearance") setAppearance(readAppearance());
      if (event.key === "stoic-theme" || event.key === "stoic-widget-theme") setThemeMode(readThemeMode());
    }
    window.addEventListener("storage", syncStorage);
    return () => window.removeEventListener("storage", syncStorage);
  }, []);

  function changeTheme(next: string) {
    if (next !== "system" && next !== "light" && next !== "dark") return;
    const mode = next as ThemeMode;
    setThemeMode(mode);
    try {
      localStorage.setItem("stoic-theme", mode);
      if (mode === "system") localStorage.removeItem("stoic-widget-theme");
      else localStorage.setItem("stoic-widget-theme", mode);
    } catch { /* The choice remains active until this widget closes. */ }
  }

  function changeAppearance<K extends keyof Appearance>(key: K, value: Appearance[K]) {
    setAppearance((current) => ({ ...current, [key]: value }));
  }

  let view = null;
  if (context) {
    const props = { context, projectId, runtime };
    switch (tab) {
      case "assistant": view = null; break;
      case "ideas": view = <IdeasTab {...props} />; break;
      case "overview": view = <OverviewTab {...props} />; break;
      case "handoffs": view = <HandoffsTab {...props} />; break;
      case "board": view = <BoardTab {...props} />; break;
      case "contacts": view = <ContactsTab {...props} />; break;
      case "projects": view = <ProjectsTab {...props} />; break;
      case "agents": view = <AgentsTab {...props} />; break;
      case "prompts": view = <PromptsTab {...props} />; break;
      case "knowledge": view = <KnowledgeTab {...props} />; break;
      case "files": view = <FilesTab {...props} />; break;
      case "billing": view = <BillingTab {...props} />; break;
    }
  }

  const dark = resolvedTheme === "dark";

  useEffect(() => {
    const documentRoot = document.documentElement;
    documentRoot.classList.toggle("dark", dark);
    documentRoot.dataset.accent = appearance.accent;
    documentRoot.dataset.density = appearance.density;
    documentRoot.dataset.corners = appearance.corners;
    return () => {
      documentRoot.classList.remove("dark");
      delete documentRoot.dataset.accent;
      delete documentRoot.dataset.density;
      delete documentRoot.dataset.corners;
    };
  }, [appearance.accent, appearance.corners, appearance.density, dark]);

  return (
    <div id="stoic-app" data-component-system="shadcn" data-accent={appearance.accent} data-density={appearance.density} data-corners={appearance.corners} data-theme={resolvedTheme} className={`mcp-widget-shell flex w-full overflow-hidden border bg-background text-foreground ${dark ? "dark" : ""}`}>
      <aside className="mcp-rail flex w-[4.25rem] shrink-0 flex-col items-center border-r bg-background">
        <div className="grid h-14 w-full shrink-0 place-items-center border-b">
          <Avatar className="size-8 rounded-lg">
            <AvatarImage src={new URL("./stoic-connector-directory-icon.png", import.meta.url).toString()} alt="Stoic Connector" />
            <AvatarFallback className="text-[10px]">SC</AvatarFallback>
          </Avatar>
        </div>
        <div className="my-3 grid size-9 shrink-0 place-items-center rounded-xl border bg-card text-sm font-semibold" title={context?.workspace.name || "Workspace"}>
          {context?.workspace.name.slice(0, 1).toUpperCase() || "S"}
        </div>
        <Separator className="mx-auto w-8 shrink-0" />
        <ScrollArea className="mcp-nav-scroll min-h-0 flex-1 w-full px-2 py-2">
          <nav aria-label="Stoic workspace sections" className="grid gap-2">
            {navSections.map((section) => <div role="group" aria-label={section.label} className="grid justify-items-center gap-1" key={section.label}>
              {section.items.map((item) => {
                const Icon = tabIcons[item.id];
                return <Button
                  key={item.id}
                  type="button"
                  variant={tab === item.id ? "secondary" : "ghost"}
                  size="icon-lg"
                  className="relative size-10"
                  aria-label={item.label}
                  aria-current={tab === item.id ? "page" : undefined}
                  title={item.label}
                  onClick={() => setTab(item.id)}
                >
                  <Icon />
                  {item.id === "handoffs" && inboxCount > 0 && <span className="absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full border border-background bg-primary px-1 text-[9px] leading-4 text-primary-foreground">{Math.min(inboxCount, 99)}</span>}
                </Button>;
              })}
              {section.label !== "ACCOUNT" && <Separator className="mt-1 w-7" />}
            </div>)}
          </nav>
        </ScrollArea>
        <div className="grid w-full shrink-0 place-items-center border-t py-3">
          <Avatar className="size-8 border"><AvatarImage src={new URL("./stoic-connector-directory-icon.png", import.meta.url).toString()} alt="Stoic Connector" /><AvatarFallback className="text-[10px]">{context?.self.role.slice(0, 1).toUpperCase() || "A"}</AvatarFallback></Avatar>
        </div>
      </aside>

      <section className="mcp-widget-main flex min-w-0 flex-1 flex-col">
        <header className="mcp-widget-header flex min-h-14 shrink-0 items-center justify-between gap-2 border-b bg-background px-4">
          <div className="hidden min-w-0 items-center gap-2 md:flex">
            <span className="truncate text-xs text-muted-foreground">{context?.workspace.name || "Stoic workspace"}</span>
            <span className="text-muted-foreground/60">/</span>
            <span className="truncate text-sm font-medium">{currentTab?.label || "Stoic"}</span>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <Select value={tab} onValueChange={(value) => { if (value) setTab(value as NavTab); }}>
              <SelectTrigger className="w-[8.5rem] shrink-0 sm:w-40" aria-label="Navigate to tab"><SelectValue /></SelectTrigger>
              <SelectContent align="end" className="max-h-[min(70vh,28rem)]">
                {navSections.map((section) => <SelectGroup key={section.label}>
                  <SelectLabel>{section.label}</SelectLabel>
                  {section.items.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}
                </SelectGroup>)}
              </SelectContent>
            </Select>
            <Select value={projectId || undefined} onValueChange={(value) => { if (value) setProjectId(value); }} disabled={!context?.projects.length}>
              <SelectTrigger className="mcp-project-picker flex w-[6.5rem] shrink-0 sm:w-40" aria-label="Current project"><SelectValue placeholder="Choose project" /></SelectTrigger>
              <SelectContent align="end">
                {context?.projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="hidden items-center gap-2 text-xs text-muted-foreground lg:flex" role="status">
              <span className={`size-2 rounded-full ${connection === "connected" ? "bg-emerald-600" : connection === "error" ? "bg-destructive" : "bg-amber-500"}`} />
              {connection === "connected" ? `Connected · ${context?.self.role || "agent"}` : connection === "error" ? "Needs attention" : "Connecting"}
            </div>
            <Button variant="ghost" size="icon" aria-label="Refresh Stoic workspace" title="Refresh workspace" onClick={() => void refreshContext().catch((error) => notify(errorMessage(error), "error"))} disabled={loading}>
              <RefreshCw className={loading ? "animate-spin" : ""} />
            </Button>
            <Button variant="outline" size="icon" aria-label="Customize appearance" title="Customize appearance" onClick={() => setAppearanceOpen(true)}>
              {dark ? <Moon /> : <Sun />}
            </Button>
          </div>
        </header>

        {notice && <div className="px-4 pt-3 sm:px-6">
          <Alert variant={notice.tone === "error" ? "destructive" : "default"}>
            <AlertTitle>{notice.tone === "error" ? "Action needs attention" : "Saved"}</AlertTitle>
            <AlertDescription>{notice.text}</AlertDescription>
          </Alert>
        </div>}

        <main className="mcp-widget-content flex-1 p-4 sm:p-6">
          <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-4">
            {loading && !context ? <div className="grid gap-3" aria-label="Loading Stoic workspace"><Skeleton className="h-24 w-full" /><Skeleton className="h-56 w-full" /></div> : null}
            {!loading && !context ? <Alert variant="destructive"><AlertTitle>Could not connect</AlertTitle><AlertDescription>Reconnect Stoic or refresh this workspace to try again.</AlertDescription><Button variant="outline" size="sm" className="mt-3 w-fit" onClick={() => void refreshContext().catch((error) => notify(errorMessage(error), "error"))}>Try again</Button></Alert> : null}
            {context && <div className={tab === "assistant" ? "contents" : "hidden"}><AssistantTab context={context} projectId={projectId} runtime={runtime} /></div>}
            {context && tab !== "assistant" && view}
          </div>
        </main>
      </section>

      <Sheet open={appearanceOpen} onOpenChange={setAppearanceOpen}>
        <SheetContent side="right" className="w-[min(22rem,88vw)] overflow-y-auto">
          <SheetHeader className="px-0">
            <SheetTitle>Customize appearance</SheetTitle>
            <SheetDescription>These settings are saved in this browser profile and apply to the Stoic workspace.</SheetDescription>
          </SheetHeader>
          <div className="grid gap-5 px-4 pb-5">
            <AppearanceSelect label="Theme" value={themeMode} onChange={changeTheme} options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
            <AppearanceSelect label="Accent color" value={appearance.accent} onChange={(value) => changeAppearance("accent", value as Accent)} options={[{ value: "forest", label: "Forest" }, { value: "slate", label: "Slate" }, { value: "ocean", label: "Ocean" }, { value: "clay", label: "Clay" }]} />
            <AppearanceSelect label="Spacing" value={appearance.density} onChange={(value) => changeAppearance("density", value as Density)} options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]} />
            <AppearanceSelect label="Corners" value={appearance.corners} onChange={(value) => changeAppearance("corners", value as Corners)} options={[{ value: "soft", label: "Soft" }, { value: "crisp", label: "Crisp" }]} />
            <Separator />
            <p className="text-xs leading-5 text-muted-foreground">System mode follows the host theme when available, then your device setting.</p>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

const rootElement = document.getElementById("stoic-root");
if (!rootElement) throw new Error("Stoic widget root was not found.");
createRoot(rootElement).render(<AppRoot />);
