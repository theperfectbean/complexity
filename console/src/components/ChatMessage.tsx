import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEffect } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import "prismjs/themes/prism-tomorrow.css";
import { MessageRole } from "../lib/llm";

interface ChatMessageProps {
  role: MessageRole;
  content: string;
}

const ChatMessage = ({ role, content }: ChatMessageProps) => {
  useEffect(() => {
    Prism.highlightAll();
  }, [content]);

  if (role === "system") return null;

  return (
    <div className={"flex " + (role === "user" ? "justify-end" : "justify-start")}>
      <div className={"max-w-[85%] p-4 rounded-lg " + (
        role === "user" 
          ? "bg-primary text-primary-foreground" 
          : "bg-muted text-foreground"
      )}>
        <div className="markdown-body">
          <ReactMarkdown 
            remarkPlugins={[remarkGfm]}
            components={{
              code({ className, children, ...props }: any) {
                return (
                  <code className={(className || "") + " bg-background/50 px-1.5 py-0.5 rounded text-sm font-mono"} {...props}>
                    {children}
                  </code>
                );
              },
              pre({ children }: any) {
                return (
                  <pre className="bg-background p-4 rounded-lg overflow-x-auto my-4 border border-border">
                    {children}
                  </pre>
                );
              },
              table({ children }: any) {
                return (
                  <div className="overflow-x-auto my-4">
                    <table className="w-full border-collapse border border-border">
                      {children}
                    </table>
                  </div>
                );
              },
              th({ children }: any) {
                return <th className="border border-border p-2 bg-background/50 text-left">{children}</th>;
              },
              td({ children }: any) {
                return <td className="border border-border p-2">{children}</td>;
              }
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;
