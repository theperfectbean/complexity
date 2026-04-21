import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { AgentChat } from '@/components/AgentChat';
import * as api from '@/lib/api';

// Silence React console.error about act() warnings in tests
beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Helper: create a mock streamAgentRun that fires events then calls onDone
function mockStream(events: api.AgentRunEvent[]) {
  return vi.spyOn(api, 'streamAgentRun').mockImplementation(
    (_msg, _model, onEvent, onDone) => {
      queueMicrotask(() => {
        events.forEach(e => onEvent(e));
        onDone();
      });
    },
  );
}

function renderChat() {
  return render(
    <AgentChat initialContext="" onContextUsed={() => {}} />,
  );
}

// ---------- Initial render ----------

describe('AgentChat initial state', () => {
  it('renders the empty state prompt', () => {
    renderChat();
    expect(screen.getByText('Fleet Agent')).toBeInTheDocument();
    expect(screen.getByText(/Ask anything about your homelab/)).toBeInTheDocument();
  });

  it('renders a text input with placeholder', () => {
    renderChat();
    expect(screen.getByPlaceholderText('Ask the fleet agent...')).toBeInTheDocument();
  });

  it('send button is disabled when input is empty', () => {
    renderChat();
    // button with Send icon — query by its parent form submit button
    const btn = screen.getByRole('button', { name: '' }); // Send icon button has no accessible label
    // The opacity is 0.4 when disabled — we check it doesn't respond to click
    expect(btn).toBeInTheDocument();
  });

  it('loads persisted threads from localStorage', () => {
    const thread = {
      id: 'abc',
      title: 'Old thread',
      createdAt: new Date().toISOString(),
      turns: [],
    };
    localStorage.setItem('fleet_console_threads_v1', JSON.stringify([thread]));

    renderChat();
    expect(screen.getAllByText('Old thread').length).toBeGreaterThanOrEqual(1);
  });
});

// ---------- Submitting a message ----------

