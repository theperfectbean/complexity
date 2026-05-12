import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

interface TerminalBlockProps {
  initialContent?: string;
  onData?: (data: string) => void;
}

export const TerminalBlock: React.FC<TerminalBlockProps> = ({ initialContent, onData }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      theme: {
        background: '#1e1e1e',
      },
      fontFamily: 'monospace',
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    if (initialContent) {
      term.writeln(initialContent);
    }

    term.onData((data) => {
      if (onData) onData(data);
    });

    xtermRef.current = term;

    return () => {
      term.dispose();
    };
  }, []);

  return (
    <div 
      data-testid="terminal-block" 
      style={{ 
        width: '100%', 
        height: '300px', 
        padding: '10px', 
        background: '#1e1e1e', 
        borderRadius: '8px',
        overflow: 'hidden',
        marginBottom: '10px'
      }}
    >
      <div ref={terminalRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
};
