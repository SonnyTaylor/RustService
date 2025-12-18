/**
 * Chat Message Component
 *
 * Displays individual messages in the agent chat interface with
 * support for tool calls, streaming, and code formatting.
 */

import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  User,
  Bot,
  Terminal,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { MessageRole } from "@/types/agent";

interface ToolCallDisplay {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  status?: "pending" | "success" | "error";
}

interface ChatMessageProps {
  role: MessageRole;
  content: string;
  isStreaming?: boolean;
  toolCalls?: ToolCallDisplay[];
  timestamp?: string;
}

/**
 * Format tool name for display
 */
function formatToolName(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Code block with copy button
 */
function CodeBlock({
  code,
  language = "text",
}: {
  code: string;
  language?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group rounded-lg overflow-hidden bg-muted/50 border">
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30">
        <span className="text-xs text-muted-foreground font-mono">
          {language}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={handleCopy}
        >
          {copied ? (
            <Check className="h-3 w-3" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </Button>
      </div>
      <pre className="p-3 overflow-x-auto text-sm">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}

/**
 * Tool call display component
 */
function ToolCallCard({ toolCall }: { toolCall: ToolCallDisplay }) {
  const [expanded, setExpanded] = useState(false);

  const StatusIcon =
    toolCall.status === "success"
      ? CheckCircle2
      : toolCall.status === "error"
        ? XCircle
        : Clock;

  const statusColor =
    toolCall.status === "success"
      ? "text-green-500"
      : toolCall.status === "error"
        ? "text-red-500"
        : "text-yellow-500";

  return (
    <Card className="mt-2 bg-muted/30 border-muted">
      <CardContent className="p-3">
        <button
          className="flex items-center gap-2 w-full text-left"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <Terminal className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">
            {formatToolName(toolCall.name)}
          </span>
          <StatusIcon className={cn("h-4 w-4 ml-auto", statusColor)} />
        </button>

        {expanded && (
          <div className="mt-3 space-y-3">
            {/* Arguments */}
            <div>
              <span className="text-xs text-muted-foreground uppercase font-medium">
                Arguments
              </span>
              <CodeBlock
                code={JSON.stringify(toolCall.arguments, null, 2)}
                language="json"
              />
            </div>

            {/* Result */}
            {toolCall.result !== undefined && (
              <div>
                <span className="text-xs text-muted-foreground uppercase font-medium">
                  Result
                </span>
                <CodeBlock
                  code={
                    typeof toolCall.result === "string"
                      ? toolCall.result
                      : JSON.stringify(toolCall.result, null, 2)
                  }
                  language="json"
                />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Formatted content using ReactMarkdown for proper markdown rendering
 */
function FormattedContent({ content }: { content: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <ReactMarkdown
        components={{
          // Custom code block rendering
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !className;
            
            if (isInline) {
              return (
                <code className="px-1.5 py-0.5 rounded bg-muted/50 font-mono text-sm" {...props}>
                  {children}
                </code>
              );
            }
            
            return (
              <CodeBlock 
                code={String(children).replace(/\n$/, '')} 
                language={match?.[1] || 'text'} 
              />
            );
          },
          // Custom pre to avoid double wrapping
          pre({ children }) {
            return <>{children}</>;
          },
          // Custom list styling
          ul({ children }) {
            return <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal list-inside space-y-1 my-2">{children}</ol>;
          },
          li({ children }) {
            return <li className="text-sm">{children}</li>;
          },
          // Custom paragraph styling
          p({ children }) {
            return <p className="my-1.5 leading-relaxed">{children}</p>;
          },
          // Strong/bold text
          strong({ children }) {
            return <strong className="font-semibold">{children}</strong>;
          },
          // Headers
          h1({ children }) {
            return <h1 className="text-lg font-bold mt-3 mb-2">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-base font-bold mt-3 mb-1.5">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-sm font-bold mt-2 mb-1">{children}</h3>;
          },
          // Links
          a({ href, children }) {
            return (
              <a 
                href={href} 
                className="text-primary underline underline-offset-2 hover:text-primary/80"
                target="_blank"
                rel="noopener noreferrer"
              >
                {children}
              </a>
            );
          },
          // Blockquotes
          blockquote({ children }) {
            return (
              <blockquote className="border-l-2 border-primary/50 pl-3 my-2 italic text-muted-foreground">
                {children}
              </blockquote>
            );
          },
          // Horizontal rules
          hr() {
            return <hr className="my-3 border-border" />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Main chat message component
 */
export const ChatMessage = memo(function ChatMessage({
  role,
  content,
  isStreaming,
  toolCalls,
  timestamp,
}: ChatMessageProps) {
  const isUser = role === "user";
  const isSystem = role === "system";

  if (isSystem) {
    return (
      <div className="flex justify-center my-4">
        <Badge variant="secondary" className="text-xs">
          {content}
        </Badge>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex gap-3 py-4",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted",
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      {/* Content */}
      <div
        className={cn(
          "flex-1 min-w-0 space-y-1",
          isUser ? "items-end" : "items-start",
        )}
      >
        {/* Header */}
        <div
          className={cn(
            "flex items-center gap-2 text-xs text-muted-foreground",
            isUser ? "flex-row-reverse" : "flex-row",
          )}
        >
          <span className="font-medium">{isUser ? "You" : "Agent"}</span>
          {timestamp && <span>{new Date(timestamp).toLocaleTimeString()}</span>}
        </div>

        {/* Message bubble */}
        <div
          className={cn(
            "rounded-2xl px-4 py-3 max-w-[85%]",
            isUser ? "bg-primary text-primary-foreground ml-auto" : "bg-muted",
            isStreaming && !content && "min-w-[60px]",
          )}
        >
          {content ? (
            <FormattedContent content={content} />
          ) : isStreaming ? (
            <div className="flex items-center gap-1">
              <span
                className="w-2 h-2 rounded-full bg-current animate-bounce"
                style={{ animationDelay: "0ms" }}
              />
              <span
                className="w-2 h-2 rounded-full bg-current animate-bounce"
                style={{ animationDelay: "150ms" }}
              />
              <span
                className="w-2 h-2 rounded-full bg-current animate-bounce"
                style={{ animationDelay: "300ms" }}
              />
            </div>
          ) : null}

          {isStreaming && content && (
            <span className="inline-block w-2 h-4 ml-1 bg-current animate-pulse" />
          )}
        </div>

        {/* Tool calls */}
        {toolCalls && toolCalls.length > 0 && (
          <div className="space-y-2 max-w-[85%]">
            {toolCalls.map((tc) => (
              <ToolCallCard key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

export default ChatMessage;
