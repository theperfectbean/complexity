import { useState } from "react";
import { SendHorizontal } from "lucide-react";
import TextareaAutosize from "react-textarea-autosize";
import { CommandMenu } from "./CommandMenu";
import { SlashCommand } from "@/plugins/commandRegistry";

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
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);

    // Check if the user is typing a command
    if (newValue.startsWith("/")) {
      setShowCommandMenu(true);
      setCommandQuery(newValue.substring(1));
    } else {
      setShowCommandMenu(false);
    }
  };

  const handleCommandSelect = (command: SlashCommand) => {
    command.action({
      insertText: (text) => {
        onChange(text);
        setShowCommandMenu(false);
      },
      inputValue: value,
    });
  };

  return (
    <div className="relative mt-3 rounded-lg border bg-card p-2 shadow-2xs">
      {showCommandMenu && (
        <CommandMenu
          query={commandQuery}
          onSelect={handleCommandSelect}
          onClose={() => setShowCommandMenu(false)}
          position={{ top: 0, left: 0 }}
        />
      )}
      <div className="flex items-end gap-2">
        <TextareaAutosize
          minRows={1}
          maxRows={8}
          value={value}
          onChange={handleTextChange}
          onKeyDown={(event) => {
            if (showCommandMenu && (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "Enter" || event.key === "Tab")) {
              // Let the CommandMenu handle these
              if (event.key === "Enter" || event.key === "Tab") {
                event.preventDefault(); // Prevent form submission while menu is open
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
