"use client";

import { ShieldCheck, CheckCircle, XCircle, AlertTriangle, FileCode2 } from "lucide-react";
import ReactDiffViewer from "react-diff-viewer-continued";
import { type MissionPlan, type MissionPlanStep } from "@/lib/agent/protocol";
import { cn } from "@/lib/utils";

interface MissionPlanPanelProps {
  plan: MissionPlan;
  onApprove: () => void;
  onReject: () => void;
}

function StepKindBadge({ kind }: { kind: MissionPlanStep["kind"] }) {
  const styles = {
    inspect: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    change: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    verify: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    fallback: "bg-muted/10 text-muted-foreground border-muted-foreground/20",
  };

  return (
    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest border", styles[kind])}>
      {kind}
    </span>
  );
}

export function MissionPlanPanel({ plan, onApprove, onReject }: MissionPlanPanelProps) {
  return (
    <div className="rounded-2xl bg-amber-500/5 border border-amber-500/20 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-amber-500/10 bg-amber-500/5">
        <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center">
          <ShieldCheck className="h-6 w-6 text-amber-500" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-amber-500 tracking-tight uppercase">Mission Plan — Approval Required</h2>
          <p className="text-[15px] font-medium text-amber-700/80 mt-0.5">{plan.goal}</p>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Steps */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">Execution Steps</h3>
          <div className="space-y-3">
            {plan.steps.map((step, idx) => (
              <div key={step.id} className="flex items-start gap-4 p-3.5 rounded-xl bg-background/40 border border-border/40">
                <div className="flex-shrink-0 h-6 w-6 rounded-full bg-muted/40 flex items-center justify-center text-[11px] font-bold text-muted-foreground">
                  {idx + 1}
                </div>
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-[14px] font-bold text-foreground leading-tight">{step.title}</h4>
                    <StepKindBadge kind={step.kind} />
                  </div>
                  <p className="text-[13px] leading-relaxed text-muted-foreground/90">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Risks */}
        {plan.risks.length > 0 && (
          <div className="space-y-3 p-4 rounded-xl bg-destructive/5 border border-destructive/20">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              <h3 className="text-xs font-bold uppercase tracking-widest">Risk Assessment</h3>
            </div>
            <ul className="space-y-1.5">
              {plan.risks.map((risk, idx) => (
                <li key={idx} className="text-[13px] font-medium text-destructive/90 pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-destructive/50">
                  {risk}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Diffs */}
        {plan.patches && plan.patches.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">Proposed File Changes</h3>
            <div className="space-y-6">
              {plan.patches.map((patch, idx) => (
                <div key={idx} className="rounded-xl border border-border/40 overflow-hidden bg-card">
                  <div className="flex items-center gap-3 px-4 py-2 bg-muted/20 border-b border-border/40">
                    <FileCode2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-mono font-medium">{patch.file}</span>
                  </div>
                  <div className="text-xs max-h-[400px] overflow-auto bg-zinc-950">
                    <ReactDiffViewer
                      oldValue={patch.oldContent}
                      newValue={patch.newContent}
                      splitView={true}
                      useDarkTheme={true}
                      hideLineNumbers={false}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={onApprove}
            className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-emerald-500 text-white font-bold text-[13px] uppercase tracking-widest transition-all hover:bg-emerald-600 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-emerald-500/20"
          >
            <CheckCircle className="h-5 w-5" />
            Approve & Execute
          </button>
          <button
            onClick={onReject}
            className="flex items-center justify-center gap-2 h-11 px-6 rounded-xl bg-muted text-muted-foreground font-bold text-[13px] uppercase tracking-widest transition-all hover:bg-muted-foreground/10 active:scale-[0.98] border border-border/40"
          >
            <XCircle className="h-5 w-5" />
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}
