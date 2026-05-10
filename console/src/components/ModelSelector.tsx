import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useEffect, useMemo, useState } from "react";
import { Brain, Check, ChevronDown, Cpu, Globe, Search, Settings2, Sparkles, Terminal, Zap } from "lucide-react";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";
const ENABLED_MODELS_STORAGE_KEY = "console_enabled_models_v1";

interface Model {
  id: string;
  label: string;
  category?: string;
}

interface Props {
  value: string;
  onChange: (modelId: string) => void;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Presets: <Sparkles className="h-3.5 w-3.5" />,
  Search: <Search className="h-3.5 w-3.5" />,
  Anthropic: <Brain className="h-3.5 w-3.5" />,
  OpenAI: <Zap className="h-3.5 w-3.5" />,
  Google: <Globe className="h-3.5 w-3.5" />,
  xAI: <Terminal className="h-3.5 w-3.5" />,
  Local: <Cpu className="h-3.5 w-3.5" />,
  Perplexity: <Search className="h-3.5 w-3.5" />,
};

const formatDisplayLabel = (label: string) => label.replace(/\s+/g, " ").trim();

function loadEnabledModelIds(): string[] | null {
  try {
    const raw = localStorage.getItem(ENABLED_MODELS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return null;
  }
}

function persistEnabledModelIds(ids: string[]) {
  try {
    localStorage.setItem(ENABLED_MODELS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // no-op
  }
}

export function ModelSelector({ value, onChange }: Props) {
  const [models, setModels] = useState<Model[]>([]);
  const [enabledModelIds, setEnabledModelIds] = useState<string[]>([]);

  useEffect(() => {
    const modelUrls = ["/api/console/models"];
    if (API_BASE) {
      modelUrls.push(`${API_BASE}/api/console/models`);
    }

    (async () => {
      for (const url of modelUrls) {
        try {
          const response = await fetch(url);
          if (!response.ok) continue;

          const data = (await response.json()) as { models: Model[] };
          if (!data.models?.length) continue;

          const availableIds = new Set(data.models.map((model) => model.id));
          const storedIds = loadEnabledModelIds();
          const initialEnabled = storedIds?.filter((id) => availableIds.has(id)) ?? data.models.map((model) => model.id);
          const nextEnabled = initialEnabled.length > 0 ? initialEnabled : data.models.map((model) => model.id);

          setModels(data.models);
          setEnabledModelIds(nextEnabled);
          persistEnabledModelIds(nextEnabled);

          if (!nextEnabled.includes(value)) {
            onChange(nextEnabled[0]);
          }
          return;
        } catch {
          // Try next URL.
        }
      }
    })();
  }, [onChange, value]);

  const enabledModels = useMemo(() => {
    const enabledSet = new Set(enabledModelIds);
    return models.filter((model) => enabledSet.has(model.id));
  }, [enabledModelIds, models]);

  const groupedModels = useMemo(() => {
    return enabledModels.reduce<Record<string, Model[]>>((accumulator, model) => {
      const category = model.category || "Other";
      if (!accumulator[category]) {
        accumulator[category] = [];
      }
      accumulator[category].push(model);
      return accumulator;
    }, {});
  }, [enabledModels]);

  const activeModel = enabledModels.find((model) => model.id === value) ?? enabledModels[0];
  const activeModelLabel = activeModel ? formatDisplayLabel(activeModel.label) : "Model";

  const setEnabledIds = (ids: string[]) => {
    setEnabledModelIds(ids);
    persistEnabledModelIds(ids);
  };

  const handleToggleModel = (id: string, checked: boolean | "indeterminate") => {
    const isChecked = checked === true;
    const currentlyEnabled = new Set(enabledModelIds);

    if (isChecked) {
      currentlyEnabled.add(id);
    } else {
      if (enabledModelIds.length <= 1) {
        return;
      }
      currentlyEnabled.delete(id);
    }

    const nextEnabled = models
      .map((model) => model.id)
      .filter((modelId) => currentlyEnabled.has(modelId));

    setEnabledIds(nextEnabled);

    if (!nextEnabled.includes(value)) {
      onChange(nextEnabled[0]);
    } else if (isChecked) {
      onChange(id);
    }
  };

  const handleEnableAll = () => {
    const allIds = models.map((model) => model.id);
    setEnabledIds(allIds);
    if (!allIds.includes(value)) {
      onChange(allIds[0]);
    }
  };

  if (!models.length || !enabledModels.length) return null;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1 rounded-lg bg-transparent px-1.5 text-[12px] font-medium text-muted-foreground transition-all hover:bg-muted/40 hover:text-foreground group active:scale-95"
          aria-label="Model settings"
          title="Model settings"
        >
          <div className="flex h-3.5 w-3.5 items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity">
            <Settings2 className="h-3.5 w-3.5" />
          </div>
          <span className="text-xs font-semibold">Model settings</span>
          <span className="hidden lg:inline max-w-32 truncate text-[11px] text-muted-foreground/80">{activeModelLabel}</span>
          <ChevronDown className="h-3 w-3 opacity-40 group-hover:opacity-70 transition-opacity" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={8}
          align="start"
          className="z-50 max-h-[70vh] min-w-64 overflow-y-auto rounded-xl border bg-popover/98 p-1 shadow-lg backdrop-blur-md animate-in fade-in zoom-in-95"
        >
          <div className="flex items-center justify-between px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/60">
            <span>Enabled models</span>
            <button
              type="button"
              className="text-[10px] font-semibold text-primary hover:underline"
              onClick={(event) => {
                event.preventDefault();
                handleEnableAll();
              }}
            >
              Enable all
            </button>
          </div>

          {Object.entries(groupedModels).map(([category, options]) => (
            <div key={category} className="py-0.5 first:pt-0.5">
              <div className="flex items-center gap-1.5 px-2.5 pb-1 pt-0.5">
                <div className="text-muted-foreground/40">
                  {CATEGORY_ICONS[category] || <Cpu className="h-3 w-3" />}
                </div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50">{category}</p>
              </div>
              {options.map((option) => {
                const selected = value === option.id;
                return (
                  <DropdownMenu.CheckboxItem
                    key={option.id}
                    checked={enabledModelIds.includes(option.id)}
                    onCheckedChange={(checked) => handleToggleModel(option.id, checked)}
                    className={`relative flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] outline-none transition-all hover:bg-accent hover:text-accent-foreground ${selected ? "bg-primary/10 text-primary font-medium shadow-2xs" : ""}`}
                  >
                    <DropdownMenu.ItemIndicator className="inline-flex h-3.5 w-3.5 items-center justify-center text-primary">
                      <Check className="h-3.5 w-3.5" />
                    </DropdownMenu.ItemIndicator>
                    <span className="truncate">{formatDisplayLabel(option.label)}</span>
                    {selected && <span className="ml-auto text-[10px] uppercase tracking-wide opacity-70">Active</span>}
                  </DropdownMenu.CheckboxItem>
                );
              })}
              <div className="mx-1.5 my-0.5 h-px bg-border/40 last:hidden" />
            </div>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
