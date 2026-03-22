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
  hasThinking?: boolean;
};

// Helper to extract plain text from React nodes
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
      className="p-1.5 rounded-md bg-white/80 dark:bg-zinc-700/60 hover:bg-white dark:hover:bg-zinc-600/80 border border-black/10 dark:border-white/10 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 shadow-sm transition-all"
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-400" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

const components: Components = {
  a({ children, href, ...props }: React.ComponentPropsWithoutRef<"a">) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { node, ...rest } = props as Record<string, unknown>;
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
        {children}
      </a>
    );
  },
  pre({ children, ...props }: React.ComponentPropsWithoutRef<"pre">) {
    const content = extractText(children).trim();
    
    let language = "";
    if (React.isValidElement(children)) {
      const className = (children.props as { className?: string }).className || "";
      const match = /language-(\w+)/.exec(className);
      if (match) language = match[1];
    }

    // Interception components should be returned directly
    const childType = React.isValidElement(children) ? (children.type as any) : null;
    if (childType === ChartRenderer || childType === PythonExecutor || childType === ArtifactRenderer) {
      return <>{children}</>;
    }

    return (
      <div className="relative my-4 rounded-xl overflow-hidden border border-border/60 bg-[#f6f8fa] dark:bg-[#161b22]">
        {/* Copy button — sticky so it stays top-right as the page scrolls */}
        <div className="sticky top-2 z-10 h-0 flex justify-end overflow-visible pointer-events-none">
          <div className="pointer-events-auto mr-2 mt-2">
            <CopyButton content={content} />
          </div>
        </div>
        <div className="overflow-x-auto p-4 pt-10">
          <code className="block text-[13px] leading-relaxed whitespace-pre font-mono">
            {children}
          </code>
        </div>
      </div>
    );
  },
  code({ className, children, ...props }: React.ComponentPropsWithoutRef<"code">) {
    const content = extractText(children).trim();
    
    // Detection for chart data: 
    if (content.startsWith('{') && content.endsWith('}')) {
      if (content.includes('"type"') && content.includes('"data"')) {
        return <ChartRenderer data={content} />;
      }
    }

    const match = /language-(\w+)/.exec(className || "");
    const language = match ? match[1] : "";

    if (language === "python") {
      return <PythonExecutor code={content} />;
    }

    if (language === "html" || language === "artifact") {
      return <ArtifactRenderer code={content} language={language} />;
    }

    // Check if we are a block code (usually has language class or hljs)
    const isBlock = className?.includes("language-") || className?.includes("hljs");

    if (isBlock) {
      // Just return the children, the pre component handles the block styling
      return <>{children}</>;
    }

    // Inline code
    return (
      <code className={cn("px-1.5 py-0.5 rounded-md bg-muted/60 text-foreground font-medium text-[0.9em]", className)} {...props}>
        {children}
      </code>
    );
  },
  table({ children, ...props }: React.ComponentPropsWithoutRef<"table">) {
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

export const MarkdownRenderer = memo(function MarkdownRenderer({ content, isStreaming, hasThinking }: MarkdownRendererProps) {
  const [displayContent, setDisplayContent] = useState(content);

  useEffect(() => {
    if (!isStreaming) {
      return;
    }

    const timer = setTimeout(() => {
      setDisplayContent(content);
    }, 100);

    return () => clearTimeout(timer);
  }, [content, isStreaming]);

  const finalContent = isStreaming ? displayContent : content;
  const isActuallyEmpty = !finalContent || finalContent === "\u200B" || finalContent.trim().length === 0;

  if (isStreaming && isActuallyEmpty) {
    if (hasThinking) {
      return null;
    }
    return (
      <div className="markdown-body max-w-none">
        <LoadingSkeleton lines={1} />
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
