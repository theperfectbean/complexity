"use client";

import { useRef, useEffect } from "react";
import { CornerDownRight } from "lucide-react";
import { ModelSelector } from "@/components/search/parts/ModelSelector";

interface MissionInputProps {
  value: string;
  onValueChange: (value: string) => void;
  model: string;
  onModelChange: (model: string) => void;
  onSubmit: (message: string) => void;
  onSlashCommand?: (command: string) => void;
  disabled: boolean;
  placeholder: string;
  envPrefix?: string;
}

export function MissionInput({ 
  value,
  onValueChange,
  model, 
  onModelChange, 
  onSubmit, 
  onSlashCommand,
  disabled, 
  placeholder,
  envPrefix
}: MissionInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = value.trim();
    if (trimmed && !disabled) {
      if (trimmed.startsWith('/') && onSlashCommand) {
        onSlashCommand(trimmed);
        onValueChange('');
      } else {
        onSubmit(trimmed);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
      if (!e.shiftKey) e.preventDefault();
      handleSubmit();
    }
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [value]);

  return (
    <div className="relative">
      <div className="p-1.5 rounded-2xl bg-muted/30 border border-border/40 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10 transition-all">
        {envPrefix && (
          <div className="px-4 pt-3 pb-1 font-mono text-xs font-bold text-emerald-500/80 tracking-tight">
            {envPrefix}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full max-h-48 min-h-[44px] bg-transparent resize-none px-4 py-2 text-[0.9375rem] font-medium leading-[1.6] outline-none placeholder:text-muted-foreground/50 text-foreground disabled:opacity-60 transition-opacity"
          style={{ height: "auto" }}
        />
        
        <div className="flex items-center justify-between px-3 pb-2 pt-1">
          <div className="flex items-center gap-2">
            <ModelSelector 
              model={model}
              onModelChange={onModelChange}
              excludeCategories={["Perplexity", "Presets"]}
            />
          </div>
          
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/30 hidden sm:block">
              Cmd+Enter to send
            </span>
            <button
              onClick={handleSubmit}
              disabled={disabled || !value.trim()}
              className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center text-primary-foreground transition-all hover:bg-primary/90 hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 disabled:bg-muted-foreground/20"
            >
              <CornerDownRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
      <p className="mt-2 px-4 text-[10px] font-medium text-muted-foreground/50 text-center uppercase tracking-[0.1em]">
        A mission plan will be proposed before any action is taken
      </p>
    </div>
  );
}
