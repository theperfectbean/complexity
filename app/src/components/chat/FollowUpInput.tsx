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
    <div className="mt-3 flex items-end gap-2">
      <TextareaAutosize
        minRows={1}
        maxRows={8}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="max-h-52 flex-1 resize-none rounded-md border bg-transparent px-3 py-2 text-sm"
      />
      <button type="submit" className="rounded-md border px-4 py-2 text-sm" disabled={disabled}>
        {submitLabel}
      </button>
    </div>
  );
}
