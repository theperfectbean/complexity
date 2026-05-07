"use client";

import { useState, useMemo } from "react";
import { Brain, ChevronDown, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { type ReasoningItem } from "@/lib/agent/protocol";
import { cn } from "@/lib/utils";

interface ReasoningPanelProps {
  items: ReasoningItem[];
}

export function ReasoningPanel({ items }: ReasoningPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  const fullText = useMemo(() => 
    items.map(item => item.text).join(""), 
    [items]
  );

  return (
    <div className="rounded-2xl border border-primary/10 bg-primary/[0.03] overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-6 py-4 transition-colors hover:bg-primary/[0.06] text-primary"
      >
        <div className="flex items-center gap-3">
          <Brain className="h-5 w-5" />
          <h2 className="text-sm font-bold uppercase tracking-widest">Mission Reasoning</h2>
        </div>
        {isOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden border-t border-primary/10 bg-card/50"
          >
            <div className="p-6">
              <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-muted-foreground/90 selection:bg-primary/20 selection:text-primary">
                {fullText || "Analyzing mission parameters..."}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
