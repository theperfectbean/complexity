import React, { useState } from 'react';

interface CommandInputProps {
  onExecute: (command: string) => void;
  disabled?: boolean;
}

export const CommandInput: React.FC<CommandInputProps> = ({ onExecute, disabled }) => {
  const [command, setCommand] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (command.trim() && !disabled) {
      onExecute(command);
      setCommand('');
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ width: '100%', marginBottom: '20px' }}>
      <input
        type="text"
        placeholder="Enter command (e.g., restart plex)..."
        value={command}
        onChange={(e) => setCommand(e.target.value)}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '12px 15px',
          fontSize: '16px',
          borderRadius: '8px',
          border: '1px solid #ccc',
          background: disabled ? '#eee' : '#fff',
          outline: 'none',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)'
        }}
      />
    </form>
  );
};
