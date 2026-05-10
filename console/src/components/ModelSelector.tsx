import { useEffect, useState } from 'react';
import { ChevronDown, Brain } from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

interface Model { id: string; label: string; }

interface Props {
  value: string;
  onChange: (modelId: string) => void;
}

export function ModelSelector({ value, onChange }: Props) {
  const [models, setModels] = useState<Model[]>([]);

  useEffect(() => {
    const modelUrls = ['/api/console/models'];
    if (API_BASE) {
      modelUrls.push(`${API_BASE}/api/console/models`);
    }

    (async () => {
      for (const url of modelUrls) {
        try {
          const r = await fetch(url);
          if (!r.ok) {
            continue;
          }

          const d = (await r.json()) as { models: Model[] };
          if (d.models?.length) {
            setModels(d.models);
            if (!d.models.some((m) => m.id === value)) {
              onChange(d.models[0].id);
            }
            return;
          }
        } catch {
          // try next URL
        }
      }
    })();
  }, [onChange, value]);

  if (!models.length) return null;

  return (
    <div className='relative flex items-center'>
      <div className='absolute left-2.5 pointer-events-none text-primary opacity-70'>
        <Brain size={14} />
      </div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className='appearance-none text-[0.75rem] pl-8 pr-8 py-1.5 rounded-lg border border-border bg-sidebar text-muted-foreground cursor-pointer outline-none max-w-[180px] hover:bg-foreground/5 transition-colors font-medium focus:border-primary/50'
        title='Select model'
      >
        {models.map(m => (
          <option key={m.id} value={m.id}>{m.label}</option>
        ))}
      </select>
      <div className='absolute right-2.5 pointer-events-none text-muted-foreground opacity-50'>
        <ChevronDown size={12} />
      </div>
    </div>
  );
}
