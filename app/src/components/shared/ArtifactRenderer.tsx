"use client";

import { useState } from "react";
import { Code, Eye } from "lucide-react";

interface ArtifactRendererProps {
  code: string;
  language: string;
}

/**
 * Renders self-contained HTML artifacts in a sandboxed iframe with a
 * preview/source toggle — similar to Claude Artifacts.
 */
export default function ArtifactRenderer({ code, language }: ArtifactRendererProps) {
  const [view, setView] = useState<"preview" | "source">("preview");

  return (
    <div className="my-4 rounded-xl border border-border overflow-hidden bg-background shadow-sm">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {language === "html" ? "HTML Artifact" : "Artifact"}
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => setView("preview")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              view === "preview"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <Eye className="h-3 w-3" />
            Preview
          </button>
          <button
            onClick={() => setView("source")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              view === "source"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <Code className="h-3 w-3" />
            Source
          </button>
        </div>
      </div>

      {/* Content */}
      {view === "preview" ? (
        <iframe
          srcDoc={code}
          sandbox="allow-scripts allow-same-origin"
          className="w-full border-0"
          style={{ height: "420px" }}
          title="Artifact preview"
        />
      ) : (
        <pre className="overflow-auto p-4 text-sm leading-relaxed bg-muted/30 max-h-[420px]">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
