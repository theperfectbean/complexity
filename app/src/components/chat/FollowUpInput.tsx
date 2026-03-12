import { SendHorizontal } from "lucide-react";
import TextareaAutosize from "react-textarea-autosize";

type FollowUpInputProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder: string;
  submitLabel: string;
};

export function FollowUpInput({
  value,
  onChange,
  disabled,
  placeholder,
  submitLabel,
}: FollowUpInputProps) {
  return (
    <div className="mt-3 rounded-lg border bg-card p-2 shadow-2xs">
      <div className="flex items-end gap-2">
        <TextareaAutosize
          minRows={1}
          maxRows={8}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={placeholder}
          className="max-h-52 flex-1 resize-none bg-transparent px-2 py-2 text-base outline-none placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
          disabled={disabled}
          aria-label={submitLabel}
        >
          <SendHorizontal className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
