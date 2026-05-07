import { useState } from 'react';

interface Props {
  data: unknown;
}

function parseRows(data: unknown): { headers: string[]; rows: string[][] } {
  if (!Array.isArray(data) || data.length === 0) return { headers: [], rows: [] };
  const first = data[0];
  if (typeof first !== 'object' || first === null) return { headers: [], rows: [] };
  const headers = Object.keys(first);
  const rows = (data as Record<string, unknown>[]).map(item =>
    headers.map(h => String(item[h] ?? '')),
  );
  return { headers, rows };
}

export function DataTable({ data }: Props) {
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const { headers, rows } = parseRows(data);

  if (headers.length === 0) {
    return <p style={{ margin: 0, fontSize: '0.75rem', color: '#718096' }}>No data</p>;
  }

  const sorted =
    sortCol !== null
      ? [...rows].sort((a, b) => {
          const valA = a[sortCol] ?? '';
          const valB = b[sortCol] ?? '';
          const cmp = valA.localeCompare(valB);
          return sortAsc ? cmp : -cmp;
        })
      : rows;

  const handleSort = (i: number) => {
    if (sortCol === i) setSortAsc(a => !a);
    else { setSortCol(i); setSortAsc(true); }
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                onClick={() => handleSort(i)}
                style={{ cursor: 'pointer', padding: '0.375rem 0.5rem', textAlign: 'left', fontWeight: 600, color: '#a78bfa', borderBottom: '1px solid #2d3748' }}
              >
                {h}{sortCol === i ? (sortAsc ? ' ↑' : ' ↓') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #1a2030' }}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: '0.375rem 0.5rem', fontFamily: 'monospace', color: '#a0aec0' }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
