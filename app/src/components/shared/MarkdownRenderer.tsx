import React, { memo, useState, useEffect } from "react";
import ReactMarkdown, { Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { ChartRenderer } from "./ChartRenderer";
import { Copy, Check } from "lucide-react";

type MarkdownRendererProps = {
  content: string;
  isStreaming?: boolean;
};

function CopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1.5 rounded-md border border-border bg-background/80 hover:bg-background text-muted-foreground hover:text-foreground transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 z-10"
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

const components: Components = {
  pre({ children, ...props }: React.ComponentPropsWithoutRef<"pre">) {
    return (
      <pre 
        {...props} 
        className={`${props.className || ""} group relative`}
      >
        {children}
      </pre>
    );
  },
  code({ inline, className, children, ...props }: React.ComponentPropsWithoutRef<"code"> & { inline?: boolean }) {
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
    
    // Most resilient detection: 
    if (!inline && content.startsWith('{') && content.endsWith('}')) {
      if (content.includes('"type"') && content.includes('"data"')) {
        return <ChartRenderer data={content} />;
      }
    }

    if (inline) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }

    const match = /language-(\w+)/.exec(className || "");
    const language = match ? match[1] : "";

    return (
      <div className="relative group/code">
        {language && (
          <div className="absolute top-0 right-12 px-2 py-1 text-[10px] font-bold uppercase text-muted-foreground/50 select-none pointer-events-none z-20">
            {language}
          </div>
        )}
        <CopyButton content={content} />
        <code className={className} {...props}>
          {children}
        </code>
      </div>
    );
  },
  table({ children, ...props }: React.ComponentPropsWithoutRef<"table">) {
    return (
      <table {...props}>
        {children}
      </table>
    );
  }
};

export const MarkdownRenderer = memo(function MarkdownRenderer({ content, isStreaming }: MarkdownRendererProps) {
  const [displayContent, setDisplayContent] = useState(content);

  useEffect(() => {
    if (!isStreaming) {
      setDisplayContent(content);
      return;
    }

    // Debounce updates during streaming to 100ms to reduce re-render frequency and jitter
    const timer = setTimeout(() => {
      setDisplayContent(content);
    }, 100);

    return () => clearTimeout(timer);
  }, [content, isStreaming]);

  return (
    <div className={`markdown-body max-w-none ${isStreaming ? "min-h-[100px]" : ""}`}>
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]} 
        rehypePlugins={isStreaming ? [] : [rehypeHighlight]}
        components={components}
      >
        {displayContent}
      </ReactMarkdown>
    </div>
  );
});
