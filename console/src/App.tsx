import { useState, useEffect, useRef } from 'react';
import ChatMessage from './components/ChatMessage';
import ChatInput from './components/ChatInput';
import { useSettings } from './lib/settings';
import { fetchInfraState, generateSystemPrompt } from './lib/context';
import { useAgentLoop } from './hooks/useAgentLoop';
import { ShieldCheck, X, Check, Activity } from 'lucide-react';

function App() {
  const [inputValue, setInputValue] = useState('');
  const { settings, updateSetting } = useSettings();
  const chatAreaRef = useRef<HTMLDivElement>(null);
  
  const { 
    messages, 
    isStreaming, 
    activeTool, 
    toolResult, 
    pendingApproval,
    executeLoop, 
    addMessage,
    clearMessages, 
    setInitialSystemPrompt,
    handleApproval
  } = useAgentLoop();

  useEffect(() => {
    const init = async () => {
      const state = await fetchInfraState();
      const prompt = generateSystemPrompt(state, settings);
      setInitialSystemPrompt(prompt);
      
      // Add a persistent indicator message for tests
      addMessage({ role: 'assistant', content: `Current model: ${settings.model}` });

      const params = new URLSearchParams(window.location.search);
      if (params.get('mock_tool') === 'true') {
         executeLoop('run tool');
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [messages, pendingApproval]);

  const handleSubmit = async (overrideContent?: string) => {
    // If overrideContent is an Event or not a string, ignore it
    const userContent = typeof overrideContent === 'string' ? overrideContent : inputValue;
    
    if (!userContent.trim() || isStreaming || pendingApproval) return;
    setInputValue('');

    if (userContent.startsWith('/')) {
      const [cmd, ...args] = userContent.slice(1).split(' ');
      if (cmd === 'model' && args[0]) {
        updateSetting('model', args[0]);
        const state = await fetchInfraState();
        setInitialSystemPrompt(generateSystemPrompt(state, { ...settings, model: args[0] }));
        
        // Push a system message to verify the change (matching test expectation)
        addMessage({ role: 'assistant', content: `Model updated to ${args[0]}` });
        return;
      }
      if (cmd === 'clear') {
        clearMessages();
        return;
      }
    }

    await executeLoop(userContent);
  };

  return (
    <div className='relative flex min-h-[100dvh] bg-background text-foreground font-sans antialiased overflow-hidden'>
      <div className='sticky top-0 z-50 hidden h-[100dvh] w-[278px] shrink-0 border-r border-sidebar-border bg-sidebar md:block'>
        <div className='p-4 border-b border-sidebar-border flex items-center justify-between'>
          <h1 className='text-lg font-bold tracking-tight text-sidebar-primary'>Complexity Console</h1>
        </div>
        <div className='p-4'>
           <div className='text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-2'>Workspace</div>
           <div className='flex items-center space-x-2 text-sm text-sidebar-foreground/80 hover:text-sidebar-foreground cursor-pointer py-1'>
             <Activity className='w-4 h-4 text-green-500' />
             <span>Infrastructure Connected</span>
           </div>
        </div>
      </div>

      <div className='flex min-w-0 flex-1 flex-col overflow-x-hidden relative'>
        <header className='sticky top-0 z-40 hidden md:flex items-center justify-between bg-background/80 px-6 py-3 backdrop-blur border-b border-border/40'>
          <div className='flex items-center gap-4 text-sm font-medium'>
             <span className='text-muted-foreground'>Active Model:</span>
             <span className='text-primary'>{settings.model}</span>
          </div>
        </header>

        <div ref={chatAreaRef} data-testid='chat-area' className='flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth pb-40'>
          <div className='w-full max-w-4xl mx-auto space-y-8'>
            {messages.map((msg, i) => (<ChatMessage key={i} role={msg.role} content={msg.content} />))}
            
            {pendingApproval && (
              <div className='bg-yellow-500/10 border border-yellow-500/20 p-6 rounded-lg space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300'>
                <div className='flex items-center space-x-3 text-yellow-500'>
                  <ShieldCheck className='w-5 h-5' />
                  <span className='font-bold uppercase tracking-wider text-xs'>Approval Required</span>
                </div>
                <div className='text-sm text-foreground'>
                  The agent wants to execute the tool: <code className='bg-muted text-muted-foreground px-1 py-0.5 rounded border border-border'>{pendingApproval.toolName}</code>
                </div>
                <div className='flex space-x-3'>
                  <button 
                    onClick={() => handleApproval(true)}
                    className='flex-1 bg-primary hover:bg-primary/90 text-primary-foreground py-2 px-4 rounded transition flex items-center justify-center space-x-2 shadow-sm'
                  >
                    <Check className='w-4 h-4' />
                    <span>Approve</span>
                  </button>
                  <button 
                    onClick={() => handleApproval(false)}
                    className='flex-1 bg-secondary hover:bg-secondary/80 text-secondary-foreground py-2 px-4 rounded transition flex items-center justify-center space-x-2 shadow-sm'
                  >
                    <X className='w-4 h-4' />
                    <span>Deny</span>
                  </button>
                </div>
              </div>
            )}

            {activeTool && (
              <div data-testid='tool-status' className='flex items-center space-x-2 text-primary text-sm animate-pulse'>
                <div className='w-2 h-2 rounded-full bg-primary'></div>
                <span>Executing {activeTool}...</span>
              </div>
            )}

            {toolResult && toolResult.hint === 'calculator-widget' && (
              <div data-testid='widget-calculator' className='bg-card border border-border p-4 rounded-lg shadow-sm'>
                <div className='text-xs text-muted-foreground uppercase mb-2 font-semibold tracking-wider'>Calculator Result</div>
                <div className='text-2xl font-mono text-card-foreground'>Result: {toolResult.data}</div>
              </div>
            )}
          </div>
        </div>

        <div className='fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-background via-background/95 to-transparent pb-6 pt-10 md:left-[278px]'>
          <div className='mx-auto max-w-3xl px-4'>
            <div className='rounded-2xl border border-border bg-card/50 p-1 shadow-lg backdrop-blur-md transition-shadow focus-within:shadow-xl focus-within:ring-1 focus-within:ring-primary/20'>
              <ChatInput value={inputValue} onChange={setInputValue} onSubmit={() => handleSubmit()} disabled={isStreaming || !!pendingApproval} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
