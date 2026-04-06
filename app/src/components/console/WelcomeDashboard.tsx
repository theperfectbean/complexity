"use client";

import { useEffect, useState } from 'react';
import { Server, Cpu, HardDrive, LayoutGrid, Shield } from 'lucide-react';
import { motion } from 'motion/react';
import { QuickActionGrid } from './QuickActionGrid';
import { cn } from '@/lib/utils';

interface NodeStatus {
  name: string;
  status: 'online' | 'offline';
  uptime: number;
  cpu: number;
  mem: number;
}

export function WelcomeDashboard({ onActionClick }: { onActionClick: (text: string) => void }) {
  const [nodes, setNodes] = useState<NodeStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/proxmox/health')
      .then(res => res.json())
      .then(data => {
        if (data.nodes) setNodes(data.nodes);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch node health', err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-12 py-8">
      {/* Hero Section */}
      <div className="text-center space-y-4">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 mb-2"
        >
          <Shield className="h-8 w-8 text-primary" />
        </motion.div>
        <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-br from-foreground to-foreground/50 bg-clip-text text-transparent">
          Complexity Console
        </h2>
        <p className="text-muted-foreground max-w-lg mx-auto text-sm font-medium leading-relaxed">
          Autonomous cluster management & sysadmin assistant. 
          Monitor health, execute macros, or describe a custom mission.
        </p>
      </div>

      {/* Cluster Health */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 rounded-2xl bg-muted/20 animate-pulse border border-border/40" />
          ))
        ) : (
          nodes.map(node => (
            <div key={node.name} className="p-5 rounded-2xl bg-card/30 border border-border/40 backdrop-blur-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn("h-2 w-2 rounded-full", node.status === 'online' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-destructive")} />
                  <span className="font-bold text-sm tracking-tight">{node.name}</span>
                </div>
                <Server className="h-4 w-4 text-muted-foreground/40" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    <Cpu className="h-3 w-3" /> CPU
                  </div>
                  <div className="text-sm font-mono font-bold">{(node.cpu * 100).toFixed(1)}%</div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    <HardDrive className="h-3 w-3" /> RAM
                  </div>
                  <div className="text-sm font-mono font-bold">{(node.mem * 100).toFixed(1)}%</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Quick Actions */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <LayoutGrid className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground/60">Quick Actions</h3>
        </div>
        <QuickActionGrid onActionClick={onActionClick} />
      </div>
    </div>
  );
}
