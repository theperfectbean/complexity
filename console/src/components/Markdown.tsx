import type { ReactNode } from 'react';

interface Props {
  text: string;
}

export function Markdown({ text }: Props) {
  const elements: ReactNode[] = [];
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={elements.length} style={{ margin: '0.375rem 0', overflowX: 'auto', borderRadius: '0.5rem', padding: '0.75rem', fontSize: '0.7rem', fontFamily: 'monospace', background: '#0d1117', color: '#a0aec0' }}>
          {lang && <span style={{ display: 'block', fontSize: '0.6rem', color: '#7c3aed', marginBottom: '0.375rem' }}>{lang}</span>}
          {codeLines.join('\n')}
        </pre>,
      );
      i++; // skip closing ```
      continue;
    }

    // Headers
    const h3 = line.match(/^### (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h1 = line.match(/^# (.+)/);
    if (h1) { elements.push(<h1 key={elements.length} style={{ margin: '0.375rem 0 0.25rem', fontSize: '1rem', fontWeight: 700 }}>{inline(h1[1])}</h1>); i++; continue; }
    if (h2) { elements.push(<h2 key={elements.length} style={{ margin: '0.375rem 0 0.25rem', fontSize: '0.9rem', fontWeight: 600 }}>{inline(h2[1])}</h2>); i++; continue; }
    if (h3) { elements.push(<h3 key={elements.length} style={{ margin: '0.25rem 0', fontSize: '0.85rem', fontWeight: 600 }}>{inline(h3[1])}</h3>); i++; continue; }

    // Unordered list (collect consecutive)
    if (/^[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={elements.length} style={{ margin: '0.25rem 0', paddingLeft: '1.25rem' }}>
          {items.map((item, j) => <li key={j} style={{ fontSize: '0.825rem', lineHeight: 1.5 }}>{inline(item)}</li>)}
        </ul>,
      );
      continue;
    }

    // Ordered list
    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, ''));
        i++;
      }
      elements.push(
        <ol key={elements.length} style={{ margin: '0.25rem 0', paddingLeft: '1.25rem' }}>
          {items.map((item, j) => <li key={j} style={{ fontSize: '0.825rem', lineHeight: 1.5 }}>{inline(item)}</li>)}
        </ol>,
      );
      continue;
    }

    // Blank line
    if (!line.trim()) {
      elements.push(<br key={elements.length} />);
      i++;
      continue;
    }

    // Paragraph
    elements.push(<p key={elements.length} style={{ margin: '0.125rem 0', fontSize: '0.825rem', lineHeight: 1.6 }}>{inline(line)}</p>);
    i++;
  }

  return <div>{elements}</div>;
}

function inline(text: string): ReactNode {
  const parts: ReactNode[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const raw = m[0];
    if (raw.startsWith('`')) {
      parts.push(<code key={m.index} style={{ borderRadius: '0.25rem', padding: '0.1rem 0.3rem', fontFamily: 'monospace', fontSize: '0.75rem', background: '#0d1117', color: '#a78bfa' }}>{raw.slice(1, -1)}</code>);
    } else if (raw.startsWith('**')) {
      parts.push(<strong key={m.index}>{raw.slice(2, -2)}</strong>);
    } else {
      parts.push(<em key={m.index}>{raw.slice(1, -1)}</em>);
    }
    last = m.index + raw.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length > 0 ? <>{parts}</> : text;
}
