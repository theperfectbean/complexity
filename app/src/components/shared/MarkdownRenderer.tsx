import React, { memo } from "react";
import ReactMarkdown, { Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { ChartRenderer } from "./ChartRenderer";

type MarkdownRendererProps = {
  content: string;
};

const components: Components = {
  code({ inline, className, children, ...props }: React.ComponentPropsWithoutRef<"code"> & { inline?: boolean }) {
    const content = String(children).trim();
    
    // Most resilient detection: 
    if (!inline && content.startsWith('{') && content.endsWith('}')) {
      if (content.includes('"type"') && content.includes('"data"')) {
        return <ChartRenderer data={content} />;
      }
    }

    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }
};

export const MarkdownRenderer = memo(function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="markdown-body max-w-none">
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]} 
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
