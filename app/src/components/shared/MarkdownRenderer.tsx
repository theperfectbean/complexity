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
      <div className="group/code relative my-6 rounded-xl border border-border bg-muted/20 shadow-sm">
        <div className="sticky top-2 right-2 z-30 flex justify-end h-0 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-3">
            {language && (
              <span className="px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground/40 select-none bg-muted/50 rounded-md backdrop-blur-sm">
                {language}
              </span>
            )}
            <CopyButton content={content} />
          </div>
        </div>
        <div className="w-full overflow-x-auto overflow-hidden rounded-xl p-4 pt-12">
          <code className="block w-full text-[13px] leading-relaxed whitespace-pre-wrap font-mono">
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

export const MarkdownRenderer = memo(function MarkdownRenderer({ content, isStreaming }: MarkdownRendererProps) {
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
