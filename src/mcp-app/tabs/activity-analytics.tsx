"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ActivityAnalytics, ActivityMetrics } from "../ui-contract";

const activityChartConfig = {
  mcpToolCalls: { label: "MCP calls", color: "var(--chart-1)" },
  agentTaskEvents: { label: "Agent task updates", color: "var(--chart-2)" },
  agentBoardMessages: { label: "Agent messages", color: "var(--chart-4)" },
  auditActions: { label: "Audit actions", color: "var(--chart-3)" },
} satisfies ChartConfig;

function formatActivityDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function formatActivityWindow(windowStart: string, windowEnd: string) {
  const start = new Date(windowStart);
  const end = new Date(windowEnd);
  const date = start.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  const startTime = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
  const endDate = end.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  const endTime = end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
  return `${date}, ${startTime}–${endDate === date ? endTime : `${endDate}, ${endTime}`} UTC`;
}

function StatCard({ label, value, detail }: { label: string; value: number | undefined; detail: string }) {
  return <Card size="sm">
    <CardHeader><CardDescription>{label}</CardDescription></CardHeader>
    <CardContent>
      <p className="text-3xl font-semibold tabular-nums">{value == null ? "—" : value.toLocaleString()}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </CardContent>
  </Card>;
}

function ActivityStats({ metrics }: { metrics: ActivityMetrics | null }) {
  const items = [
    { label: "Agents active", value: metrics?.activeAgents, detail: "Agents seen in Stoic events" },
    { label: "Agent task updates", value: metrics?.agentTaskEvents, detail: `of ${metrics?.taskEvents ?? "—"} task events` },
    { label: "Agent messages", value: metrics?.agentBoardMessages, detail: `of ${metrics?.boardMessages ?? "—"} shared messages` },
    { label: "Audit actions", value: metrics?.auditActions, detail: "Workspace audit records" },
    { label: "MCP calls", value: metrics?.mcpToolCalls, detail: `${metrics?.mcpToolErrors ?? "—"} errors · ${metrics?.agentMcpToolCalls ?? "—"} from agents` },
  ];
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
    {items.map((item) => <StatCard key={item.label} {...item} />)}
  </div>;
}

function ActivityChart({ analytics }: { analytics: ActivityAnalytics }) {
  const completeDays = analytics.daily.filter((day) => day.complete).length;
  const recordedWindows = analytics.daily.reduce((total, day) => total + day.recordedWindows, 0);
  const expectedWindows = analytics.daily.reduce((total, day) => total + day.expectedWindows, 0);

  return <Card className="min-w-0">
    <CardHeader>
      <CardTitle>Activity over 30 days</CardTitle>
      <CardDescription>Daily totals appear when all four six-hour UTC windows are recorded. Partial days stay blank.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-3">
      <ChartContainer config={activityChartConfig} className="h-[260px] w-full sm:h-[280px]">
        <AreaChart data={analytics.daily} accessibilityLayer margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="mcp-activity-calls-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-mcpToolCalls)" stopOpacity={0.25} /><stop offset="95%" stopColor="var(--color-mcpToolCalls)" stopOpacity={0.02} /></linearGradient>
            <linearGradient id="mcp-activity-tasks-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-agentTaskEvents)" stopOpacity={0.18} /><stop offset="95%" stopColor="var(--color-agentTaskEvents)" stopOpacity={0.02} /></linearGradient>
            <linearGradient id="mcp-activity-messages-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-agentBoardMessages)" stopOpacity={0.18} /><stop offset="95%" stopColor="var(--color-agentBoardMessages)" stopOpacity={0.02} /></linearGradient>
            <linearGradient id="mcp-activity-audit-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-auditActions)" stopOpacity={0.14} /><stop offset="95%" stopColor="var(--color-auditActions)" stopOpacity={0.02} /></linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} tickFormatter={formatActivityDate} />
          <YAxis tickLine={false} axisLine={false} tickMargin={8} width={34} allowDecimals={false} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent labelFormatter={(label) => typeof label === "string" ? formatActivityDate(label) : label} />} />
          <Area dataKey="mcpToolCalls" type="monotone" stroke="var(--color-mcpToolCalls)" fill="url(#mcp-activity-calls-fill)" strokeWidth={2} connectNulls={false} />
          <Area dataKey="agentTaskEvents" type="monotone" stroke="var(--color-agentTaskEvents)" fill="url(#mcp-activity-tasks-fill)" strokeWidth={2} connectNulls={false} />
          <Area dataKey="agentBoardMessages" type="monotone" stroke="var(--color-agentBoardMessages)" fill="url(#mcp-activity-messages-fill)" strokeWidth={2} connectNulls={false} />
          <Area dataKey="auditActions" type="monotone" stroke="var(--color-auditActions)" fill="url(#mcp-activity-audit-fill)" strokeWidth={2} connectNulls={false} />
        </AreaChart>
      </ChartContainer>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {Object.entries(activityChartConfig).map(([key, config]) => <span key={key} className="inline-flex items-center gap-1.5"><span className="size-2 rounded-[2px]" style={{ backgroundColor: config.color }} />{config.label}</span>)}
        </div>
        <span>{completeDays}/30 complete days · {recordedWindows}/{expectedWindows} windows recorded</span>
      </div>
    </CardContent>
  </Card>;
}

