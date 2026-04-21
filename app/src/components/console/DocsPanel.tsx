"use client";

import { useState, useEffect } from 'react';
import { X, Loader2, Book } from 'lucide-react';
import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function DocsPanel({ 
  isOpen, 
  onClose 
}: { 
  isOpen: boolean; 
  onClose: () => void;
}) {
  const [content, setContent] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || content !== null) return;
    let cancelled = false;
    fetch('/api/docs')
      .then(res => res.json())
      .then((data: { content?: string }) => {
        if (!cancelled) {
          setContent(data.content ?? '');
        }
      })
      .catch(err => {
        console.error(err);
        if (!cancelled) {
          setContent('');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [content, isOpen]);

  const loading = content === null;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      
      <motion.div 
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="relative w-full max-w-2xl bg-card border-l border-border/40 shadow-2xl h-full flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
          <div className="flex items-center gap-2">
            <Book className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Cluster Documentation</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
          ) : (
            <div className="markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
