"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Paperclip, SendHorizontal } from "lucide-react";
import { motion } from "motion/react";
import { useMemo } from "react";
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
  onAttachClick?: () => void;
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
}: SearchBarProps) {
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

  return (
    <motion.div
      layoutId={layoutId}
      layout
      className={cn(
        "rounded-xl border bg-card p-3 shadow-sm transition-shadow",
        "focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-ring/20 focus-within:shadow",
      )}
    >
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
          className="max-h-52 flex-1 resize-none bg-transparent px-2 py-2 text-base outline-none placeholder:text-muted-foreground disabled:opacity-50"
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2">
        <div className="flex items-center gap-2">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-3 py-1.5 text-xs text-foreground hover:bg-accent"
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
                        className="cursor-pointer rounded-lg px-2 py-1.5 text-sm outline-none hover:bg-accent"
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
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border bg-card text-muted-foreground hover:bg-accent"
            aria-label="Attach file"
            onClick={onAttachClick}
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
