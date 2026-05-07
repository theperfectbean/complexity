"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface MermaidRendererProps {
  code: string;
}

let mermaidInitialized = false;

export function MermaidRenderer({ code }: MermaidRendererProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const mermaid = (await import("mermaid")).default;
        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            theme: document.documentElement.classList.contains("dark") ? "dark" : "default",
            securityLevel: "loose",
            fontFamily: "inherit",
          });
          mermaidInitialized = true;
        }

        const id = "mermaid-" + Math.random().toString(36).slice(2, 9);
        const { svg } = await mermaid.render(id, code.trim());

        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
          setRendered(true);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Diagram render error");
        }
      }
    }

    render();
    return () => { cancelled = true; };
  }, [code]);

  if (error) {
    return (
      <div className="my-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-destructive mb-2">Diagram error</p>
        <pre className="text-xs text-muted-foreground whitespace-pre-wrap">{error}</pre>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "my-4 rounded-xl border border-border bg-card p-4 overflow-x-auto transition-opacity",
        rendered ? "opacity-100" : "opacity-0",
      )}
    >
      <div ref={ref} className="flex justify-center [&_svg]:max-w-full [&_svg]:h-auto" />
    </div>
  );
}
