"use client";

import { Globe, Paperclip, SendHorizontal, Square } from "lucide-react";
import { motion } from "motion/react";
import { useRef, useState, useEffect, useCallback } from "react";
import TextareaAutosize from "react-textarea-autosize";

import { getDefaultModel } from "@/lib/models";
import { runtimeConfig } from "@/lib/config";
import { cn } from "@/lib/utils";

import { VoiceInput } from "./parts/VoiceInput";
import { ModelSelector } from "./parts/ModelSelector";
import { SearchModelOption } from "@/lib/models";
import { FileAttachments, FileAttachmentsHandle } from "./parts/FileAttachments";
import { CommandMenu } from "@/components/chat/CommandMenu";
import { useSlashCommands } from "@/lib/hooks/useSlashCommands";
import { resolveSearchBackend } from "@/lib/search/registry";


type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  submitLabel: string;
  disabled?: boolean;
  onStop?: () => void;
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
  hideModelSelector?: boolean;
  "data-testid"?: string;
  id?: string;
  roleId?: string;
  threadId?: string;
};

const EMPTY_ATTACHMENTS: File[] = [];

export function SearchBar({
  value,
  onChange,
  placeholder,
  submitLabel,
  disabled,
  onStop,
  layoutId = "searchbar",
  compact,
  model = getDefaultModel(),
  onModelChange,
  modelOptions,
  onAttachClick,
  attachments: externalAttachments = EMPTY_ATTACHMENTS,
  onRemoveAttachment,
  webSearchEnabled = runtimeConfig.chat.defaultWebSearch,
  onWebSearchChange,
  autoFilter = true,
  hideModelSelector = false,
  "data-testid": dataTestId,
  id,
  roleId,
  threadId,
}: SearchBarProps) {
  const fileAttachmentsRef = useRef<FileAttachmentsHandle>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [internalAttachments, setInternalAttachments] = useState<File[]>(externalAttachments);
  const [isDragging, setIsDragging] = useState(false);


  useEffect(() => {
    setInternalAttachments(externalAttachments);
  }, [externalAttachments]);

  const handleAttachClick = () => {
    fileAttachmentsRef.current?.clickInput();
  };

  const handlePaste = useCallback((event: ClipboardEvent) => {
    const files: File[] = [];
    const clipboardData = event.clipboardData;
    if (!clipboardData) return;
    
    // Check files first
    if (clipboardData.files && clipboardData.files.length > 0) {
      for (let i = 0; i < clipboardData.files.length; i++) {
        files.push(clipboardData.files[i]);
      }
    } 
    
    // Then check items (especially for images)
    const items = clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === "file") {
        const file = items[i].getAsFile();
        if (file && !files.some(f => f.name === file.name && f.size === file.size)) {
          files.push(file);
        }
      }
    }

    if (files.length > 0) {
      fileAttachmentsRef.current?.processFiles(files);
    }
  }, []);

  const handleDrop = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      fileAttachmentsRef.current?.processFiles(files);
    }
  }, [disabled]);

  const handlePasteReact = (event: React.ClipboardEvent) => {
    handlePaste(event.nativeEvent as ClipboardEvent);
  };

  const handleDropReact = (event: React.DragEvent) => {
    handleDrop(event.nativeEvent as DragEvent);
  };

  useEffect(() => {
    // Only use native listener for dropping on the container background if needed,
    // but the onDrop on motion.div already calls onContainerDrop.
    // The textarea needs its own listener to prevent default properly.
  }, []);

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!disabled) setIsDragging(true);
  };

  const handleDragEnter = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  };

  const onContainerDrop = (event: React.DragEvent) => {
    // Only handle if it didn't come from the textarea (already handled)
    if (event.target === textareaRef.current) return;
    
    handleDrop(event.nativeEvent as DragEvent);
  };

  const { showCommandMenu, commandQuery, handleTextChange, handleCommandSelect, closeMenu, matchedCommands, allCommands } =
    useSlashCommands(onChange, { threadId });

  // F5: Restore draft from sessionStorage on mount
  useEffect(() => {
    if (!threadId || value) return;
    try {
      const draft = sessionStorage.getItem(`draft:${threadId}`);
      if (draft) onChange(draft);
    } catch { /* sessionStorage unavailable */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  // F5: Persist draft to sessionStorage when value changes
  useEffect(() => {
    if (!threadId) return;
    try {
      if (value) {
        sessionStorage.setItem(`draft:${threadId}`, value);
      } else {
        sessionStorage.removeItem(`draft:${threadId}`);
      }
    } catch { /* sessionStorage unavailable */ }
  }, [threadId, value]);

  return (
    <motion.div
      id={id}
      layoutId={layoutId}
      layout={!compact}
      data-testid={dataTestId || id}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={onContainerDrop}
      className={cn(
        "relative flex flex-col rounded-[22px] border bg-card p-2 shadow-md transition-all duration-200",
        "focus-within:border-primary/30 focus-within:ring-4 focus-within:ring-primary/5 focus-within:shadow-lg",
        isDragging && "border-primary/50 ring-4 ring-primary/10 bg-primary/5 shadow-xl scale-[1.01]"
      )}
    >
      {showCommandMenu && (
        <CommandMenu
          query={commandQuery}
          commands={matchedCommands}
          onSelect={handleCommandSelect}
          onClose={closeMenu}
        />
      )}
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
          ref={textareaRef}
          minRows={compact ? 1 : 2}
          maxRows={12}
          value={value}
          onChange={handleTextChange}
          onKeyDown={(event) => {
            // Block navigation keys while the command picker menu is open
            if (showCommandMenu && (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "Enter" || event.key === "Tab")) {
              if (event.key === "Enter" || event.key === "Tab") event.preventDefault();
              return;
            }

            if (event.key === "Enter" && !event.shiftKey) {
              // Execute a fully-formed slash command: /{trigger} {prompt text}
              if (value.startsWith("/")) {
                const matched = allCommands.find((cmd) => {
                  const prefix = `/${cmd.trigger} `;
                  return value.toLowerCase().startsWith(prefix.toLowerCase()) && value.length > prefix.length;
                });
                if (matched) {
                  event.preventDefault();
                  handleCommandSelect(matched);
                  return;
                }
              }
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          onPaste={handlePasteReact}
          onDrop={handleDropReact}
          disabled={disabled}
          placeholder={placeholder}
          className="flex-1 resize-none bg-transparent py-2.5 text-[15px] outline-none placeholder:text-muted-foreground/60 disabled:opacity-50 leading-relaxed"
        />
      </div>

      <div className="mt-1 flex items-center justify-between gap-2 px-1 pb-1">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
          {!hideModelSelector && (
            <>
              <ModelSelector
                model={model}
                onModelChange={onModelChange}
                modelOptions={modelOptions}
                autoFilter={autoFilter}
              />
              <div className="h-4 w-px bg-border/40 mx-0.5" />
            </>
          )}

          <button
            type="button"
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-xl px-2 text-[13px] font-medium transition-all",
              webSearchEnabled
                ? "text-primary hover:bg-primary/10"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
            aria-label="Toggle web search"
            title={webSearchEnabled
              ? (() => {
                  const provider = runtimeConfig.searchAgent.provider;
                  const providerName = resolveSearchBackend(provider)?.displayName ?? "Search Agent";
                  return `Web search active (via ${providerName})`;
                })()
              : "Enable web search"}
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
            disabled={disabled && !onStop}
          />

          {onStop ? (
            <button
              type="button"
              onClick={onStop}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-foreground text-background transition-all active:scale-95"
              aria-label="Stop generation"
            >
              <Square className="h-3 w-3 fill-current" />
            </button>
          ) : (
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
          )}
        </div>
      </div>
    </motion.div>
  );
}
