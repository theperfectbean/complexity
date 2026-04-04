import { useState, useCallback, useRef, useEffect } from "react";
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
  
  // Custom user prompts
  const [customCommands, setCustomCommands] = useState<SlashCommand[]>([]);

  useEffect(() => {
    fetch("/api/prompts")
      .then(r => r.ok ? r.json() : { prompts: [] })
      .then(data => {
        if (!data.prompts) return;
        const cmds: SlashCommand[] = data.prompts.map((p: any) => ({
          id: `prompt-${p.id}`,
          trigger: `prompt:${p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          label: `Prompt: ${p.title}`,
          description: p.content.slice(0, 100),
          action: (ctx: any) => {
             const inputValue = ctx.inputValue.trim();
             // Strip the trigger word from the input
             const prefix = `/${`prompt:${p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} `;
             const promptText = inputValue.toLowerCase().startsWith(prefix.toLowerCase())
               ? inputValue.substring(prefix.length)
               : inputValue.replace(new RegExp(`^/prompt:${p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}\\s*`, 'i'), "");
               
             if (p.isSystemPrompt && ctx.threadId) {
               fetch(`/api/threads/${ctx.threadId}`, {
                 method: "PATCH",
                 headers: { "Content-Type": "application/json" },
                 body: JSON.stringify({ systemPrompt: p.content }),
               })
                 .then(() => ctx.insertText(promptText)) // clear trigger, leave remaining text if any
                 .catch(() => ctx.insertText(promptText)); // fallback
             } else {
               ctx.insertText(p.content + (promptText ? "\n\n" + promptText : ""));
             }
          }
        }));
        setCustomCommands(cmds);
      })
      .catch(() => {});
  }, []);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      onChange(newValue);
      currentValueRef.current = newValue;

      if (newValue.startsWith("/")) {
        const afterSlash = newValue.substring(1);
        if (!afterSlash.includes(" ")) {
          setShowCommandMenu(true);
          setCommandQuery(afterSlash);
        } else {
          setShowCommandMenu(false);
          setCommandQuery("");
        }
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
        insertText: (text: string) => {
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
  
  const allCommands = [...commandRegistry.getCommands(), ...customCommands];

  const matchedCommands = allCommands.filter((c) => {
    const lowerQuery = commandQuery.toLowerCase();
    return c.trigger.toLowerCase().includes(lowerQuery) ||
           lowerQuery.startsWith(c.trigger.toLowerCase()) ||
           c.label.toLowerCase().includes(lowerQuery);
  });

  return {
    showCommandMenu,
    commandQuery,
    handleTextChange,
    handleCommandSelect,
    closeMenu,
    matchedCommands,
    allCommands,
  };
}
