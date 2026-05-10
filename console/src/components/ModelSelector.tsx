import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useEffect, useMemo, useState } from "react";
import { Brain, Check, ChevronDown, Cpu, Globe, Search, Settings2, Sparkles, Terminal, Zap } from "lucide-react";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

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

export function ModelSelector({ value, onChange }: Props) {
  const [models, setModels] = useState<Model[]>([]);

  useEffect(() => {
    const modelUrls = ["/api/console/models"];
    if (API_BASE) {
      modelUrls.push(`${API_BASE}/api/console/models`);
    }

    (async () => {
      for (const url of modelUrls) {
        try {
          const response = await fetch(url);
          if (!response.ok) {
            continue;
          }

          const data = (await response.json()) as { models: Model[] };
          if (data.models?.length) {
            setModels(data.models);
            if (!data.models.some((model) => model.id === value)) {
              onChange(data.models[0].id);
            }
            return;
          }
        } catch {
          // Try next URL.
        }
      }
    })();
  }, [onChange, value]);

  const groupedModels = useMemo(() => {
    return models.reduce<Record<string, Model[]>>((accumulator, model) => {
      const category = model.category || "Other";
      if (!accumulator[category]) {
        accumulator[category] = [];
      }
      accumulator[category].push(model);
      return accumulator;
    }, {});
  }, [models]);

  const activeModel = models.find((model) => model.id === value);
  const activeCategory = activeModel?.category || "Other";
  const activeModelLabel = activeModel ? formatDisplayLabel(activeModel.label) : "Model";

  if (!models.length) return null;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1 rounded-lg bg-transparent px-1.5 text-[12px] font-medium text-muted-foreground transition-all hover:bg-muted/40 hover:text-foreground group active:scale-95"
          aria-label="Select model"
          title="Select model"
        >
          <div className="flex h-3.5 w-3.5 items-center justify-center opacity-70 group-hover:opacity-100 transition-opacity">
            {CATEGORY_ICONS[activeCategory] || <Settings2 className="h-3.5 w-3.5" />}
          </div>
          <span className="hidden sm:inline max-w-28 truncate">{activeModelLabel}</span>
          <span className="sm:hidden text-xs">Model</span>
          <ChevronDown className="h-3 w-3 opacity-40 group-hover:opacity-70 transition-opacity" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={8}
          align="start"
          className="z-50 max-h-[70vh] min-w-56 overflow-y-auto rounded-xl border bg-popover/98 p-1 shadow-lg backdrop-blur-md animate-in fade-in zoom-in-95"
        >
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
                  <DropdownMenu.Item
                    key={option.id}
                    onSelect={() => onChange(option.id)}
                    className={`flex cursor-pointer items-center justify-between rounded-md px-2.5 py-1.5 text-[13px] outline-none transition-all hover:bg-accent hover:text-accent-foreground ${selected ? "bg-primary/10 text-primary font-medium shadow-2xs" : ""}`}
                  >
                    <span className="truncate">{formatDisplayLabel(option.label)}</span>
                    {selected && <Check className="ml-2 h-3.5 w-3.5 shrink-0" />}
                  </DropdownMenu.Item>
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
