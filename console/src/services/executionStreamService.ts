export type StreamEvent =
  | { type: 'run_started'; runId: string }
  | { type: 'text'; content: string }
  | { type: 'tool_start'; tool: string; params: any }
  | { type: 'tool_result'; tool: string; result: any }
  | { type: 'destructive_confirm'; approvalId: string; message: string; tool?: string; params?: any }
  | { type: 'done' }
  | { type: 'error'; message: string };

export const startExecutionStream = (
  command: string,
  onEvent: (event: StreamEvent) => void,
  approvalId?: string
) => {
  const abortController = new AbortController();

  const run = async () => {
    try {
      const response = await fetch('/api/agent/unified/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: command,
          commandMode: 'auto',
          approvalId,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error('Failed to start execution: ' + response.statusText);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));
              onEvent(event);
            } catch (e) {
              console.error('Failed to parse SSE event:', e);
            }
          }
        }
      }
      onEvent({ type: 'done' });
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        onEvent({ type: 'error', message: (err as Error).message });
      }
    }
  };

  run();

  return () => abortController.abort();
};
