"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, ChevronUp, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ThreadSearchBarProps {
  onSearch: (query: string) => void;
  matchCount: number;
  currentIndex: number;
  onNext: () => void;
  onPrev: () => void;
}

export function ThreadSearchBar({ onSearch, matchCount, currentIndex, onNext, onPrev }: ThreadSearchBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setPrompt] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClear = useCallback(() => {
    setPrompt("");
    onSearch("");
    setIsOpen(false);
  }, [onSearch]);

  const handleChange = (val: string) => {
    setPrompt(val);
    onSearch(val);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === "Escape" && isOpen) {
        handleClear();
      }
      if (isOpen && matchCount > 0) {
        if (e.key === "Enter") {
          e.preventDefault();
          if (e.shiftKey) onPrev();
          else onNext();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClear, matchCount, onNext, onPrev]);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  return (
    <div className="relative flex items-center">
      <AnimatePresence>
        {isOpen ? (
          <motion.div
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
            exit={{ opacity: 0, width: 0 }}
            className="flex items-center gap-2 overflow-hidden"
          >
            <div className="relative flex items-center">
              <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground/50" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => handleChange(e.target.value)}
                placeholder="Find in thread..."
                className="h-8 w-40 md:w-64 rounded-lg border border-border bg-muted/30 pl-8 pr-8 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              />
              {query && (
                <button
                  onClick={handleClear}
                  className="absolute right-2 text-muted-foreground/50 hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            
            {query && matchCount > 0 && (
              <div className="flex items-center gap-1.5 px-2 text-[10px] font-bold text-primary bg-primary/5 rounded-md border border-primary/10 h-8 whitespace-nowrap">
                <span>
                  {currentIndex + 1} / {matchCount}
                </span>
                <div className="flex items-center gap-0.5 border-l border-primary/10 pl-1">
                  <button
                    onClick={onPrev}
                    className="p-0.5 hover:bg-primary/10 rounded-sm transition-colors"
                    title="Previous match (Shift+Enter)"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button
                    onClick={onNext}
                    className="p-0.5 hover:bg-primary/10 rounded-sm transition-colors"
                    title="Next match (Enter)"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          <button
            onClick={() => setIsOpen(true)}
            title="Search in thread (Cmd+F)"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
          >
            <Search className="h-4 w-4" />
          </button>
        )}
      </AnimatePresence>
    </div>
  );
}
