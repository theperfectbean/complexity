"use client";

import { useState, useEffect } from 'react';
import { X, Shield, Terminal, Save, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

export function SettingsPanel({ 
  isOpen, 
  onClose 
}: { 
  isOpen: boolean; 
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    defaultSshUser: 'root',
    autoApproveReadOnly: false,
  });

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      fetch('/api/settings')
        .then(res => res.json())
        .then(data => {
          setSettings({
            defaultSshUser: data.defaultSshUser || 'root',
            autoApproveReadOnly: !!data.autoApproveReadOnly,
          });
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setLoading(false);
        });
    }
  }, [isOpen]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error('Failed to save settings');
      toast.success('Settings saved');
      onClose();
    } catch (err) {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      
      <motion.div 
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        className="relative w-full max-w-md bg-card border-l border-border/40 shadow-2xl h-full flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
          <h2 className="text-lg font-bold">Console Settings</h2>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
                  <Terminal className="h-4 w-4" /> SSH Preferences
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Default SSH User</label>
                  <input 
                    type="text"
                    value={settings.defaultSshUser}
                    onChange={e => setSettings(s => ({ ...s, defaultSshUser: e.target.value }))}
                    className="w-full bg-muted/30 border border-border/40 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    placeholder="root"
                  />
                  <p className="text-[11px] text-muted-foreground italic">Commands will execute as this user on target nodes.</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
                  <Shield className="h-4 w-4" /> Security
                </div>
                <div className="flex items-start justify-between gap-4 p-4 rounded-2xl bg-muted/10 border border-border/40">
                  <div className="space-y-1">
                    <div className="text-sm font-bold">Auto-Approve Read-Only</div>
                    <div className="text-xs text-muted-foreground">Bypass Mission Plan approval for safe commands (ls, cat, df, etc).</div>
                  </div>
                  <button 
                    onClick={() => setSettings(s => ({ ...s, autoApproveReadOnly: !s.autoApproveReadOnly }))}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${settings.autoApproveReadOnly ? 'bg-primary' : 'bg-muted'}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings.autoApproveReadOnly ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="p-6 border-t border-border/40 bg-muted/5">
          <button 
            onClick={handleSave}
            disabled={saving || loading}
            className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition-all disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Changes
          </button>
        </div>
      </motion.div>
    </div>
  );
}
