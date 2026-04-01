import { useState, useCallback, useRef } from "react";
import { commandRegistry, SlashCommand } from "@/plugins/commandRegistry";

export interface SlashCommandContext {
  threadId?: string;
}

export function useSlashCommands(
  onChange: (value: string) => void,
  context?: SlashCommandContext,
) {
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const currentValueRef = useRef("");

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      onChange(newValue);
      currentValueRef.current = newValue;

      if (newValue.startsWith("/")) {
        setShowCommandMenu(true);
        setCommandQuery(newValue.substring(1));
      } else {
        setShowCommandMenu(false);
        setCommandQuery("");
      }
    },
    [onChange],
  );

  const handleCommandSelect = useCallback(
    (command: SlashCommand) => {
      command.action({
        insertText: (text) => {
          onChange(text);
          currentValueRef.current = text;
          setShowCommandMenu(false);
          setCommandQuery("");
        },
        inputValue: currentValueRef.current,
        threadId: context?.threadId,
      });
    },
    [onChange, context?.threadId],
  );

  const closeMenu = useCallback(() => {
    setShowCommandMenu(false);
    setCommandQuery("");
  }, []);

  return {
    showCommandMenu,
    commandQuery,
    handleTextChange,
    handleCommandSelect,
    closeMenu,
  };
}
