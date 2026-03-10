type ProcessingBadgeProps = {
  status: "processing" | "ready" | "failed" | string;
};

export function ProcessingBadge({ status }: ProcessingBadgeProps) {
  const normalized = status.toLowerCase();
  const className =
    normalized === "ready"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : normalized === "failed"
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : "border-primary/30 bg-primary/10 text-primary";

  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs capitalize ${className}`}>{normalized}</span>;
}
