"use client";

import { useState, useMemo } from "react";
import { Image as ImageIcon, X, Maximize2, Download } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ChatMessageItem } from "./MessageList";
import { cn } from "@/lib/utils";

interface ImageGalleryProps {
  messages: ChatMessageItem[];
}

interface ImageItem {
  url: string;
  source: "attachment" | "generated";
  prompt?: string;
  messageId: string;
}

export function ImageGallery({ messages }: ImageGalleryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<ImageItem | null>(null);

  const images = useMemo(() => {
    const found: ImageItem[] = [];
    
    messages.forEach((msg) => {
      // 1. Check attachments (user)
      const msgRecord = msg as Record<string, unknown>;
      const attachments = (msgRecord.experimental_attachments || msgRecord.attachments || []) as Array<{ url?: string; contentType?: string; name?: string }>;
      
      attachments.forEach((at) => {
        if (at.url && (at.contentType?.startsWith("image/") || at.url.startsWith("data:image/"))) {
          found.push({
            url: at.url,
            source: "attachment",
            messageId: msg.id,
          });
        }
      });

      // 2. Check generated images in markdown (assistant)
      // Pattern: ![Generated image: prompt](url)
      if (msg.role === "assistant") {
        const regex = /!\[Generated image: (.*?)\]\((.*?)\)/g;
        let match;
        while ((match = regex.exec(msg.content)) !== null) {
          found.push({
            url: match[2],
            source: "generated",
            prompt: match[1],
            messageId: msg.id,
          });
        }
      }
    });

    return found;
  }, [messages]);

  if (images.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all shadow-sm",
          isOpen 
            ? "bg-primary text-primary-foreground border-primary" 
            : "bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
        )}
      >
        <ImageIcon className="h-3.5 w-3.5" />
        Images ({images.length})
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute left-0 top-full z-30 mt-2 w-80 md:w-96 rounded-2xl border border-border bg-card p-4 shadow-2xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Thread Gallery</h3>
              <button onClick={() => setIsOpen(false)} className="rounded-full p-1 hover:bg-muted">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 max-h-80 overflow-y-auto pr-1 scrollbar-thin">
              {images.map((img, idx) => (
                <div 
                  key={`${img.messageId}-${idx}`} 
                  className="group relative aspect-square cursor-pointer overflow-hidden rounded-lg border border-border/50 bg-muted/30"
                  onClick={() => setSelectedImage(img)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img 
                    src={img.url} 
                    alt={img.prompt || "Gallery image"} 
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                    <Maximize2 className="h-5 w-5 text-white" />
                  </div>
                  {img.source === "generated" && (
                    <div className="absolute bottom-1 right-1 rounded-sm bg-primary/80 px-1 py-0.5 text-[8px] font-bold text-white">
                      AI
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lightbox */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
            onClick={() => setSelectedImage(null)}
          >
            <button 
              className="absolute right-6 top-6 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
              onClick={() => setSelectedImage(null)}
            >
              <X className="h-6 w-6" />
            </button>

            <div className="relative max-w-5xl w-full flex flex-col items-center gap-4" onClick={e => e.stopPropagation()}>
              <div className="relative group max-h-[80vh] w-full flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src={selectedImage.url} 
                  alt={selectedImage.prompt || "Enlarged view"} 
                  className="max-h-full max-w-full rounded-lg shadow-2xl border border-white/10 object-contain"
                />
                
                <a 
                  href={selectedImage.url} 
                  download 
                  target="_blank"
                  rel="noreferrer"
                  className="absolute bottom-4 right-4 flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-xs font-medium text-white backdrop-blur-md hover:bg-black/80 transition-all border border-white/10"
                >
                  <Download className="h-4 w-4" />
                  Download
                </a>
              </div>

              {selectedImage.prompt && (
                <div className="max-w-2xl text-center">
                  <p className="text-sm text-white/90 font-medium leading-relaxed bg-black/40 p-4 rounded-xl border border-white/5 backdrop-blur-sm">
                    &ldquo;{selectedImage.prompt}&rdquo;
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
