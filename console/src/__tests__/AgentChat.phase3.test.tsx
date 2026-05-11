import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { AgentChat } from '@/components/AgentChat';
import * as api from '@/lib/api';

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderChat(props?: Partial<ComponentProps<typeof AgentChat>>) {
  return render(
    <AgentChat
      initialContext=""
      onContextUsed={() => {}}
      {...props}
    />,
  );
}

describe('AgentChat Phase 3 behavior', () => {
  it('syncs the selected model when /model emits a user-initiated model_switched event', async () => {
    const onModelSwitch = vi.fn();

    vi.spyOn(api, 'streamAgentRun').mockImplementation(
      (_msg, _model, onEvent) => {
        queueMicrotask(() => {
          onEvent({
            type: 'model_switched',
            from: 'perplexity/sonar',
            to: 'openai/gpt-4o-mini',
            reason: 'User switched via /model gpt-4o-mini',
          });
        });
      },
    );

    renderChat({ onModelSwitch });

    await userEvent.type(screen.getByTestId('message-input'), '/model gpt-4o-mini');
    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
      expect(onModelSwitch).toHaveBeenCalledWith('openai/gpt-4o-mini');
    });
    expect(screen.getByTestId('send-btn')).not.toBeDisabled();
  });

  it('releases the UI after /help tool results even if the stream stays open', async () => {
    vi.spyOn(api, 'streamAgentRun').mockImplementation(
      (_msg, _model, onEvent) => {
        queueMicrotask(() => {
          onEvent({
            type: 'tool_result',
            tool: 'help',
            result: {
              ok: true,
              summary: 'Available slash commands',
              widgetHint: { type: 'table' },
              data: { headers: ['Command'], rows: [['/help']] },
            },
          });
        });
      },
    );

    renderChat();

    await userEvent.type(screen.getByTestId('message-input'), '/help');
    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByTestId('send-btn')).not.toBeDisabled();
    });
  });

  it('sends CANCEL with the existing approval id when the cancel button is clicked', async () => {
    const streamSpy = vi.spyOn(api, 'streamAgentRun').mockImplementation(
      (message, _model, onEvent, onDone) => {
        queueMicrotask(() => {
          if (message === 'stop plex') {
            onEvent({
              type: 'destructive_confirm',
              approvalId: 'approval-click-cancel',
              threadId: 'thread-cancel',
              tool: 'pve_stop',
              params: { container: 'plex' },
              message: 'Reply CONFIRM to proceed or CANCEL to abort.',
            });
          }
          onDone();
        });
      },
    );

    renderChat();

    await userEvent.type(screen.getByTestId('message-input'), 'stop plex');
    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(streamSpy).toHaveBeenLastCalledWith(
        'CANCEL',
        'default',
        expect.any(Function),
        expect.any(Function),
        expect.any(Function),
        expect.anything(),
        expect.objectContaining({
          approvalId: 'approval-click-cancel',
          threadId: 'thread-cancel',
        }),
      );
    });
  });
});
