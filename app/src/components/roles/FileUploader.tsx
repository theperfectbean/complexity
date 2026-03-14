"use client";

import { ChangeEvent, useRef, useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

type FileUploaderProps = {
  roleId: string;
  onUploaded: () => void;
  variant?: "button" | "full";
};

export function FileUploader({ roleId, onUploaded, variant = "button" }: FileUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);

      const response = await fetch(`/api/roles/${roleId}/upload`, {
        method: "POST",
        body,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Upload failed");
      }

      toast.success("File uploaded successfully");
      onUploaded();
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  if (variant === "button") {
    return (
      <div className="inline-flex">
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept=".pdf,.docx,.txt,.md"
          onChange={handleFileChange}
          disabled={uploading}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground/60 transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
          aria-label="Upload file"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-5 w-5" />
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="group relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border/40 bg-muted/20 p-8 transition-colors hover:border-border/60 hover:bg-muted/40">
      <input
        type="file"
        ref={fileInputRef}
        className="absolute inset-0 cursor-pointer opacity-0"
        accept=".pdf,.docx,.txt,.md"
        onChange={handleFileChange}
        disabled={uploading}
      />
      <div className="flex flex-col items-center gap-3 text-center">
        {uploading ? (
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background shadow-sm transition-transform group-hover:scale-110">
            <Plus className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
        <div className="space-y-1">
          <p className="text-sm font-medium">Click or drag to upload</p>
          <p className="text-xs text-muted-foreground">PDF, DOCX, TXT, or MD up to 20MB</p>
        </div>
      </div>
    </div>
  );
}
