"use client";

import { FileText, X } from "lucide-react";
import { motion } from "motion/react";
import { useRef, useState, useImperativeHandle, forwardRef } from "react";
import { cn } from "@/lib/utils";

export type FileAttachmentsHandle = {
  clickInput: () => void;
  processFiles: (files: FileList | File[]) => Promise<void>;
};

type FileAttachmentsProps = {
  attachments: File[];
  onAttachmentsChange: (files: File[]) => void;
  onAttachClick?: (files: FileList | null) => void;
  onRemoveAttachment?: (index: number) => void;
  roleId?: string;
};

export const FileAttachments = forwardRef<FileAttachmentsHandle, FileAttachmentsProps>(({
  attachments,
  onAttachmentsChange,
  onAttachClick,
  onRemoveAttachment,
  roleId,
}, ref) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imagePreviews, setImagePreviews] = useState<Record<string, string>>({});

  const processFiles = async (files: FileList | File[]) => {
    const filesArray = Array.from(files);
    const newAttachments = [...attachments];
    
    for (const file of filesArray) {
      // Avoid duplicates by name if they are the same size
      if (attachments.some(a => a.name === file.name && a.size === file.size)) {
        continue;
      }

      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const base64 = e.target?.result as string;
          setImagePreviews((prev) => ({ ...prev, [file.name]: base64 }));
        };
        reader.readAsDataURL(file);
      } else {
        if (roleId) {
          try {
            const body = new FormData();
            body.append("file", file);
            await fetch(`/api/roles/${roleId}/upload`, {
              method: "POST",
              body,
            });
          } catch (error) {
            console.error(error);
          }
        }
      }
      newAttachments.push(file);
    }
    
    onAttachmentsChange(newAttachments);
    // Propagate to parent — only forward a FileList; File[] arrays from programmatic calls pass null.
    onAttachClick?.(files instanceof FileList ? files : null);
  };

  useImperativeHandle(ref, () => ({
    clickInput: () => {
      fileInputRef.current?.click();
    },
    processFiles
  }));

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    await processFiles(files);
    event.target.value = "";
  };

  const removeAttachment = (index: number) => {
    const file = attachments[index];
    const newAttachments = attachments.filter((_, i) => i !== index);
    onAttachmentsChange(newAttachments);
    
    if (file) {
      setImagePreviews(prev => {
        const copy = { ...prev };
        delete copy[file.name];
        return copy;
      });
    }
    onRemoveAttachment?.(index);
  };

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        data-testid="file-upload-input"
        className="hidden"
        multiple
        onChange={handleFileChange}
        accept=".pdf,.docx,.txt,.md,image/jpeg,image/png,image/webp"
      />
      
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 pb-1.5 px-2" data-testid="attachments-container">
          {attachments.map((file, index) => {
            const isImage = file.type.startsWith("image/");
            const preview = imagePreviews[file.name];
            
            return (
              <motion.div 
                key={`${file.name}-${index}`} 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                data-testid="file-chip"
                className={cn(
                  "group relative flex items-center rounded-xl bg-muted/40 border border-border/40 transition-colors hover:bg-muted/60",
                  isImage ? "h-12 w-12 justify-center overflow-hidden" : "gap-1.5 pl-2.5 pr-1.5 py-1.5 text-[11px] text-muted-foreground max-w-[160px]"
                )}
              >
                {isImage ? (
                  preview ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={preview} alt={file.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-[10px] text-muted-foreground">Img</span>
                  )
                ) : (
                  <>
                    <FileText className="h-3 w-3 shrink-0 text-primary/60" />
                    <span className="truncate font-medium">{file.name}</span>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => removeAttachment(index)}
                  className={cn(
                    "inline-flex items-center justify-center rounded-full hover:bg-foreground/10 shrink-0 transition-colors",
                    isImage ? "absolute -right-1 -top-1 h-5 w-5 bg-background/80 shadow-sm" : "ml-1 h-4 w-4"
                  )}
                >
                  <X className="h-3 w-3" />
                </button>
              </motion.div>
            );
          })}
        </div>
      )}
    </>
  );
});

FileAttachments.displayName = "FileAttachments";
