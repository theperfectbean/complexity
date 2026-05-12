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
        background: '#1c1c1c', // var(--bg-base)
        foreground: '#f2f2f2', // var(--text-primary)
        cursor: '#f1d898',     // var(--accent-primary)
        cursorAccent: '#f1d898',
        selectionBackground: 'rgba(241, 216, 152, 0.2)',
        black: '#1c1c1c',
        red: '#fb7185',
        green: '#34d399',
        yellow: '#f1d898',
        blue: '#38bdf8',
        magenta: '#a78bfa',
        cyan: '#22d3ee',
        white: '#f2f2f2',
      },
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 12,
      lineHeight: 1.5
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    
    setTimeout(() => fitAddon.fit(), 50);

    if (initialContent) {
      term.writeln(initialContent);
    }

    term.onData((data) => {
      if (onData) onData(data);
    });

    xtermRef.current = term;

    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
    };
  }, []);

  return (
    <div 
      data-testid="terminal-block" 
      className="animate-slide-up"
      style={{ 
        width: '100%', 
        height: '450px', 
        background: 'var(--bg-base)', 
        borderRadius: '8px',
        border: '1px solid var(--border-light)',
        overflow: 'hidden',
        position: 'relative',
        boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.2)'
      }}
    >
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: '32px',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-light)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: '6px',
        zIndex: 10
      }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#444' }} />
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#444' }} />
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#444' }} />
        <span style={{ marginLeft: '8px', fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'lowercase' }}>
          tty0.complexity.agent
        </span>
      </div>
      <div 
        ref={terminalRef} 
        style={{ 
          width: '100%', 
          height: '100%', 
          paddingTop: '36px',
          paddingLeft: '12px',
          paddingBottom: '12px'
        }} 
      />
    </div>
  );
};
