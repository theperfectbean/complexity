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
        background: '#18181b', // var(--bg-surface)
        foreground: '#f4f4f5', // var(--text-primary)
        cursor: '#06b6d4',     // var(--accent-cyan)
        cursorAccent: '#06b6d4',
        selectionBackground: 'rgba(6, 182, 212, 0.3)',
      },
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: 13,
      lineHeight: 1.4
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    
    // Slight delay to ensure DOM is ready for exact measurement
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
        height: '400px', 
        background: 'var(--bg-surface)', 
        borderRadius: '12px',
        border: '1px solid var(--border-light)',
        overflow: 'hidden',
        boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
        position: 'relative'
      }}
    >
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: '36px',
        background: 'rgba(39, 39, 42, 0.5)',
        borderBottom: '1px solid var(--border-light)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: '8px',
        zIndex: 10
      }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#eab308' }} />
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981' }} />
        <span style={{ marginLeft: '10px', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          agent-execution-stream
        </span>
      </div>
      <div 
        ref={terminalRef} 
        style={{ 
          width: '100%', 
          height: '100%', 
          paddingTop: '40px', // Make room for fake header
          paddingLeft: '10px'
        }} 
      />
    </div>
  );
};
