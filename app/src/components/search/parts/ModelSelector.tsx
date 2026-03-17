"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { MODELS, getDefaultModel } from "@/lib/models";
import { cn } from "@/lib/utils";

export type SearchModelOption = {
  id: string;
  label: string;
  category: string;
  isPreset: boolean;
};

type ModelSelectorProps = {
  model?: string;
  onModelChange?: (model: string) => void;
  modelOptions?: readonly SearchModelOption[];
  autoFilter?: boolean;
};

export function ModelSelector({
  model = getDefaultModel(),
  onModelChange,
  modelOptions: providedModelOptions,
  autoFilter = true,
}: ModelSelectorProps) {
  const [availableModels, setAvailableModels] = useState<readonly SearchModelOption[]>(providedModelOptions || MODELS);
  const [hasUserSelectedModel, setHasUserSelectedModel] = useState(false);

  useEffect(() => {
    if (autoFilter && !providedModelOptions) {
      fetch("/api/models")
        .then(res => res.json())
        .then(data => {
          if (data.models && data.models.length > 0) {
            setAvailableModels(data.models);
            
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

  const handleModelSelect = (id: string) => {
    setHasUserSelectedModel(true);
    onModelChange?.(id);
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1 rounded-xl bg-transparent px-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          aria-label="Select model"
        >
          <span className="hidden sm:inline max-w-32 truncate">{activeModelLabel}</span>
          <span className="sm:hidden">Model</span>
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
  );
}