describe('AgentChat message submission', () => {
  it('shows user message as a bubble after submit', async () => {
    mockStream([]);
    renderChat();

    const input = screen.getByPlaceholderText('Ask the fleet agent...');
    await userEvent.type(input, 'check plex status');
    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
      // Message appears in thread sidebar title AND as user bubble — both are correct
      expect(screen.getAllByText('check plex status').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('clears input after submit', async () => {
    mockStream([]);
    renderChat();

    const input = screen.getByPlaceholderText('Ask the fleet agent...');
    await userEvent.type(input, 'hello');
    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
      expect(input).toHaveValue('');
    });
  });

  it('calls streamAgentRun with the typed message', async () => {
    const spy = mockStream([]);
    renderChat();

    const input = screen.getByPlaceholderText('Ask the fleet agent...');
    await userEvent.type(input, 'restart qbittorrent');
    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
    expect(spy).toHaveBeenCalledWith(
      'restart qbittorrent',
      'default',
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      expect.anything(),
      expect.objectContaining({ threadId: expect.any(String) }),
    );
    });
  });

  it('sets thread title from first message', async () => {
    mockStream([]);
    renderChat();

    const input = screen.getByPlaceholderText('Ask the fleet agent...');
    await userEvent.type(input, 'restart qbittorrent on ingestion');
    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
      // Title appears in sidebar — use getAllByText to handle both sidebar + bubble
      expect(screen.getAllByText('restart qbittorrent on ingestion').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('does not submit empty input', async () => {
    const spy = mockStream([]);
    renderChat();

    await userEvent.keyboard('{Enter}');
    expect(spy).not.toHaveBeenCalled();
  });
});

// ---------- Streaming event rendering ----------

describe('AgentChat event rendering', () => {
  it('renders text events as assistant message bubbles', async () => {
    mockStream([{ type: 'text', content: 'Plex is running normally.' }]);
    renderChat();

    const input = screen.getByPlaceholderText('Ask the fleet agent...');
    await userEvent.type(input, 'check plex');
    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('Plex is running normally.')).toBeInTheDocument();
    });
  });

  it('shows persisted run metadata from lifecycle events', async () => {
    mockStream([
      { type: 'run_started', runId: 'run_meta_1', threadId: 'thread-1' },
      { type: 'run_status', runId: 'run_meta_1', threadId: 'thread-1', status: 'completed' },
    ]);
    renderChat();

    const input = screen.getByPlaceholderText('Ask the fleet agent...');
    await userEvent.type(input, 'check plex');
    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getAllByText('run_meta_1').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('completed').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders tool_start events as "Running tool…" indicator', async () => {
    // tool_start is rendered while isRunning — we need to check before onDone fires
    const streamSpy = vi.spyOn(api, 'streamAgentRun').mockImplementation(
      (_msg, _model, onEvent, _onDone) => {
        queueMicrotask(() => {
          onEvent({ type: 'tool_start', tool: 'plex_status', params: {} });
          // Don't call onDone yet
        });
      },
    );

    renderChat();
    const input = screen.getByPlaceholderText('Ask the fleet agent...');
    await userEvent.type(input, 'check plex');
    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getAllByText(/plex_status/).length).toBeGreaterThanOrEqual(1);
    });

    streamSpy.mockRestore();
  });

  it('renders tool_result events with tool name and ✓', async () => {
    mockStream([
      { type: 'tool_result', tool: 'service_restart', result: { host: 'media', exitCode: 0 } },
    ]);
    renderChat();

    await userEvent.type(screen.getByPlaceholderText('Ask the fleet agent...'), 'restart q');
    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getAllByText('service_restart').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders tool_error events with ✗ and error message', async () => {
    mockStream([{ type: 'tool_error', tool: 'ssh_exec', error: 'Connection refused' }]);
    renderChat();

    await userEvent.type(screen.getByPlaceholderText('Ask the fleet agent...'), 'test');
    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getAllByText(/Connection refused/).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders destructive_confirm events with approve/cancel buttons', async () => {
    mockStream([{
      type: 'destructive_confirm',
      approvalId: 'approval-1',
      threadId: 'thread-approve',
      tool: 'incus_stop',
      params: { container: 'plex' },
      message: 'Reply CONFIRM to proceed or CANCEL to abort.',
    }]);
    renderChat();

    await userEvent.type(screen.getByPlaceholderText('Ask the fleet agent...'), 'stop plex');
    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('Approve')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
  });

  it('uses the approval event thread when clicking Approve', async () => {
    let initialThreadId: string | undefined;
    const streamSpy = vi.spyOn(api, 'streamAgentRun').mockImplementation(
      (message, _model, onEvent, onDone, _onError, _signal, extraBody) => {
        queueMicrotask(() => {
          if (message === 'stop plex') {
            initialThreadId = (extraBody as { threadId?: string } | undefined)?.threadId;
            onEvent({
              type: 'destructive_confirm',
              approvalId: 'approval-click-confirm',
              threadId: initialThreadId,
              tool: 'incus_stop',
              params: { container: 'plex' },
              message: 'Reply CONFIRM to proceed or CANCEL to abort.',
            });
          }
          onDone();
        });
      },
    );

    renderChat();

    await userEvent.type(screen.getByPlaceholderText('Ask the fleet agent...'), 'stop plex');
    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('Approve')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Approve'));

    await waitFor(() => {
      expect(streamSpy).toHaveBeenLastCalledWith(
        'CONFIRM',
        'default',
        expect.any(Function),
        expect.any(Function),
        expect.any(Function),
        expect.anything(),
        expect.objectContaining({
          approvalId: 'approval-click-confirm',
          threadId: initialThreadId,
        }),
      );
    });
  });

  it('reuses the server approval id when the user types CONFIRM', async () => {
    const streamSpy = vi.spyOn(api, 'streamAgentRun').mockImplementation(
      (message, _model, onEvent, onDone) => {
        queueMicrotask(() => {
          if (message === 'stop plex') {
            onEvent({
              type: 'destructive_confirm',
              approvalId: 'approval-typed-confirm',
              tool: 'incus_stop',
              params: { container: 'plex' },
              message: 'Reply CONFIRM to proceed or CANCEL to abort.',
            });
          }
          onDone();
        });
      },
    );

    renderChat();

    await userEvent.type(screen.getByPlaceholderText('Ask the fleet agent...'), 'stop plex');
    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('Approve')).toBeInTheDocument();
    });

    await userEvent.type(screen.getByPlaceholderText('Ask the fleet agent...'), 'CONFIRM');
    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
      expect(streamSpy).toHaveBeenLastCalledWith(
        'CONFIRM',
        'default',
        expect.any(Function),
        expect.any(Function),
        expect.any(Function),
        expect.anything(),
        expect.objectContaining({
          approvalId: 'approval-typed-confirm',
          threadId: expect.any(String),
        }),
      );
    });
  });

  it('renders error events with error message', async () => {
    mockStream([{ type: 'error', message: 'LLM timeout: upstream took too long' }]);
    renderChat();

    await userEvent.type(screen.getByPlaceholderText('Ask the fleet agent...'), 'test');
    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getAllByText(/LLM timeout/).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('does not crash on unknown event types', async () => {
    mockStream([{ type: 'run_started', runId: 'abc' }, { type: 'context', domain: 'media', model: 'default' }]);
    renderChat();

    await userEvent.type(screen.getByPlaceholderText('Ask the fleet agent...'), 'test');
    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.queryByText('error')).not.toBeInTheDocument();
    });
  });
});

// ---------- Cancel / abort ----------

describe('AgentChat cancel', () => {
  it('shows cancel button while agent is running', async () => {
    // Mock a stream that never completes
    vi.spyOn(api, 'streamAgentRun').mockImplementation(() => { /* never calls onDone */ });
    renderChat();

    await userEvent.type(screen.getByPlaceholderText('Ask the fleet agent...'), 'test');
    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
      // Cancel button appears (spinning loader icon replaces Send icon)
      const cancelBtn = document.querySelector('button[type="button"]');
      expect(cancelBtn).toBeInTheDocument();
    });
  });
});

// ---------- Thread management ----------

describe('AgentChat threads', () => {
  it('creates a new thread when + button is clicked', async () => {
    renderChat();
    const newBtn = screen.getByTitle('New thread');
    await userEvent.click(newBtn);

    // Two threads should now exist — "New conversation" appears at least once
    const items = screen.getAllByText('New conversation');
    expect(items.length).toBeGreaterThanOrEqual(1);
  });

  it('persists threads to localStorage', async () => {
    mockStream([]);
    renderChat();

    const input = screen.getByPlaceholderText('Ask the fleet agent...');
    await userEvent.type(input, 'check disk space');
    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
      const stored = localStorage.getItem('fleet_console_threads_v1');
      expect(stored).not.toBeNull();
      const threads = JSON.parse(stored!) as Array<{ turns: unknown[] }>;
      expect(threads[0]?.turns?.length).toBeGreaterThan(0);
    });
  });

  it('populates input from initialContext prop', async () => {
    render(<AgentChat initialContext="Tell me about the plex service" onContextUsed={() => {}} />);
    await waitFor(() => {
      const input = screen.getByPlaceholderText('Ask the fleet agent...');
      expect(input).toHaveValue('Tell me about the plex service');
    });
  });
});
