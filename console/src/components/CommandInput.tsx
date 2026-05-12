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
        left: '14px',
        color: disabled ? 'var(--text-muted)' : 'var(--accent-primary)',
        display: 'flex',
        alignItems: 'center'
      }}>
        <TerminalSquare size={16} />
      </div>
      
      <input
        ref={inputRef}
        type="text"
        placeholder={disabled ? "Processing request..." : "Command node01, node02..."}
        value={command}
        onChange={(e) => setCommand(e.target.value)}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '14px 44px 14px 40px',
          fontSize: '0.9rem',
          fontFamily: 'var(--font-mono)',
          borderRadius: '8px',
          border: '1px solid',
          borderColor: disabled ? 'var(--border-light)' : 'var(--border-focus)',
          background: 'var(--bg-base)',
          color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
          outline: 'none',
          transition: 'all 0.2s ease'
        }}
        onFocus={(e) => e.target.style.borderColor = 'var(--accent-primary)'}
        onBlur={(e) => e.target.style.borderColor = 'var(--border-focus)'}
      />

      <button
        type="submit"
        disabled={!command.trim() || disabled}
        style={{
          position: 'absolute',
          right: '10px',
          background: 'transparent',
          border: 'none',
          color: command.trim() && !disabled ? 'var(--accent-primary)' : 'var(--text-muted)',
          cursor: command.trim() && !disabled ? 'pointer' : 'default',
          display: 'flex',
          alignItems: 'center',
          padding: '6px',
          transition: 'transform 0.1s ease'
        }}
        onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.95)'}
        onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
      >
        <Send size={16} />
      </button>
    </form>
  );
};
