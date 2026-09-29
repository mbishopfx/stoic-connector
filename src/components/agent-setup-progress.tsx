import type { Platform } from "@/lib/config";
import { getAgentSetupGuidance } from "@/lib/agent-setup-guidance";

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
  const progressPercent = Math.round((progress.completedSteps / progress.steps.length) * 100);
  const target = next?.id === "inbox_check"
    ? "#first-inbox-check"
    : next?.id === "schedule"
      ? "#agent-schedule-setup"
      : "#agent-connection";

  return <section className="agent-setup-progress" aria-label={`Setup progress for ${agent.name}`}>
    <div className="agent-setup-progress-heading">
      <div>
        <span className="eyebrow muted">SETUP PATH</span>
        <h3>{next ? `Next: ${next.label}` : "This agent is ready"}</h3>
        <p>{next?.detail || "This agent has completed an accepted handoff. Keep its brief current and review its inbox health."}</p>
      </div>
      <strong>{progress.completedSteps} of {progress.steps.length}</strong>
    </div>
    <div className="agent-setup-progress-track" role="progressbar" aria-label={`${agent.name} setup`} aria-valuemin={0} aria-valuemax={progress.steps.length} aria-valuenow={progress.completedSteps} aria-valuetext={`${progress.completedSteps} of ${progress.steps.length} steps complete`}>
      <span style={{ width: `${progressPercent}%` }} />
    </div>
    <ol className="agent-setup-progress-list">
      {progress.steps.map((step) => {
        const isNext = next?.id === step.id;
        const state = step.complete ? "complete" : isNext ? "next" : "later";
        const stateLabel = step.id === "schedule" && step.complete ? "Declared" : step.complete ? "Done" : isNext ? "Next" : "Later";
        return <li key={step.id} data-state={state}>
          <span>{stateLabel}</span>
          <strong>{step.label}</strong>
        </li>;
      })}
    </ol>
    {next?.id === "handoff"
      ? <button type="button" className="subtle-link" onClick={onOpenIntake}>Start in Stoic chat</button>
      : next && <a className="subtle-link" href={target}>Go to this step</a>}
  </section>;
}
