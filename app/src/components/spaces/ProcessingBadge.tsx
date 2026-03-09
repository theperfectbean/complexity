type ProcessingBadgeProps = {
  status: "processing" | "ready" | "failed" | string;
};

export function ProcessingBadge({ status }: ProcessingBadgeProps) {
  const normalized = status.toLowerCase();
  const className =
    normalized === "ready"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : normalized === "failed"
        ? "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300"
        : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300";

  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs capitalize ${className}`}>{normalized}</span>;
}
