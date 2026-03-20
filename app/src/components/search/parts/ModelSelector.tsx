"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Check, Sparkles, Search, Brain, Zap, Globe, Terminal, Cpu, Settings2 } from "lucide-react";
import { useMemo, useState, useEffect, useCallback } from "react";
import { MODELS, getDefaultModel, SearchModelOption } from "@/lib/models";
import { cn } from "@/lib/utils";

type ModelSelectorProps = {
  model?: string;
  onModelChange?: (model: string) => void;
  modelOptions?: readonly SearchModelOption[];
  autoFilter?: boolean;
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Presets: <Sparkles className="h-3.5 w-3.5" />,
  Perplexity: <Search className="h-3.5 w-3.5" />,
  Anthropic: <Brain className="h-3.5 w-3.5" />,
  OpenAI: <Zap className="h-3.5 w-3.5" />,
  Google: <Globe className="h-3.5 w-3.5" />,
  xAI: <Terminal className="h-3.5 w-3.5" />,
  Local: <Cpu className="h-3.5 w-3.5" />,
};

function formatDisplayLabel(label: string): string {
  // If it's a raw ID-like string (contains / or nhiều -), clean it up
  if (label.includes("/") || (label.match(/-/g) || []).length > 2) {
    const parts = label.split("/");
    const lastPart = parts[parts.length - 1];
    return lastPart
      .replace(/-/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase())
      .replace(/Gpt/g, "GPT")
      .replace(/Llama/g, "Llama")
      .replace(/Mistral/g, "Mistral");
  }
  return label;
}

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

  const activeModel = modelOptions.find((item) => item.id === model);
  const activeModelLabel = activeModel ? formatDisplayLabel(activeModel.label) : model;

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
                    model === option.id && "bg-primary/10 text-primary font-medium shadow-2xs"
                  )}
                >
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">{formatDisplayLabel(option.label)}</span>
                    {option.id !== option.label && !option.id.endsWith(option.label) && (
                      <span className="truncate text-[10px] font-mono opacity-50">{option.id.split('/').pop()}</span>
                    )}
                  </div>
                  {model === option.id && (
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
