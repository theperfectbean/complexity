"use client";

import { useEffect, useState, useRef } from "react";
import { commandRegistry, SlashCommand } from "@/plugins/commandRegistry";
import { cn } from "@/lib/utils";

interface CommandMenuProps {
  query: string;
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
  position: { top: number; left: number };
}

export function CommandMenu({ query, onSelect, onClose, position }: CommandMenuProps) {
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const matched = commandRegistry.matchCommands(query);
    setCommands(matched);
    setSelectedIndex(0);
    if (matched.length === 0 && query.length > 0) {
      onClose();
    }
  }, [query, onClose]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (commands.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % commands.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + commands.length) % commands.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        onSelect(commands[selectedIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [commands, selectedIndex, onSelect, onClose]);

  if (commands.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="absolute z-50 min-w-[240px] overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl"
      style={{ bottom: "100%", left: 0, marginBottom: "8px" }} // Positioned above input relative to parent
    >
      <div className="p-1">
        {commands.map((cmd, index) => (
          <div
            key={cmd.id}
            onClick={() => onSelect(cmd)}
            className={cn(
              "flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm",
              index === selectedIndex ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            )}
          >
            <div className="flex flex-col">
              <span className="font-semibold">/{cmd.trigger}</span>
              <span className="text-xs opacity-80">{cmd.label} - {cmd.description}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
