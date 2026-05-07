"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Check, Sparkles, Search, Brain, Zap, Globe, Terminal, Cpu, Settings2 } from "lucide-react";
import { useMemo, useState, useEffect, useCallback } from "react";
import { MODELS, getDefaultModel, SearchModelOption, normalizeLegacyModelId } from "@/lib/models";
import { cn, formatDisplayLabel } from "@/lib/utils";

type ModelSelectorProps = {
  model?: string;
  onModelChange?: (model: string) => void;
  modelOptions?: readonly SearchModelOption[];
  autoFilter?: boolean;
  excludeCategories?: string[];
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Presets: <Sparkles className="h-3.5 w-3.5" />,
  Search: <Search className="h-3.5 w-3.5" />,
  Anthropic: <Brain className="h-3.5 w-3.5" />,
  OpenAI: <Zap className="h-3.5 w-3.5" />,
  Google: <Globe className="h-3.5 w-3.5" />,
  xAI: <Terminal className="h-3.5 w-3.5" />,
  Local: <Cpu className="h-3.5 w-3.5" />,
};

export function ModelSelector({
  model = getDefaultModel(),
  onModelChange,
  modelOptions: providedModelOptions,
  autoFilter = true,
  excludeCategories,
}: ModelSelectorProps) {
  const [availableModels, setAvailableModels] = useState<readonly SearchModelOption[]>(
    providedModelOptions || (autoFilter ? [] : MODELS)
  );
  const [hasUserSelectedModel, setHasUserSelectedModel] = useState(false);
  const normalizedModel = normalizeLegacyModelId(model);

  // Load saved default model preference from profile
  useEffect(() => {
    if (hasUserSelectedModel) return;
    fetch("/api/profile")
      .then(r => r.ok ? r.json() as Promise<{ defaultModel?: string | null }> : null)
      .then(profile => {
        if (profile?.defaultModel && !hasUserSelectedModel) {
          onModelChange?.(normalizeLegacyModelId(profile.defaultModel));
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (autoFilter && !providedModelOptions) {
      const controller = new AbortController();
      
      fetch("/api/models", { signal: controller.signal })
        .then(res => res.json())
        .then(data => {
          if (data.models && data.models.length > 0) {
            const filteredModels = excludeCategories && excludeCategories.length > 0
              ? data.models.filter((m: SearchModelOption) => !excludeCategories.includes(m.category))
              : data.models;
            
            // Only update if we actually have models to show
            if (filteredModels.length > 0) {
              setAvailableModels(filteredModels);
            }
            
            const currentModelIsValid = filteredModels.some((m: SearchModelOption) => m.id === normalizedModel);
            const isInitialDefault = normalizedModel === getDefaultModel();

            if (!currentModelIsValid || (!hasUserSelectedModel && isInitialDefault)) {
              const topModel = filteredModels[0]?.id;
              if (topModel && topModel !== normalizedModel) {
                onModelChange?.(topModel);
              }
            }
          }
        })
        .catch(err => {
          if (err.name !== "AbortError") {
            console.error("Failed to fetch available models:", err);
          }
        });

      return () => controller.abort();
    }
  }, [autoFilter, providedModelOptions, normalizedModel, onModelChange, hasUserSelectedModel, excludeCategories]);

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

  const activeModel = modelOptions.find((item) => item.id === normalizedModel)
    ?? modelOptions.find((item) => normalizeLegacyModelId(item.id) === normalizedModel);
  const activeModelLabel = activeModel ? formatDisplayLabel(activeModel.label) : formatDisplayLabel(normalizedModel);

  const handleModelSelect = useCallback((id: string) => {
    setHasUserSelectedModel(true);
    onModelChange?.(id);
    // Persist preference to DB in the background
    fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultModel: id }),
    }).catch(() => undefined);
  }, [onModelChange, setHasUserSelectedModel]);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-transparent px-2 text-[13px] font-medium text-muted-foreground transition-all hover:bg-muted/50 hover:text-foreground group active:scale-95"
          aria-label="Select model"
        >
          <div className="flex h-4 w-4 items-center justify-center opacity-70 group-hover:opacity-100 transition-opacity">
            {activeModel ? (CATEGORY_ICONS[activeModel.category] || <Cpu className="h-3.5 w-3.5" />) : <Settings2 className="h-3.5 w-3.5" />}
          </div>
          <span className="hidden sm:inline max-w-32 truncate">{activeModelLabel}</span>
          <span className="sm:hidden text-xs">Model</span>
          <ChevronDown className="h-3 w-3 opacity-40 group-hover:opacity-70 transition-opacity" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={8}
          align="start"
          className="z-50 max-h-[80vh] min-w-64 overflow-y-auto rounded-2xl border bg-popover/98 p-1.5 shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95 data-[side=bottom]:slide-in-from-top-2"
        >
          {Object.keys(groupedModels).length === 0 && (
            <div className="py-4 px-3 text-center text-xs text-muted-foreground">
              No models available
            </div>
          )}
          {Object.entries(groupedModels).map(([category, options]) => (
            <div key={category} className="py-1 first:pt-0.5">
              <div className="flex items-center gap-2 px-3 pb-1.5 pt-1">
                <div className="text-muted-foreground/40">
                  {CATEGORY_ICONS[category] || <Cpu className="h-3 w-3" />}
                </div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">{category}</p>
              </div>
              {options.map((option) => (
                <DropdownMenu.Item
                  key={option.id}
                  onSelect={() => handleModelSelect(option.id)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm outline-none transition-all hover:bg-accent hover:text-accent-foreground",
                    (normalizedModel === option.id || normalizeLegacyModelId(option.id) === normalizedModel) && "bg-primary/10 text-primary font-medium shadow-2xs"
                  )}
                >
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">{formatDisplayLabel(option.label)}</span>
                    {option.id !== option.label && !option.id.endsWith(option.label) && (
                      <span aria-hidden="true" className="truncate text-[10px] font-mono opacity-50">{option.id.split('/').pop()}</span>
                    )}
                  </div>
                  {(normalizedModel === option.id || normalizeLegacyModelId(option.id) === normalizedModel) && (
                    <Check className="ml-2 h-3.5 w-3.5 shrink-0" />
                  )}
                </DropdownMenu.Item>
              ))}
              <div className="mx-2 my-1 h-px bg-border/40 last:hidden" />
            </div>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
