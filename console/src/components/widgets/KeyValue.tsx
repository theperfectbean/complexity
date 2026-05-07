interface Props {
  data: unknown;
}

export function KeyValue({ data }: Props) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return <p style={{ margin: 0, fontSize: '0.75rem', color: '#718096' }}>No data</p>;
  }
  const pairs = Object.entries(data as Record<string, unknown>);
  if (pairs.length === 0) {
    return <p style={{ margin: 0, fontSize: '0.75rem', color: '#718096' }}>Empty</p>;
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: '1rem', rowGap: '0.375rem' }}>
      {pairs.map(([k, v], i) => (
        <>
          <span key={`k${i}`} style={{ fontSize: '0.75rem', fontWeight: 500, color: '#718096', whiteSpace: 'nowrap' }}>{k}</span>
          <span key={`v${i}`} style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#e2e8f0', wordBreak: 'break-all' }}>{String(v)}</span>
        </>
      ))}
    </div>
  );
}
