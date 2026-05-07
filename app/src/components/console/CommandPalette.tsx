"use client";

import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { Search, Settings, FileText, Trash2, X } from "lucide-react";

export function CommandPalette({ 
  isOpen, 
  onClose, 
  onAction 
}: { 
  isOpen: boolean; 
  onClose: () => void;
  onAction: (action: string) => void;
}) {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (isOpen) onClose(); else onAction("open");
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [isOpen, onClose, onAction]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 md:p-20">
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      
      <Command className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-border/40 bg-card shadow-2xl transition-all">
        <div className="flex items-center border-b border-border/40 px-4">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <Command.Input 
            placeholder="Type a command or search..." 
            className="flex h-12 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button onClick={onClose} className="ml-2 rounded-md p-1 hover:bg-muted transition-colors">
            <X className="h-4 w-4 opacity-50" />
          </button>
        </div>
        
        <Command.List className="max-h-[300px] overflow-y-auto overflow-x-hidden p-2">
          <Command.Empty className="py-6 text-center text-sm">No results found.</Command.Empty>
          
          <Command.Group heading="Navigation" className="px-2 py-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">
            <Command.Item 
              onSelect={() => { onAction("settings"); onClose(); }} 
              className="flex items-center gap-2 px-2 py-2 text-sm rounded-lg hover:bg-primary/10 data-[selected=true]:bg-primary/10 cursor-pointer transition-colors outline-none"
            >
              <Settings className="h-4 w-4" />
              <span>Settings</span>
            </Command.Item>
            <Command.Item 
              onSelect={() => { onAction("docs"); onClose(); }} 
              className="flex items-center gap-2 px-2 py-2 text-sm rounded-lg hover:bg-primary/10 data-[selected=true]:bg-primary/10 cursor-pointer transition-colors outline-none"
            >
              <FileText className="h-4 w-4" />
              <span>Documentation</span>
            </Command.Item>
          </Command.Group>

          <Command.Group heading="Actions" className="px-2 py-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider mt-2">
            <Command.Item 
              onSelect={() => { onAction("clear"); onClose(); }} 
              className="flex items-center gap-2 px-2 py-2 text-sm rounded-lg hover:bg-destructive/10 data-[selected=true]:bg-destructive/10 cursor-pointer transition-colors text-destructive outline-none"
            >
              <Trash2 className="h-4 w-4" />
              <span>Clear Console</span>
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
