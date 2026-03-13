"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Globe, Paperclip, SendHorizontal, X, FileText } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useRef } from "react";
import TextareaAutosize from "react-textarea-autosize";

import { MODELS, getDefaultModel } from "@/lib/models";
import { cn } from "@/lib/utils";

type SearchModelOption = {
  id: string;
  label: string;
  category: string;
};

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  submitLabel: string;
  disabled?: boolean;
  layoutId?: string;
  compact?: boolean;
  model?: string;
  onModelChange?: (model: string) => void;
  modelOptions?: readonly SearchModelOption[];
  onAttachClick?: (files: FileList | null) => void;
  attachments?: File[];
  onRemoveAttachment?: (index: number) => void;
  webSearchEnabled?: boolean;
  onWebSearchChange?: (enabled: boolean) => void;
  "data-testid"?: string;
};

export function SearchBar({
  value,
  onChange,
  placeholder,
  submitLabel,
  disabled,
  layoutId = "searchbar",
  compact,
  model = getDefaultModel(),
  onModelChange,
  modelOptions = MODELS,
  onAttachClick,
  attachments = [],
  onRemoveAttachment,
  webSearchEnabled = true,
  onWebSearchChange,
  "data-testid": dataTestId,
}: SearchBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const groupedModels = useMemo(() => {
    return modelOptions.reduce<Record<string, SearchModelOption[]>>((accumulator, option) => {
      if (!accumulator[option.category]) {
        accumulator[option.category] = [];
      }
      accumulator[option.category].push(option);
      return accumulator;
    }, {});
  }, [modelOptions]);

  const activeModelLabel = modelOptions.find((item) => item.id === model)?.label ?? model;

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onAttachClick?.(event.target.files);
    // Reset the input value so the same file can be selected again
    event.target.value = "";
  };

  return (
    <motion.div
      layoutId={layoutId}
      layout={!compact}
      data-testid={dataTestId}
      className={cn(
        "flex flex-col rounded-xl border bg-card p-3 shadow-sm transition-shadow",
        "focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-ring/20 focus-within:shadow",
      )}
    >
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        multiple
        onChange={handleFileChange}
        accept=".pdf,.docx,.txt,.md,image/*"
      />
      
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 pb-2 px-2" data-testid="attachments-container">
          {attachments.map((file, index) => (
            <div 
              key={`${file.name}-${index}`} 
              data-testid="file-chip"
              className="flex items-center gap-1.5 rounded-md bg-muted/50 pl-2 pr-1 py-1 text-xs text-muted-foreground border border-border/50 max-w-[150px]"
            >
              <FileText className="h-3 w-3 shrink-0" />
              <span className="truncate font-medium">{file.name}</span>
              <button
                type="button"
                onClick={() => onRemoveAttachment?.(index)}
                className="ml-auto inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10 shrink-0"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <TextareaAutosize
          minRows={compact ? 1 : 2}
          maxRows={8}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          disabled={disabled}
          placeholder={placeholder}
          className="flex-1 resize-none bg-transparent px-2 py-2 text-base outline-none placeholder:text-muted-foreground disabled:opacity-50"
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2">
        <div className="flex items-center gap-2">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-3 py-1.5 text-xs text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                aria-label="Select model"
              >
                <span className="max-w-32 truncate">{activeModelLabel}</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                sideOffset={8}
                className="z-50 max-h-72 min-w-56 overflow-y-auto rounded-xl border bg-popover p-1 shadow-md"
              >
                {Object.entries(groupedModels).map(([category, options]) => (
                  <div key={category} className="py-1">
                    <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{category}</p>
                    {options.map((option) => (
                      <DropdownMenu.Item
                        key={option.id}
                        onSelect={() => onModelChange?.(option.id)}
                        className="cursor-pointer rounded-lg px-2 py-1.5 text-sm outline-none hover:bg-black/5 dark:hover:bg-white/5"
                      >
                        {option.label}
                      </DropdownMenu.Item>
                    ))}
                  </div>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>

          <button
            type="button"
            className={cn(
              "inline-flex h-8 w-fit items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
              webSearchEnabled
                ? "border-primary/20 bg-primary/10 text-primary hover:bg-primary/20"
                : "bg-card text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5",
            )}
            aria-label="Toggle web search"
            onClick={() => onWebSearchChange?.(!webSearchEnabled)}
          >
            <Globe className="h-3.5 w-3.5" />
            <span>Search</span>
          </button>

          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border bg-card text-muted-foreground hover:bg-black/5 dark:hover:bg-white/5"
            aria-label="Attach file"
            onClick={handleAttachClick}
          >
            <Paperclip className="h-4 w-4" />
          </button>
        </div>

        <button
          type="submit"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all hover:scale-[1.02] disabled:opacity-50"
          disabled={disabled}
          aria-label={submitLabel}
        >
          <SendHorizontal className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}
