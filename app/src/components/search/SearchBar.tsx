"use client";

import { Globe, Paperclip, SendHorizontal } from "lucide-react";
import { motion } from "motion/react";
import { useRef, useState, useEffect } from "react";
import TextareaAutosize from "react-textarea-autosize";

import { getDefaultModel } from "@/lib/models";
import { cn } from "@/lib/utils";

import { VoiceInput } from "./parts/VoiceInput";
import { ModelSelector } from "./parts/ModelSelector";
import { SearchModelOption } from "@/lib/models";
import { FileAttachments, FileAttachmentsHandle } from "./parts/FileAttachments";

type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  submitLabel: string;
  disabled?: boolean;
  layoutId?: string;
  compact?: boolean;
  model?: string;
  onModelChange?: (model: string) => void;
  modelOptions?: readonly SearchModelOption[];
  onAttachClick?: (files: FileList | null) => void;
  attachments?: File[];
  onRemoveAttachment?: (index: number) => void;
  webSearchEnabled?: boolean;
  onWebSearchChange?: (enabled: boolean) => void;
  autoFilter?: boolean;
  "data-testid"?: string;
  id?: string;
  roleId?: string;
};

const EMPTY_ATTACHMENTS: File[] = [];

export function SearchBar({
  value,
  onChange,
  placeholder,
  submitLabel,
  disabled,
  layoutId = "searchbar",
  compact,
  model = getDefaultModel(),
  onModelChange,
  modelOptions,
  onAttachClick,
  attachments: externalAttachments = EMPTY_ATTACHMENTS,
  onRemoveAttachment,
  webSearchEnabled = true,
  onWebSearchChange,
  autoFilter = true,
  "data-testid": dataTestId,
  id,
  roleId,
}: SearchBarProps) {
  const fileAttachmentsRef = useRef<FileAttachmentsHandle>(null);
  const [internalAttachments, setInternalAttachments] = useState<File[]>(externalAttachments);

  useEffect(() => {
    setInternalAttachments(externalAttachments);
  }, [externalAttachments]);

  const handleAttachClick = () => {
    fileAttachmentsRef.current?.clickInput();
  };

  return (
    <motion.div
      id={id}
      layoutId={layoutId}
      layout={!compact}
      data-testid={dataTestId || id}
      className={cn(
        "flex flex-col rounded-[22px] border bg-card p-2 shadow-md transition-all duration-200",
        "focus-within:border-primary/30 focus-within:ring-4 focus-within:ring-primary/5 focus-within:shadow-lg",
      )}
    >
      <FileAttachments
        ref={fileAttachmentsRef}
        attachments={internalAttachments}
        onAttachmentsChange={setInternalAttachments}
        onAttachClick={onAttachClick}
        onRemoveAttachment={onRemoveAttachment}
        roleId={roleId}
      />

      <div className="flex items-end gap-2 px-2">
        <TextareaAutosize
          minRows={compact ? 1 : 2}
          maxRows={12}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          disabled={disabled}
          placeholder={placeholder}
          className="flex-1 resize-none bg-transparent py-2.5 text-[15px] outline-none placeholder:text-muted-foreground/60 disabled:opacity-50 leading-relaxed"
        />
      </div>

      <div className="mt-1 flex items-center justify-between gap-2 px-1 pb-1">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
          <ModelSelector
            model={model}
            onModelChange={onModelChange}
            modelOptions={modelOptions}
            autoFilter={autoFilter}
          />

          <div className="h-4 w-px bg-border/40 mx-0.5" />

          <button
            type="button"
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-xl px-2 text-[13px] font-medium transition-all",
              webSearchEnabled
                ? "text-primary hover:bg-primary/10"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
            aria-label="Toggle web search"
            onClick={() => onWebSearchChange?.(!webSearchEnabled)}
          >
            <Globe className={cn("h-4 w-4", webSearchEnabled ? "text-primary" : "opacity-60")} />
            <span className="hidden sm:inline">Search</span>
          </button>


          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            aria-label="Attach file"
            onClick={handleAttachClick}
          >
            <Paperclip className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <VoiceInput
            value={value}
            onChange={onChange}
            disabled={disabled}
          />

          <button
            type="submit"
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-all active:scale-95 disabled:opacity-30",
              !value.trim() && internalAttachments.length === 0 && "bg-muted text-muted-foreground"
            )}
            disabled={disabled || (!value.trim() && internalAttachments.length === 0)}
            aria-label={submitLabel}
          >
            <SendHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
