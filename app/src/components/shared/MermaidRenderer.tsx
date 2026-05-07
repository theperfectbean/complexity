"use client";
import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

let mermaidInitialized = false;

function initMermaid() {
  if (!mermaidInitialized) {
    mermaid.initialize({
      startOnLoad: false,
      theme: "default",
      securityLevel: "loose",
      fontFamily: "inherit",
    });
    mermaidInitialized = true;
  }
}

export function MermaidRenderer({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    if (!code.trim()) return;
    initMermaid();

    const id = `mermaid-${Math.random().toString(36).slice(2)}`;

    mermaid
      .render(id, code.trim())
      .then(({ svg: rendered }) => {
        setSvg(rendered);
        setError(null);
      })
      .catch((err: Error) => {
        setError(err?.message ?? "Invalid diagram");
        setSvg(null);
      });
  }, [code]);

  if (error) {
    return (
      <div className="my-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        <span className="font-semibold">Diagram error:</span> {error}
      </div>
    );
  }

  if (!svg) return null;

  return (
    <div
      ref={ref}
      className="my-4 flex justify-center overflow-x-auto rounded-xl border border-border/40 bg-card/40 p-6"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
