"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Edit3, Check, X, FileText, Cpu } from "lucide-react";

type Prompt = {
  id: string;
  title: string;
  content: string;
  isSystemPrompt: boolean;
  sortOrder: number;
  createdAt: string;
};

export default function PromptsSettingsPage() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editIsSystem, setEditIsSystem] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newIsSystem, setNewIsSystem] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/prompts")
      .then(r => r.ok ? r.json() : { prompts: [] })
      .then((d: { prompts: Prompt[] }) => setPrompts(d.prompts))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    if (!newTitle.trim() || !newContent.trim()) return;
    setSaving(true);
    try {
      const r = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), content: newContent.trim(), isSystemPrompt: newIsSystem }),
      });
      if (r.ok) {
        const d = await r.json() as { prompt: Prompt };
        setPrompts(prev => [...prev, d.prompt]);
        setNewTitle(""); setNewContent(""); setNewIsSystem(false); setIsCreating(false);
      }
    } finally { setSaving(false); }
  }

  async function handleSaveEdit(id: string) {
    setSaving(true);
    try {
      await fetch(`/api/prompts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle.trim(), content: editContent.trim(), isSystemPrompt: editIsSystem }),
      });
      setPrompts(prev => prev.map(p => p.id === id
        ? { ...p, title: editTitle.trim(), content: editContent.trim(), isSystemPrompt: editIsSystem }
        : p));
      setEditingId(null);
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/prompts/${id}`, { method: "DELETE" });
    setPrompts(prev => prev.filter(p => p.id !== id));
  }

  function startEdit(p: Prompt) {
    setEditingId(p.id);
    setEditTitle(p.title);
    setEditContent(p.content);
    setEditIsSystem(p.isSystemPrompt);
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Prompt Library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Save reusable prompts. Insert them in any chat via the <kbd className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">/prompt</kbd> command.
        </p>
      </div>

      {/* Create new */}
      {!isCreating ? (
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors w-full"
        >
          <Plus className="h-4 w-4" />
          New prompt
        </button>
      ) : (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <input
            autoFocus
            placeholder="Prompt title…"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <textarea
            placeholder="Prompt content…"
            value={newContent}
            onChange={e => setNewContent(e.target.value)}
            rows={4}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input type="checkbox" checked={newIsSystem} onChange={e => setNewIsSystem(e.target.checked)} className="rounded" />
            <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
            Use as system prompt (sets thread system prompt instead of inserting text)
          </label>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={saving || !newTitle.trim() || !newContent.trim()}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              <Check className="h-3.5 w-3.5" /> Save
            </button>
            <button onClick={() => { setIsCreating(false); setNewTitle(""); setNewContent(""); }}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
      ) : prompts.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No prompts yet. Create one above.</p>
      ) : (
        <div className="space-y-2">
          {prompts.map(p => (
            <div key={p.id} className="rounded-lg border border-border p-4 space-y-2">
              {editingId === p.id ? (
                <>
                  <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
                  <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
                    rows={4} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none" />
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input type="checkbox" checked={editIsSystem} onChange={e => setEditIsSystem(e.target.checked)} className="rounded" />
                    <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                    Use as system prompt
                  </label>
                  <div className="flex gap-2">
                    <button onClick={() => handleSaveEdit(p.id)} disabled={saving}
                      className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                      <Check className="h-3.5 w-3.5" /> Save
                    </button>
                    <button onClick={() => setEditingId(null)}
                      className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                      <X className="h-3.5 w-3.5" /> Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {p.isSystemPrompt
                        ? <Cpu className="h-3.5 w-3.5 shrink-0 text-primary" />
                        : <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                      <span className="font-medium text-sm truncate">{p.title}</span>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => startEdit(p)} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleDelete(p.id)} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">{p.content}</p>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
