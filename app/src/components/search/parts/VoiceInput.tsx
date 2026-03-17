"use client";

import { Mic, MicOff } from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type VoiceInputProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function VoiceInput({ value, onChange, disabled }: VoiceInputProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const onChangeRef = useRef(onChange);

  // Keep onChangeRef up to date
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const isSupported = typeof window !== "undefined" && 
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (!!window.navigator.mediaDevices?.getUserMedia || !!(window as any).webkitGetUserMedia);
    setIsSpeechSupported(isSupported);
  }, []);

  const toggleVoiceInput = async () => {
    if (!window.isSecureContext) {
      toast.error("Microphone access requires a Secure Context (HTTPS or localhost).");
      return;
    }

    if (isListening) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstart = () => {
        setIsListening(true);
        toast.info("Listening...", { duration: 2000 });
      };

      mediaRecorder.onstop = async () => {
        setIsListening(false);
        stream.getTracks().forEach(track => track.stop());

        if (chunksRef.current.length === 0) return;

        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("file", audioBlob, "audio.webm");

        const loadingToast = toast.loading("Transcribing...");

        try {
          const response = await fetch("/api/transcribe", {
            method: "POST",
            body: formData,
          });

          if (!response.ok) throw new Error("Transcription failed");

          const data = await response.json();
          if (data.text) {
            onChangeRef.current(value ? `${value} ${data.text}` : data.text);
            toast.success("Transcribed", { id: loadingToast });
          } else {
            toast.dismiss(loadingToast);
          }
        } catch (err) {
          console.error("Transcription error:", err);
          toast.error("Failed to transcribe audio.", { id: loadingToast });
        }
      };

      mediaRecorder.start();
    } catch (err) {
      console.error("Failed to start recording:", err);
      const errorName = err instanceof Error ? err.name : String(err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errMsg = errorName === "NotAllowedError" 
        ? "Permission denied. Check browser settings." 
        : errorName === "SecurityError"
        ? "Security error. Origin must be 'Secure' (HTTPS or localhost)."
        : `Could not access microphone: ${errorMessage || errorName}`;
      
      toast.error(errMsg);
      setIsListening(false);
    }
  };

  if (!isSpeechSupported) return null;

  return (
    <button
      type="button"
      onClick={toggleVoiceInput}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-xl transition-all active:scale-95",
        isListening 
          ? "bg-red-500 text-white animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.5)]" 
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        disabled && "opacity-50 cursor-not-allowed"
      )}
      aria-label={isListening ? "Stop listening" : "Start listening"}
    >
      {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
    </button>
  );
}
