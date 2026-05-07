"use client";

import { X, Command, Terminal, Shield, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function HelpDialog({ 
  isOpen, 
  onClose 
}: { 
  isOpen: boolean; 
  onClose: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-lg bg-card border border-border/40 rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/40 bg-muted/10">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Console Cheat Sheet</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Command className="h-3 w-3" /> Keyboard Shortcuts
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex justify-between items-center">
                <span>Command Palette</span>
                <kbd className="bg-muted px-1.5 py-0.5 rounded border border-border text-[10px] font-mono">⌘K</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span>Clear Console</span>
                <kbd className="bg-muted px-1.5 py-0.5 rounded border border-border text-[10px] font-mono">/clear</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span>Halt Execution</span>
                <kbd className="bg-muted px-1.5 py-0.5 rounded border border-border text-[10px] font-mono">^C</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span>Submit Command</span>
                <kbd className="bg-muted px-1.5 py-0.5 rounded border border-border text-[10px] font-mono">⏎</kbd>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Terminal className="h-3 w-3" /> Slash Commands
            </h3>
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <code className="text-primary font-bold">/docs</code>
                <span className="text-xs text-muted-foreground">Open cluster architecture documentation</span>
              </div>
              <div className="flex items-start gap-3">
                <code className="text-primary font-bold">/settings</code>
                <span className="text-xs text-muted-foreground">Configure SSH user and security preferences</span>
              </div>
              <div className="flex items-start gap-3">
                <code className="text-primary font-bold">/clear</code>
                <span className="text-xs text-muted-foreground">Reset the current event feed and run state</span>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Shield className="h-3 w-3" /> Capabilities
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              The agent can execute SSH commands, list LXC/VM containers, monitor systemd services, 
              analyze logs, and manage storage across the Proxmox cluster nodes (pve01-03).
            </p>
          </section>
        </div>
      </motion.div>
    </div>
  );
}
