"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Globe, Paperclip, SendHorizontal, X, FileText, Mic, MicOff } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useRef, useState, useEffect } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { toast } from "sonner";

import { MODELS, getDefaultModel } from "@/lib/models";
import { cn } from "@/lib/utils";

// Add global type for Web Speech API if not already defined
interface SpeechRecognitionEvent extends Event {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
    };
    length: number;
  };
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: () => void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onend: () => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  start: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

type SearchModelOption = {
  id: string;
  label: string;
  category: string;
  isPreset: boolean;
};

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
  modelOptions: providedModelOptions,
  onAttachClick,
  attachments = EMPTY_ATTACHMENTS,
  onRemoveAttachment,
  webSearchEnabled = true,
  onWebSearchChange,
  autoFilter = true,
  "data-testid": dataTestId,
  id,
  roleId,
}: SearchBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const onChangeRef = useRef(onChange);
  
  // Keep onChangeRef up to date
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const [internalAttachments, setInternalAttachments] = useState<File[]>(attachments);
  const [imagePreviews, setImagePreviews] = useState<Record<string, string>>({});
  const [availableModels, setAvailableModels] = useState<readonly SearchModelOption[]>(providedModelOptions || MODELS);
  const [hasUserSelectedModel, setHasUserSelectedModel] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);

  useEffect(() => {
    const SpeechRecognition = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (SpeechRecognition) {
      setIsSpeechSupported(true);
    }
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const toggleVoiceInput = () => {
    const SpeechRecognition = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
    
    if (!SpeechRecognition) {
      toast.error("Speech Recognition API not found in this browser.");
      return;
    }

    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.error("Stop error", e);
      }
      setIsListening(false);
      return;
    }

    try {
      // Create a fresh instance
      const recognition = new SpeechRecognition();
      
      // Basic configuration
      recognition.continuous = true;
      recognition.interimResults = true;
      
      // Note: Omit recognition.lang to let it use browser default, 
      // which is more reliable on some Linux Chromium builds.

      recognition.onstart = () => {
        setIsListening(true);
        toast.info("Listening...", { duration: 2000 });
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let transcript = "";
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        
        if (transcript) {
          onChangeRef.current(transcript);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error("Speech recognition error", event.error);
        
        if (event.error === "network") {
          toast.error("Speech recognition failed (Network). This origin might not be trusted as 'Secure'.");
        } else if (event.error === "not-allowed") {
          toast.error("Permission denied. Check Chrome settings and SSL trust.");
        } else if (event.error === "no-speech") {
          // Silent failure is fine for no-speech
          setIsListening(false);
        } else {
          toast.error(`Error: ${event.error}`);
        }
        
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;
      
      // Final step: Try to start
      toast.info("Activating microphone...");
      recognition.start();
    } catch (err) {
      console.error("Failed to start recognition:", err);
      toast.error("Failed to initialize microphone.");
      setIsListening(false);
    }
  };

  useEffect(() => {
    setInternalAttachments(attachments);
  }, [attachments]);

  useEffect(() => {
    if (autoFilter && !providedModelOptions) {
      fetch("/api/models")
        .then(res => res.json())
        .then(data => {
          if (data.models && data.models.length > 0) {
            setAvailableModels(data.models);
            
            // Logic: if user hasn't explicitly clicked a model yet, 
            // OR if current model is invalid, switch to the TOP model in the list.
            const currentModelIsValid = data.models.some((m: SearchModelOption) => m.id === model);
            const isInitialDefault = model === getDefaultModel();

            if (!currentModelIsValid || (!hasUserSelectedModel && isInitialDefault)) {
              const topModel = data.models[0].id;
              if (topModel && topModel !== model) {
                onModelChange?.(topModel);
              }
            }
          }
        })
        .catch(err => console.error("Failed to fetch available models:", err));
    }
  }, [autoFilter, providedModelOptions, model, onModelChange, hasUserSelectedModel]);

  const modelOptions = availableModels;

  const groupedModels = useMemo(() => {
    return modelOptions.reduce<Record<string, SearchModelOption[]>>((accumulator, option) => {
      if (!accumulator[option.category]) {
        accumulator[option.category] = [];
      }
      accumulator[option.category].push(option);
      return accumulator;
    }, {});
  }, [modelOptions]);

  const activeModelLabel = modelOptions.find((item) => item.id === model)?.label ?? model;

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleModelSelect = (id: string) => {
    setHasUserSelectedModel(true);
    onModelChange?.(id);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const filesArray = Array.from(files);
    
    for (const file of filesArray) {
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
      setInternalAttachments((prev) => [...prev, file]);
    }
    
    onAttachClick?.(files);
    event.target.value = "";
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
      <input
        type="file"
        ref={fileInputRef}
        data-testid="file-upload-input"
        className="hidden"
        multiple
        onChange={handleFileChange}
        accept=".pdf,.docx,.txt,.md,image/jpeg,image/png,image/webp"
      />
      
      {internalAttachments.length > 0 && (
        <div className="flex flex-wrap gap-2 pb-1.5 px-2" data-testid="attachments-container">
          {internalAttachments.map((file, index) => {
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
                  onClick={() => {
                    setInternalAttachments(prev => prev.filter((_, i) => i !== index));
                    setImagePreviews(prev => {
                      const copy = { ...prev };
                      delete copy[file.name];
                      return copy;
                    });
                    onRemoveAttachment?.(index);
                  }}
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
        <div className="flex items-center gap-1.5">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-transparent px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                aria-label="Select model"
              >
                <span className="max-w-32 truncate">{activeModelLabel}</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-50" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                sideOffset={8}
                className="z-50 max-h-80 min-w-64 overflow-y-auto rounded-2xl border bg-popover/95 p-1.5 shadow-xl backdrop-blur-sm animate-in fade-in zoom-in-95"
              >
                {Object.entries(groupedModels).map(([category, options]) => (
                  <div key={category} className="py-1">
                    <p className="px-3 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/50">{category}</p>
                    {options.map((option) => (
                      <DropdownMenu.Item
                        key={option.id}
                        onSelect={() => handleModelSelect(option.id)}
                        className={cn(
                          "flex cursor-pointer items-center rounded-lg px-3 py-2 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground",
                          model === option.id && "bg-primary/5 text-primary font-medium"
                        )}
                      >
                        {option.label}
                      </DropdownMenu.Item>
                    ))}
                  </div>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>

          <div className="h-4 w-px bg-border/40 mx-0.5" />

          <button
            type="button"
            className={cn(
              "inline-flex h-8 w-fit items-center gap-1.5 rounded-xl px-2.5 text-[13px] font-medium transition-all",
              webSearchEnabled
                ? "text-primary hover:bg-primary/10"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
            aria-label="Toggle web search"
            onClick={() => onWebSearchChange?.(!webSearchEnabled)}
          >
            <Globe className={cn("h-4 w-4", webSearchEnabled ? "text-primary" : "opacity-60")} />
            <span>Search</span>
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
          {isSpeechSupported && (
            <button
              type="button"
              onClick={toggleVoiceInput}
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-xl transition-all active:scale-95",
                isListening 
                  ? "bg-red-500 text-white animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.5)]" 
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
              aria-label={isListening ? "Stop listening" : "Start listening"}
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          )}

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
