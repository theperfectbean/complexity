import React, { memo, useState, useEffect } from "react";
import ReactMarkdown, { Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { ChartRenderer } from "./ChartRenderer";
import ArtifactRenderer from "./ArtifactRenderer";
import PythonExecutor from "./PythonExecutor";
import { Copy, Check } from "lucide-react";
import { cn, copyToClipboard } from "@/lib/utils";

import { LoadingSkeleton } from "./LoadingSkeleton";

type MarkdownRendererProps = {
  content: string;
  isStreaming?: boolean;
};

function CopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const success = await copyToClipboard(content);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1.5 rounded-md border border-border bg-background/90 hover:bg-background text-muted-foreground hover:text-foreground shadow-sm transition-all md:opacity-0 md:group-hover/code:opacity-100 md:focus/code:opacity-100 z-30"
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

const components: Components = {
  a({ children, href, ...props }: React.ComponentPropsWithoutRef<"a">) {
    // Destructure node to prevent it from being passed to the a element
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { node, ...rest } = props as Record<string, unknown>;
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
        {children}
      </a>
    );
  },
  pre({ children, ...props }: React.ComponentPropsWithoutRef<"pre">) {
    return (
      <div className="group/code relative my-6 rounded-xl border border-border/40 bg-muted/30 overflow-hidden shadow-sm">
        {children}
      </div>
    );
  },
  code({ className, children, ...props }: React.ComponentPropsWithoutRef<"code">) {
    // Extract text content from children
    const extractText = (node: unknown): string => {
      if (typeof node === "string") return node;
      if (Array.isArray(node)) return node.map(extractText).join("");
      if (node && typeof node === "object") {
        const record = node as { props?: { children?: unknown } };
        if (record.props?.children !== undefined) {
          return extractText(record.props.children);
        }
      }
      return "";
    };

    const content = extractText(children).trim();
    
    // Most resilient detection for chart data: 
    if (content.startsWith('{') && content.endsWith('}')) {
      if (content.includes('"type"') && content.includes('"data"')) {
        return <ChartRenderer data={content} />;
      }
    }

    // In react-markdown v9+, inline is no longer passed. 
    // We check if it's a block by looking for language- in className
    const isBlock = className?.includes("language-");

    if (!isBlock) {
      // Destructure node to prevent it from being passed to the code element
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { node: _node, ...rest } = props as Record<string, unknown>;
      return (
        <code className={cn("px-1.5 py-0.5 rounded-md bg-muted/60 text-foreground font-medium text-[0.9em]", className)} {...rest}>
          {children}
        </code>
      );
    }

    const match = /language-(\w+)/.exec(className || "");
    const language = match ? match[1] : "";

    // Python Sandbox interception
    if (language === "python") {
      return <PythonExecutor code={content} />;
    }

    // Artifact interception: HTML or explicit "artifact" language tag
    if (language === "html" || language === "artifact") {
      return <ArtifactRenderer code={content} language={language} />;
    }

    return (
      <>
        <div className="sticky top-0 right-0 w-full h-0 z-30 flex justify-end p-2 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-3">
            {language && (
              <span className="px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground/40 select-none bg-muted/50 rounded-md backdrop-blur-sm">
                {language}
              </span>
            )}
            <CopyButton content={content} />
          </div>
        </div>
        <div className="w-full overflow-x-auto">
          {(() => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { node: _node, ...rest } = props as Record<string, unknown>;
            return (
              <code className={cn("block w-full p-4 pt-12 text-[13px] leading-relaxed", className)} {...rest}>
                {children}
              </code>
            );
          })()}
        </div>
      </>
    );
  },
  table({ children, ...props }: React.ComponentPropsWithoutRef<"table">) {
    // Destructure node to prevent it from being passed to the table element
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { node, ...rest } = props as Record<string, unknown>;
    return (
      <div className="my-6 w-full overflow-x-auto rounded-xl border border-border/40 shadow-sm bg-card/40">
        <table {...rest}>
          {children}
        </table>
      </div>
    );
  }
};

export const MarkdownRenderer = memo(function MarkdownRenderer({ content, isStreaming }: MarkdownRendererProps) {
  const [displayContent, setDisplayContent] = useState(content);

  useEffect(() => {
    if (!isStreaming) {
      return;
    }

    // Debounce updates during streaming to 100ms to reduce re-render frequency and jitter
    const timer = setTimeout(() => {
      setDisplayContent(content);
    }, 100);

    return () => clearTimeout(timer);
  }, [content, isStreaming]);

  const finalContent = isStreaming ? displayContent : content;
  const isActuallyEmpty = !finalContent || finalContent === "\u200B" || finalContent.trim().length === 0;

  if (isStreaming && isActuallyEmpty) {
    return (
      <div className="markdown-body max-w-none">
        <LoadingSkeleton lines={2} />
      </div>
    );
  }

  return (
    <div className={`markdown-body max-w-none ${isStreaming ? "min-h-[100px]" : ""}`}>
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]} 
        rehypePlugins={isStreaming ? [] : [rehypeHighlight]}
        components={components}
      >
        {finalContent}
      </ReactMarkdown>
    </div>
  );
});
