type RelatedQuestionsProps = {
  questions: string[];
  onSelect?: (question: string) => void;
};

export function RelatedQuestions({ questions, onSelect }: RelatedQuestionsProps) {
  if (questions.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {questions.map((question) => (
        <button
          key={question}
          type="button"
          className="rounded-full border px-3 py-1 text-xs hover:bg-muted/40"
          onClick={() => onSelect?.(question)}
        >
          {question}
        </button>
      ))}
    </div>
  );
}
