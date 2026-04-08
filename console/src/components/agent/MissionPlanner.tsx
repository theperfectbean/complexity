
import { useMemo } from "react";
import { CheckCircle2, ShieldAlert, Wrench, Search, RotateCcw } from "lucide-react";
import {
  reduceMissionPlannerState,
  type AgentStreamEvent,
  type MissionPlanStep,
} from "@/lib/agent/protocol";
import { cn } from "@/lib/utils";

export interface MissionPlannerProps {
  eventStream: AgentStreamEvent[];
  onApprove: (input: { runId: string; approved: boolean; comment?: string }) => Promise<void>;
}

function StepIcon({ kind }: { kind: MissionPlanStep["kind"] }) {
  if (kind === "inspect") return <Search className="h-4 w-4" />;
  if (kind === "change") return <Wrench className="h-4 w-4" />;
  if (kind === "verify") return <CheckCircle2 className="h-4 w-4" />;
  return <RotateCcw className="h-4 w-4" />;
}

export function MissionPlanner({ eventStream, onApprove }: MissionPlannerProps) {
  const state = useMemo(
    () => eventStream.reduce(reduceMissionPlannerState, {
      approvalPending: false,
      status: "idle",
    }),
    [eventStream],
  );

  const latestEvent = eventStream[eventStream.length - 1];
  const runId = latestEvent?.runId;
  const disabled = !runId || state.status !== "waiting_for_approval";

  if (!state.currentPlan) return null;

  return (
    <section className="rounded-2xl border border-border/60 bg-card/70 p-4 shadow-sm backdrop-blur-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Mission Planner</p>
          <h3 className="mt-1 text-sm font-semibold text-foreground">{state.currentPlan.goal}</h3>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
            state.status === "waiting_for_approval"
              ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
              : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
          )}
        >
          {state.status.replace(/_/g, " ")}
        </span>
      </div>

      {state.currentPlan.assumptions.length > 0 ? (
        <div className="mb-4">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Assumptions</p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {state.currentPlan.assumptions.map((assumption) => (
              <li key={assumption} className="rounded-lg bg-muted/50 px-2.5 py-2">
                {assumption}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.currentPlan.risks.length > 0 ? (
        <div className="mb-4">
          <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <ShieldAlert className="h-3.5 w-3.5" />
            Risks
          </p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {state.currentPlan.risks.map((risk) => (
              <li key={risk} className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-2.5 py-2">
                {risk}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mb-4">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Checklist</p>
        <ol className="space-y-2">
          {state.currentPlan.steps.map((step) => (
            <li key={step.id} className="rounded-xl border border-border/60 bg-background/60 p-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
                  <StepIcon kind={step.kind} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{step.title}</p>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {step.kind}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.description}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="mb-4">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Success Criteria</p>
        <ul className="space-y-1 text-xs text-muted-foreground">
          {state.currentPlan.successCriteria.map((criterion) => (
            <li key={criterion} className="rounded-lg bg-emerald-500/5 px-2.5 py-2">
              {criterion}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => (runId ? void onApprove({ runId, approved: true }) : undefined)}
          className="flex-1 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Approve Plan
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => (runId ? void onApprove({ runId, approved: false }) : undefined)}
          className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </section>
  );
}
