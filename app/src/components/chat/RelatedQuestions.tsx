type RelatedQuestionsProps = {
  questions: string[];
  onSelect?: (question: string) => void;
};

export function RelatedQuestions({ questions, onSelect }: RelatedQuestionsProps) {
  if (questions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-[13px] font-bold tracking-tight text-foreground/70 uppercase">Related Questions</h4>
      <div className="flex flex-col gap-2">
        {questions.map((question) => (
          <button
            key={question}
            type="button"
            className="group flex items-center justify-between rounded-xl border bg-card/50 px-4 py-3 text-left text-[14px] font-medium transition-all hover:bg-black/5 dark:hover:bg-white/5 hover:shadow-sm"
            onClick={() => onSelect?.(question)}
          >
            <span className="flex-1 truncate">{question}</span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}
