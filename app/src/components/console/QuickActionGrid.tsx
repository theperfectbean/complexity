"use client";

import { Terminal, HardDrive, Shield, Activity, List, FileText, Search } from 'lucide-react';

const ACTIONS = [
  {
    title: "Disk Space",
    description: "Check storage on pve02",
    prompt: "Check disk space on pve02 staging mount and report any issues.",
    icon: HardDrive,
    color: "text-blue-500",
  },
  {
    title: "Caddy Logs",
    description: "View recent proxy traffic",
    prompt: "Show me the last 20 lines of Caddy logs on CT 107 and check for errors.",
    icon: List,
    color: "text-emerald-500",
  },
  {
    title: "Systemd Status",
    description: "Check arrstack services",
    prompt: "List all systemd services on CT 103 and tell me if any are failed.",
    icon: Activity,
    color: "text-orange-500",
  },
  {
    title: "Search Docs",
    description: "Architecture reference",
    prompt: "Search the infrastructure documentation for information about the media storage layout.",
    icon: FileText,
    color: "text-purple-500",
  },
];

export function QuickActionGrid({ onActionClick }: { onActionClick: (text: string) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {ACTIONS.map(action => (
        <button
          key={action.title}
          onClick={() => onActionClick(action.prompt)}
          className="group flex items-start gap-4 p-4 rounded-2xl bg-muted/10 border border-border/40 hover:bg-muted/20 hover:border-primary/30 transition-all text-left"
        >
          <div className="h-10 w-10 rounded-xl bg-background border border-border/40 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            <action.icon className={`h-5 w-5 ${action.color}`} />
          </div>
          <div className="space-y-1">
            <div className="text-sm font-bold">{action.title}</div>
            <div className="text-xs text-muted-foreground line-clamp-1">{action.description}</div>
          </div>
        </button>
      ))}
    </div>
  );
}
