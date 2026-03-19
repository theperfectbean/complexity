"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown } from "lucide-react";
import { useMemo, useState, useEffect, useCallback } from "react";
import { MODELS, getDefaultModel, SearchModelOption } from "@/lib/models";
import { cn } from "@/lib/utils";

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

  // Load saved default model preference from profile
  useEffect(() => {
    if (hasUserSelectedModel) return;
    fetch("/api/profile")
      .then(r => r.ok ? r.json() as Promise<{ defaultModel?: string | null }> : null)
      .then(profile => {
        if (profile?.defaultModel && !hasUserSelectedModel) {
          onModelChange?.(profile.defaultModel);
        }
      })
      .catch(() => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleModelSelect = useCallback((id: string) => {
    setHasUserSelectedModel(true);
    onModelChange?.(id);
    // Persist preference to DB in the background
    fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultModel: id }),
    }).catch(() => undefined);
  }, [onModelChange]);

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
