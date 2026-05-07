import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface Props {
  data: unknown;
}

function extract(data: unknown): { text: string; exitCode?: number } {
  if (typeof data === 'string') return { text: data };
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    const text = [d.output, d.stdout, d.rawSnippet, d.raw, d.text]
      .find((v): v is string => typeof v === 'string')
      ?? JSON.stringify(data, null, 2);
    const exitCode = typeof d.exitCode === 'number' ? d.exitCode : undefined;
    return { text, exitCode };
  }
  return { text: String(data) };
}

export function CommandResult({ data }: Props) {
  const [copied, setCopied] = useState(false);
  const { text, exitCode } = extract(data);

  const handleCopy = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: '0.25rem', gap: '0.5rem' }}>
        {exitCode !== undefined && (
          <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '0.1rem 0.375rem', borderRadius: '0.25rem', color: exitCode === 0 ? '#22c55e' : '#ef4444', background: exitCode === 0 ? '#052e16' : '#450a0a' }}>
            exit {exitCode}
          </span>
        )}
        <button
          onClick={handleCopy}
          title="Copy"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', color: '#718096', display: 'flex', alignItems: 'center' }}
        >
          {copied ? <Check size={12} style={{ color: '#22c55e' }} /> : <Copy size={12} />}
        </button>
      </div>
      <pre style={{ margin: 0, maxHeight: '16rem', overflowY: 'auto', borderRadius: '0.5rem', padding: '0.75rem', fontSize: '0.7rem', fontFamily: 'monospace', background: '#0d1117', color: '#a0aec0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {text}
      </pre>
    </div>
  );
}
