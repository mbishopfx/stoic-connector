import type { Platform } from "@/lib/config";
import { getAgentSetupGuidance } from "@/lib/agent-setup-guidance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

type Agent = {
  id: string;
  name: string;
  platform: Platform;
  status: string;
  last_check_at: string | null;
  schedule_enabled: boolean;
};

type Handoff = {
  assigned_agent_id: string | null;
  created_by_agent_id: string | null;
  status: string;
};

export function AgentSetupProgress({ agent, bossAgentId, handoffs, onOpenIntake }: {
  agent: Agent;
  bossAgentId: string | null;
  handoffs: Handoff[];
  onOpenIntake: () => void;
}) {
  const progress = getAgentSetupGuidance({ agent, bossAgentId, handoffs });
  const next = progress.nextStep;
  const progressPercent = progress.steps.length ? Math.round((progress.completedSteps / progress.steps.length) * 100) : 0;
  const target = next?.id === "inbox_check"
    ? "#first-inbox-check"
    : next?.id === "schedule"
      ? "#agent-schedule-setup"
      : "#agent-connection";

  return <Card aria-label={`Setup progress for ${agent.name}`} className="border-border/80">
    <CardHeader className="gap-2 sm:grid-cols-[1fr_auto]">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Setup path</p>
        <CardTitle className="text-lg">{next ? `Next: ${next.label}` : "This agent is ready"}</CardTitle>
        <p className="text-sm leading-6 text-muted-foreground">{next?.detail || "This agent has completed an accepted handoff. Keep its brief current and review its inbox health."}</p>
      </div>
      <Badge variant={next ? "secondary" : "default"}>{progress.completedSteps} of {progress.steps.length} complete</Badge>
    </CardHeader>
    <CardContent className="space-y-4">
      <Progress value={progressPercent} aria-label={`${agent.name} setup`} aria-valuetext={`${progress.completedSteps} of ${progress.steps.length} steps complete`} />
      <ol className="grid gap-2 sm:grid-cols-3">
        {progress.steps.map((step) => {
          const isNext = next?.id === step.id;
          const state = step.complete ? "complete" : isNext ? "next" : "later";
          const stateLabel = step.id === "schedule" && step.complete ? "Declared" : step.complete ? "Done" : isNext ? "Next" : "Later";
          return <li key={step.id} data-state={state} className="flex min-w-0 items-start gap-3 rounded-lg border border-border/80 bg-muted/30 p-3">
            <Badge variant={step.complete ? "default" : isNext ? "secondary" : "outline"}>{stateLabel}</Badge>
            <strong className="pt-0.5 text-sm font-medium">{step.label}</strong>
          </li>;
        })}
      </ol>
      {next?.id === "handoff"
        ? <Button type="button" variant="outline" size="sm" onClick={onOpenIntake}>Start in Stoic chat</Button>
        : next && <Button type="button" variant="link" size="sm" render={<a href={target} />}>Go to this step</Button>}
    </CardContent>
  </Card>;
}
