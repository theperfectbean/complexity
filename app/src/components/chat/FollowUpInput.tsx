import { SendHorizontal } from "lucide-react";
import TextareaAutosize from "react-textarea-autosize";
import { CommandMenu } from "./CommandMenu";
import { useSlashCommands } from "@/lib/hooks/useSlashCommands";
import { commandRegistry } from "@/plugins/commandRegistry";
import { registerGeminiCommand } from "@/plugins/tools/gemini";

// Register slash commands at module level (idempotent)
registerGeminiCommand();

type FollowUpInputProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder: string;
  submitLabel: string;
  threadId?: string;
};

export function FollowUpInput({
  value,
  onChange,
  disabled,
  placeholder,
  submitLabel,
  threadId,
}: FollowUpInputProps) {
  const { showCommandMenu, commandQuery, handleTextChange, handleCommandSelect, closeMenu } =
    useSlashCommands(onChange, { threadId });

  return (
    <div className="relative mt-3 rounded-lg border bg-card p-2 shadow-2xs">
      {showCommandMenu && (
        <CommandMenu
          query={commandQuery}
          onSelect={handleCommandSelect}
          onClose={closeMenu}
        />
      )}
      <div className="flex items-end gap-2">
        <TextareaAutosize
          minRows={1}
          maxRows={8}
          value={value}
          onChange={handleTextChange}
          onKeyDown={(event) => {
            const hasActiveCommand = showCommandMenu || (value.startsWith("/") && commandRegistry.matchCommands(value.substring(1)).length > 0);
            if (
              hasActiveCommand &&
              (event.key === "ArrowUp" ||
                event.key === "ArrowDown" ||
                event.key === "Enter" ||
                event.key === "Tab")
            ) {
              if (event.key === "Enter" || event.key === "Tab") {
                event.preventDefault();
              }
              return;
            }

            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder={placeholder}
          className="flex-1 resize-none bg-transparent px-2 py-2 text-base outline-none placeholder:text-muted-foreground"
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
