import { SendHorizontal } from "lucide-react";
import TextareaAutosize from "react-textarea-autosize";
import { CommandMenu } from "./CommandMenu";
import { useSlashCommands } from "@/lib/hooks/useSlashCommands";
import { commandRegistry } from "@/plugins/commandRegistry";
import { useSession } from "next-auth/react";

import { registerSysadminCommand } from "@/plugins/tools/sysadmin-command";

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
  const { data: session } = useSession();
  if (session?.user?.isAdmin) {
    registerSysadminCommand();
  }

  const { showCommandMenu, commandQuery, handleTextChange, handleCommandSelect, closeMenu, matchedCommands, allCommands } =
    useSlashCommands(onChange, { threadId });

  return (
    <div className="relative mt-3 rounded-lg border bg-card p-2 shadow-2xs">
      {showCommandMenu && (
        <CommandMenu
          query={commandQuery}
          commands={matchedCommands}
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
            // Block navigation keys while the command picker menu is open
            if (showCommandMenu && (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "Enter" || event.key === "Tab")) {
              if (event.key === "Enter" || event.key === "Tab") event.preventDefault();
              return;
            }

            if (event.key === "Enter" && !event.shiftKey) {
              // Execute a fully-formed slash command: /{trigger} {prompt text}
              if (value.startsWith("/")) {
                const matched = allCommands.find((cmd) => {
                  const prefix = `/${cmd.trigger} `;
                  return value.toLowerCase().startsWith(prefix.toLowerCase()) && value.length > prefix.length;
                });
                if (matched) {
                  event.preventDefault();
                  handleCommandSelect(matched);
                  return;
                }
              }
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
