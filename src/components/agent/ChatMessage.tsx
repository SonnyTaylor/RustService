/**
 * Chat Message Component (Redesigned)
 *
 * Displays messages in a Claude/Cursor-style interface with:
 * - Activity items showing agent actions
 * - Terminal output blocks for commands
 * - File references with icons
 * - Clean, minimal design
 */

import { memo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { User, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AgentActivityItem } from './AgentActivityItem';
import type { MessageRole } from '@/types/agent';
import type { AgentActivity } from '@/types/agent-activity';

interface ChatMessageProps {
  role: MessageRole;
  content: string;
  isStreaming?: boolean;
  activities?: AgentActivity[];
  timestamp?: string;
}

/**
 * Code block with copy button
 */
function CodeBlock({
  code,
  language = 'text',
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
    <div className="relative group rounded-lg overflow-hidden bg-zinc-900 border border-border/30 my-2">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/30 bg-zinc-800/50">
        <span className="text-xs text-zinc-500 font-mono">{language}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={handleCopy}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>
      <pre className="p-3 overflow-x-auto text-sm">
        <code className="font-mono text-zinc-300">{code}</code>
      </pre>
    </div>
  );
}

/**
 * Formatted markdown content
 */
function FormattedContent({ content }: { content: string }) {
  return (
    <div className="prose prose-sm prose-invert max-w-none">
      <ReactMarkdown
        components={{
          // Custom code block rendering
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !className;

            if (isInline) {
              return (
                <code
                  className="px-1.5 py-0.5 rounded bg-zinc-800 font-mono text-sm text-zinc-300"
                  {...props}
                >
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
            return <ul className="list-disc list-inside space-y-1 my-2 text-zinc-300">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal list-inside space-y-1 my-2 text-zinc-300">{children}</ol>;
          },
          li({ children }) {
            return <li className="text-sm">{children}</li>;
          },
          // Custom paragraph styling
          p({ children }) {
            return <p className="my-1.5 leading-relaxed text-zinc-300">{children}</p>;
          },
          // Strong/bold text
          strong({ children }) {
            return <strong className="font-semibold text-zinc-100">{children}</strong>;
          },
          // Headers
          h1({ children }) {
            return <h1 className="text-lg font-bold mt-3 mb-2 text-zinc-100">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-base font-bold mt-3 mb-1.5 text-zinc-100">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-sm font-bold mt-2 mb-1 text-zinc-100">{children}</h3>;
          },
          // Links
          a({ href, children }) {
            return (
              <a
                href={href}
                className="text-blue-400 underline underline-offset-2 hover:text-blue-300"
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
              <blockquote className="border-l-2 border-zinc-600 pl-3 my-2 italic text-zinc-400">
                {children}
              </blockquote>
            );
          },
          // Horizontal rules
          hr() {
            return <hr className="my-3 border-zinc-700" />;
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
  activities,
  timestamp,
}: ChatMessageProps) {
  const isUser = role === 'user';
  const isSystem = role === 'system';

  // System messages
  if (isSystem) {
    return (
      <div className="flex justify-center my-4">
        <span className="text-xs text-zinc-500 px-3 py-1 rounded-full bg-zinc-800/50">
          {content}
        </span>
      </div>
    );
  }

  // User messages - keep bubble style
  if (isUser) {
    return (
      <div className="flex gap-3 py-3 flex-row-reverse">
        {/* Avatar */}
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
          <User className="h-4 w-4" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 flex flex-col items-end">
          <div className="flex items-center gap-2 text-xs text-zinc-500 flex-row-reverse mb-1">
            <span className="font-medium">You</span>
            {timestamp && <span>{new Date(timestamp).toLocaleTimeString()}</span>}
          </div>
          <div className="rounded-2xl px-4 py-3 bg-primary text-primary-foreground max-w-[85%]">
            <FormattedContent content={content} />
          </div>
        </div>
      </div>
    );
  }

  // Assistant messages - new clean layout
  return (
    <div className="py-3">
      {/* Activities (shown before content) */}
      {activities && activities.length > 0 && (
        <div className="space-y-0.5 mb-3">
          {activities.map((activity) => (
            <AgentActivityItem key={activity.id} activity={activity} />
          ))}
        </div>
      )}

      {/* Assistant text content */}
      {content && (
        <div className="text-zinc-300">
          <FormattedContent content={content} />
        </div>
      )}

      {/* Streaming indicator */}
      {isStreaming && !content && (
        <div className="flex items-center gap-2 text-zinc-500">
          <span className="text-sm">Thinking</span>
          <span className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
        </div>
      )}

      {/* Streaming cursor */}
      {isStreaming && content && (
        <span className="inline-block w-2 h-4 ml-1 bg-zinc-500 animate-pulse" />
      )}
    </div>
  );
});

export default ChatMessage;
