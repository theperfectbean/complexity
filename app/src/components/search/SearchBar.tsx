"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Globe, Paperclip, SendHorizontal, X, FileText } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useRef, useState, useEffect } from "react";
import TextareaAutosize from "react-textarea-autosize";

import { MODELS, getDefaultModel } from "@/lib/models";
import { cn } from "@/lib/utils";

type SearchModelOption = {
  id: string;
  label: string;
  category: string;
  isPreset: boolean;
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
  autoFilter?: boolean;
  "data-testid"?: string;
  id?: string;
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
  modelOptions: providedModelOptions,
  onAttachClick,
  attachments = [],
  onRemoveAttachment,
  webSearchEnabled = true,
  onWebSearchChange,
  autoFilter = true,
  "data-testid": dataTestId,
  id,
}: SearchBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [internalAttachments, setInternalAttachments] = useState<File[]>(attachments);
  const [availableModels, setAvailableModels] = useState<readonly SearchModelOption[]>(providedModelOptions || MODELS);
  const [hasUserSelectedModel, setHasUserSelectedModel] = useState(false);

  useEffect(() => {
    setInternalAttachments(attachments);
  }, [attachments]);

  useEffect(() => {
    if (autoFilter && !providedModelOptions) {
      fetch("/api/models")
        .then(res => res.json())
        .then(data => {
          if (data.models && data.models.length > 0) {
            setAvailableModels(data.models);
            
            // Logic: if user hasn't explicitly clicked a model yet, 
            // OR if current model is invalid, switch to the TOP model in the list.
            const currentModelIsValid = data.models.some((m: SearchModelOption) => m.id === model);
            const isInitialDefault = model === getDefaultModel();

            if (!currentModelIsValid || (!hasUserSelectedModel && isInitialDefault)) {
              const topModel = data.models[0].id;
              if (topModel && topModel !== model) {
                onModelChange?.(topModel);
              }
            }
          }
        })
        .catch(err => console.error("Failed to fetch available models:", err));
    }
  }, [autoFilter, providedModelOptions, model, onModelChange, hasUserSelectedModel]);

  const modelOptions = availableModels;

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

  const handleModelSelect = (id: string) => {
    setHasUserSelectedModel(true);
    onModelChange?.(id);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      setInternalAttachments((prev) => [...prev, ...Array.from(files)]);
    }
    onAttachClick?.(files);
    event.target.value = "";
  };

  return (
    <motion.div
      id={id}
      layoutId={layoutId}
      layout={!compact}
      data-testid={dataTestId || id}
      className={cn(
        "flex flex-col rounded-[22px] border bg-card p-2 shadow-md transition-all duration-200",
        "focus-within:border-primary/30 focus-within:ring-4 focus-within:ring-primary/5 focus-within:shadow-lg",
      )}
    >
      <input
        type="file"
        ref={fileInputRef}
        data-testid="file-upload-input"
        className="hidden"
        multiple
        onChange={handleFileChange}
        accept=".pdf,.docx,.txt,.md,image/*"
      />
      
      {internalAttachments.length > 0 && (
        <div className="flex flex-wrap gap-2 pb-1.5 px-2" data-testid="attachments-container">
          {internalAttachments.map((file, index) => (
            <motion.div 
              key={`${file.name}-${index}`} 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              data-testid="file-chip"
              className="group flex items-center gap-1.5 rounded-xl bg-muted/40 pl-2.5 pr-1.5 py-1.5 text-[11px] text-muted-foreground border border-border/40 max-w-[160px] transition-colors hover:bg-muted/60"
            >
              <FileText className="h-3 w-3 shrink-0 text-primary/60" />
              <span className="truncate font-medium">{file.name}</span>
              <button
                type="button"
                onClick={() => {
                  setInternalAttachments(prev => prev.filter((_, i) => i !== index));
                  onRemoveAttachment?.(index);
                }}
                className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-foreground/10 shrink-0 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </motion.div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 px-2">
        <TextareaAutosize
          minRows={compact ? 1 : 2}
          maxRows={12}
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
          className="flex-1 resize-none bg-transparent py-2.5 text-[15px] outline-none placeholder:text-muted-foreground/60 disabled:opacity-50 leading-relaxed"
        />
      </div>

      <div className="mt-1 flex items-center justify-between gap-2 px-1 pb-1">
        <div className="flex items-center gap-1.5">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-transparent px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                aria-label="Select model"
              >
                <span className="max-w-32 truncate">{activeModelLabel}</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-50" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                sideOffset={8}
                className="z-50 max-h-80 min-w-64 overflow-y-auto rounded-2xl border bg-popover/95 p-1.5 shadow-xl backdrop-blur-sm animate-in fade-in zoom-in-95"
              >
                {Object.entries(groupedModels).map(([category, options]) => (
                  <div key={category} className="py-1">
                    <p className="px-3 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/50">{category}</p>
                    {options.map((option) => (
                      <DropdownMenu.Item
                        key={option.id}
                        onSelect={() => handleModelSelect(option.id)}
                        className={cn(
                          "flex cursor-pointer items-center rounded-lg px-3 py-2 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground",
                          model === option.id && "bg-primary/5 text-primary font-medium"
                        )}
                      >
                        {option.label}
                      </DropdownMenu.Item>
                    ))}
                  </div>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>

          <div className="h-4 w-px bg-border/40 mx-0.5" />

          <button
            type="button"
            className={cn(
              "inline-flex h-8 w-fit items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-medium transition-all",
              webSearchEnabled
                ? "text-primary hover:bg-primary/10"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
            aria-label="Toggle web search"
            onClick={() => onWebSearchChange?.(!webSearchEnabled)}
          >
            <Globe className={cn("h-4 w-4", webSearchEnabled ? "text-primary" : "opacity-60")} />
            <span>Search</span>
          </button>

          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            aria-label="Attach file"
            onClick={handleAttachClick}
          >
            <Paperclip className="h-4 w-4" />
          </button>
        </div>

        <button
          type="submit"
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-all active:scale-95 disabled:opacity-30",
            !value.trim() && internalAttachments.length === 0 && "bg-muted text-muted-foreground"
          )}
          disabled={disabled || (!value.trim() && internalAttachments.length === 0)}
          aria-label={submitLabel}
        >
          <SendHorizontal className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}