function CollaborationSummary({ analytics }: { analytics: ActivityAnalytics }) {
  const latest = analytics.latestWindow;
  const metrics = latest?.metrics || null;
  const toolRows = metrics ? Object.entries(metrics.mcpToolCounts).sort((left, right) => right[1].calls - left[1].calls).slice(0, 8) : [];
  const summary = latest?.analysisStatus === "complete" && latest.analysisSummary
    ? latest.analysisSummary
    : latest?.analysisStatus === "failed"
      ? "The managed Codex summary did not complete. The activity counts remain available."
      : latest?.analysisStatus === "running"
        ? "The managed Codex summary is processing this six-hour window."
        : "A managed Codex summary will appear after the next analysis run.";

  return <div className="grid content-start gap-4">
    <Card>
      <CardHeader>
        <CardTitle>Codex collaboration summary</CardTitle>
        <CardDescription>Bounded analysis of redacted Stoic-shared activity.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {metrics ? <p className="text-sm leading-6">{summary}</p> : <p className="text-sm text-muted-foreground">The latest completed six-hour window has not been rolled up yet.</p>}
        {latest?.analysisStatus === "complete" && latest.analysisObservations.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">{latest.analysisObservations.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>}
        <p className="border-t pt-3 text-xs leading-5 text-muted-foreground">Counts come from Stoic workspace records. This summary cannot read unrelated Codex Desktop or third-party agent histories.</p>
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle>MCP tools</CardTitle><CardDescription>Most called tools in this six-hour window.</CardDescription></CardHeader>
      <CardContent>
        {!metrics ? <p className="text-sm text-muted-foreground">Waiting for the first activity rollup.</p> : toolRows.length === 0 ? <p className="text-sm text-muted-foreground">No MCP calls were recorded in this window.</p> : <Table>
          <TableHeader><TableRow><TableHead>Tool</TableHead><TableHead className="text-right">Calls</TableHead><TableHead className="text-right">Errors</TableHead></TableRow></TableHeader>
          <TableBody>{toolRows.map(([name, counts]) => <TableRow key={name}><TableCell className="max-w-40 truncate font-mono text-xs">{name}</TableCell><TableCell className="text-right tabular-nums">{counts.calls}</TableCell><TableCell className="text-right tabular-nums">{counts.errors}</TableCell></TableRow>)}</TableBody>
        </Table>}
      </CardContent>
    </Card>
  </div>;
}

export function ActivityAnalyticsPanel({ analytics, loading = false }: { analytics?: ActivityAnalytics; loading?: boolean }) {
  if (loading && !analytics) return <Card aria-label="Activity analytics loading"><CardHeader><Skeleton className="h-5 w-44" /><Skeleton className="h-4 w-72" /></CardHeader><CardContent><Skeleton className="h-64 w-full" /></CardContent></Card>;
  if (!analytics) return null;

  if (!analytics.available) return <Card className="border-dashed">
    <CardHeader><CardTitle>Agent-to-agent activity</CardTitle><CardDescription>Six-hour activity and 30-day trends from observed Stoic workspace events.</CardDescription></CardHeader>
    <CardContent className="space-y-2 text-sm text-muted-foreground">
      <p>Activity analytics are not available yet. The analytics migration and first scheduled rollup are required before this view can show data.</p>
      <p>Historical MCP calls are not represented; capture begins when instrumentation is deployed.</p>
    </CardContent>
  </Card>;

  const latest = analytics.latestWindow;
  const metrics = latest?.metrics || null;
  return <section className="space-y-4" aria-labelledby="mcp-activity-heading">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1">
        <Badge variant="secondary">Observed activity</Badge>
        <h2 id="mcp-activity-heading" className="text-xl font-semibold tracking-tight">Agent-to-agent activity</h2>
        <p className="text-sm text-muted-foreground">Task updates, shared messages, actions, and MCP calls recorded inside Stoic.</p>
      </div>
      {latest && <Badge variant="outline" className="tabular-nums">{formatActivityWindow(latest.windowStart, latest.windowEnd)}</Badge>}
    </div>
    <ActivityStats metrics={metrics} />
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.85fr)]">
      <ActivityChart analytics={analytics} />
      <CollaborationSummary analytics={analytics} />
    </div>
    <p className="text-xs leading-5 text-muted-foreground">{analytics.captureStartedAt
      ? `MCP tool capture began ${new Date(analytics.captureStartedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC. Earlier calls are not represented.`
      : "MCP tool capture start is not available yet. Earlier calls are not represented."}</p>
  </section>;
}
