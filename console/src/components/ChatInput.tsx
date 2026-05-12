import React, { useRef, useEffect } from "react";
import { SendHorizontal } from "lucide-react";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}

const ChatInput = ({ value, onChange, onSubmit, disabled }: ChatInputProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="relative flex items-end w-full">
      <textarea
        ref={textareaRef}
        data-testid="input-box"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="Ask anything..."
        rows={1}
        className="w-full bg-transparent border-0 text-foreground p-3 pr-12 focus:outline-none focus:ring-0 resize-none min-h-[44px] max-h-[200px] overflow-y-auto disabled:opacity-50 disabled:cursor-not-allowed"
      />
      <button
        onClick={onSubmit}
        disabled={disabled || !value.trim()}
        className="absolute right-2 bottom-2 p-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:bg-muted disabled:text-muted-foreground transition-colors"
      >
        <SendHorizontal className="w-4 h-4" />
      </button>
    </div>
  );
};

export default ChatInput;
