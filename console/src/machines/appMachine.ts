import { createMachine, fromPromise, fromCallback, assign } from 'xstate';
import { fetchTopology, Topology } from '../services/topologyService';
import { StorageData } from '../components/TelemetryDashboard';
import { startExecutionStream, StreamEvent } from '../services/executionStreamService';

export const appMachine = createMachine({
  id: 'app',
  initial: 'initializing',
  context: {
    topology: null as Topology | null,
    error: null as string | null,
    executingTool: false,
    terminalContent: [] as string[],
    telemetryData: null as StorageData[] | null,
    currentCommand: '',
    pendingApproval: null as { approvalId: string; message: string; tool?: string; params?: any } | null,
  },
  states: {
    initializing: {
      after: {
        100: 'fetchingContext'
      }
    },
    fetchingContext: {
      invoke: {
        src: fromPromise(() => fetchTopology()),
        onDone: {
          target: 'idle',
          actions: assign({
            topology: ({ event }) => event.output
          })
        },
        onError: {
          target: 'idle',
          actions: assign({
            error: ({ event }) => (event.error as Error).message
          })
        }
      }
    },
    idle: {
      on: {
        EXECUTE: {
          target: 'executingTool',
          actions: assign({
            executingTool: true,
            currentCommand: ({ event }) => (event as any).command || '',
            terminalContent: [],
            telemetryData: null,
            pendingApproval: null
          })
        }
      }
    },
    executingTool: {
      invoke: {
        src: fromCallback(({ sendBack, input }) => {
          return startExecutionStream(input.command, (event: StreamEvent) => {
            if (event.type === 'text') {
              sendBack({ type: 'TERMINAL_DATA', content: event.content });
            } else if (event.type === 'tool_start') {
              sendBack({ type: 'TERMINAL_DATA', content: '\n[Executing ' + event.tool + '...]\n' });
            } else if (event.type === 'tool_result') {
              sendBack({ type: 'TOOL_RESULT', tool: event.tool, result: event.result });
            } else if (event.type === 'destructive_confirm') {
              sendBack({ type: 'SUDO_REQUIRED', data: event });
            } else if (event.type === 'done') {
              sendBack({ type: 'FINISHED' });
            } else if (event.type === 'error') {
              sendBack({ type: 'ERROR', message: event.message });
            }
          }, input.approvalId);
        }),
        input: ({ context }) => ({ 
          command: context.currentCommand,
          approvalId: context.pendingApproval?.approvalId 
        })
      },
      on: {
        TERMINAL_DATA: {
          actions: assign({
            terminalContent: ({ context, event }) => [...context.terminalContent, (event as any).content]
          })
        },
        TOOL_RESULT: {
          actions: assign({
            telemetryData: ({ event }) => {
              const res = (event as any).result;
              // Detect storage telemetry
              if (res?.nodes && Array.isArray(res.nodes)) {
                return res.nodes.map((n: any) => ({
                  node: n.name,
                  used: Math.round(n.mem * 100), // Mock conversion for visualization
                  total: 100
                }));
              }
              return null;
            }
          })
        },
        SUDO_REQUIRED: {
          target: 'awaitingSudo',
          actions: assign({
            pendingApproval: ({ event }) => (event as any).data
          })
        },
        FINISHED: 'idle',
        ERROR: {
          target: 'idle',
          actions: assign({
            error: ({ event }) => (event as any).message,
            executingTool: false
          })
        }
      }
    },
    awaitingSudo: {
      on: {
        APPROVE: {
          target: 'executingTool',
          actions: assign({
            currentCommand: () => 'CONFIRM'
          })
        },
        CANCEL: {
          target: 'executingTool',
          actions: assign({
            currentCommand: () => 'CANCEL'
          })
        }
      }
    }
  }
});
