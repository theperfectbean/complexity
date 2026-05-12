import React, { useState, useEffect, useRef } from 'react';
import { TerminalSquare, Send } from 'lucide-react';

interface CommandInputProps {
  onExecute: (command: string) => void;
  disabled?: boolean;
}

export const CommandInput: React.FC<CommandInputProps> = ({ onExecute, disabled }) => {
  const [command, setCommand] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!disabled && inputRef.current) {
      inputRef.current.focus();
    }
  }, [disabled]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (command.trim() && !disabled) {
      onExecute(command);
      setCommand('');
    }
  };

  return (
    <form 
      onSubmit={handleSubmit} 
      style={{ 
        width: '100%', 
        position: 'relative',
        display: 'flex',
        alignItems: 'center'
      }}
    >
      <div style={{
        position: 'absolute',
        left: '16px',
        color: disabled ? 'var(--text-muted)' : 'var(--accent-cyan)',
        display: 'flex',
        alignItems: 'center'
      }}>
        <TerminalSquare size={18} />
      </div>
      
      <input
        ref={inputRef}
        type="text"
        placeholder={disabled ? "Execution in progress..." : "Enter command (e.g., restart plex)..."}
        value={command}
        onChange={(e) => setCommand(e.target.value)}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '16px 48px 16px 44px',
          fontSize: '0.95rem',
          fontFamily: 'var(--font-mono)',
          borderRadius: '12px',
          border: '1px solid',
          borderColor: disabled ? 'var(--border-light)' : 'var(--border-focus)',
          background: 'var(--bg-surface)',
          color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
          outline: 'none',
          transition: 'all 0.2s ease',
          boxShadow: disabled ? 'none' : '0 4px 12px rgba(0,0,0,0.2)',
          opacity: disabled ? 0.6 : 1
        }}
        onFocus={(e) => e.target.style.borderColor = 'var(--accent-cyan)'}
        onBlur={(e) => e.target.style.borderColor = 'var(--border-focus)'}
      />

      <button
        type="submit"
        disabled={!command.trim() || disabled}
        style={{
          position: 'absolute',
          right: '12px',
          background: 'transparent',
          border: 'none',
          color: command.trim() && !disabled ? 'var(--text-primary)' : 'var(--text-muted)',
          cursor: command.trim() && !disabled ? 'pointer' : 'default',
          display: 'flex',
          alignItems: 'center',
          padding: '4px',
          transition: 'color 0.2s ease'
        }}
      >
        <Send size={18} />
      </button>
    </form>
  );
};
