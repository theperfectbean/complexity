interface Task {
  title?: string;
  status?: string;
  description?: string;
  [key: string]: unknown;
}

interface Props {
  data: unknown;
}

function parseTasks(data: unknown): Task[] {
  if (Array.isArray(data)) return data as Task[];
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.steps)) return d.steps as Task[];
    if (Array.isArray(d.tasks)) return d.tasks as Task[];
  }
  return [];
}

const ICON: Record<string, string> = {
  done: '✓', success: '✓',
  failed: '✗', error: '✗',
  running: '⟳',
  pending: '○',
};

const COLOR: Record<string, string> = {
  done: '#22c55e', success: '#22c55e',
  failed: '#ef4444', error: '#ef4444',
  running: '#a78bfa',
  pending: '#718096',
};

export function TaskStatus({ data }: Props) {
  const tasks = parseTasks(data);
  if (tasks.length === 0) {
    return <p style={{ margin: 0, fontSize: '0.75rem', color: '#718096' }}>No tasks</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {tasks.map((task, i) => {
        const st = task.status ?? 'pending';
        const color = COLOR[st] ?? '#718096';
        const icon = ICON[st] ?? '○';
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem' }}>
            <span style={{ marginTop: '0.1rem', fontSize: '0.85rem', color, flexShrink: 0 }}>{icon}</span>
            <div>
              <p style={{ margin: 0, fontSize: '0.825rem' }}>{task.title ?? `Task ${i + 1}`}</p>
              {task.description && (
                <p style={{ margin: '0.125rem 0 0', fontSize: '0.7rem', color: '#718096' }}>{task.description}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
