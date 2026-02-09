/**
 * Chat Message Component
 *
 * Displays messages with interleaved text and tool activity parts.
 * Supports linear flow: text → tool → text → tool → text
 */

import { memo, useState, useCallback } from 'react';
import { User, Bot, Copy, Check } from 'lucide-react';
import { AgentActivityItem } from './AgentActivityItem';
import { MemoizedMarkdown } from './MemoizedMarkdown';
import type { MessageRole } from '@/types/agent';
import type { AgentActivity } from '@/types/agent-activity';

// =============================================================================
// Types
// =============================================================================

export interface MessagePart {
  type: 'text' | 'tool';
  content?: string;
  activity?: AgentActivity;
}

interface ChatMessageProps {
  id?: string;
  role: MessageRole;
  content: string;
  isStreaming?: boolean;
  parts?: MessagePart[];
  timestamp?: string;
  onActivityApprove?: (activityId: string) => void;
  onActivityReject?: (activityId: string) => void;
}

// =============================================================================
// Component
// =============================================================================

export const ChatMessage = memo(function ChatMessage({
  id,
  role,
  content,
  isStreaming,
  parts,
  timestamp,
  onActivityApprove,
  onActivityReject,
}: ChatMessageProps) {
  const isUser = role === 'user';
  const isSystem = role === 'system';
  const messageId = id || `msg-${Date.now()}`;

  // System messages
  if (isSystem) {
    return (
      <div className="flex justify-center my-4">
        <span className="text-xs text-muted-foreground px-3 py-1 rounded-full bg-muted/50">
          {content}
        </span>
      </div>
    );
  }

  // User messages — right-aligned bubble
  if (isUser) {
    return (
      <div className="flex gap-3 py-3 flex-row-reverse">
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
          <User className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0 flex flex-col items-end">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-row-reverse mb-1.5">
            <span className="font-medium">You</span>
            {timestamp && <span>{new Date(timestamp).toLocaleTimeString()}</span>}
          </div>
          <div className="rounded-2xl px-4 py-2.5 bg-primary text-primary-foreground max-w-[85%]">
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{content}</p>
          </div>
        </div>
      </div>
    );
  }

  // Assistant messages — left-aligned with interleaved parts
  const hasParts = parts && parts.length > 0;
  const hasContent = !!content;
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    // Gather all text content from parts, or fall back to content prop
    let textToCopy = '';
    if (hasParts) {
      textToCopy = parts.filter(p => p.type === 'text' && p.content).map(p => p.content).join('\n\n');
    }
    if (!textToCopy) textToCopy = content;
    if (!textToCopy) return;

    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [content, hasParts, parts]);

  return (
    <div className="group/msg flex gap-3 py-3">
      {/* Avatar */}
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center mt-0.5">
        <Bot className="h-3.5 w-3.5" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1.5">
          <span className="font-medium">Agent</span>
          {timestamp && <span>{new Date(timestamp).toLocaleTimeString()}</span>}

          {/* Copy button — visible on hover */}
          {(hasContent || hasParts) && !isStreaming && (
            <button
              onClick={handleCopy}
              className="ml-auto opacity-0 group-hover/msg:opacity-100 transition-opacity p-1 rounded hover:bg-muted"
              title="Copy message"
            >
              {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
            </button>
          )}
        </div>

        {/* Render interleaved parts if available */}
        {hasParts ? (
          <div className="space-y-2">
            {parts.map((part, index) => {
              if (part.type === 'text' && part.content) {
                return (
                  <div key={`text-${index}`} className="text-sm text-foreground/90 leading-relaxed">
                    <MemoizedMarkdown content={part.content} id={`${messageId}-t${index}`} />
                  </div>
                );
              }
              if (part.type === 'tool' && part.activity) {
                return (
                  <AgentActivityItem
                    key={part.activity.id}
                    activity={part.activity}
                    onApprove={onActivityApprove}
                    onReject={onActivityReject}
                  />
                );
              }
              return null;
            })}
          </div>
        ) : hasContent ? (
          /* Fallback: render plain content for loaded conversations */
          <div className="text-sm text-foreground/90 leading-relaxed">
            <MemoizedMarkdown content={content} id={messageId} />
          </div>
        ) : null}

        {/* Streaming indicator */}
        {isStreaming && !hasContent && !hasParts && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="text-sm">Thinking</span>
            <span className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          </div>
        )}

        {/* Streaming cursor after content */}
        {isStreaming && (hasContent || hasParts) && (
          <span className="inline-block w-1.5 h-4 ml-0.5 bg-primary/60 animate-pulse rounded-sm" />
        )}
      </div>
    </div>
  );
});

export default ChatMessage;



