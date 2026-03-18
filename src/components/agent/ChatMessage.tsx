/**
 * Chat Message Component
 *
 * Displays messages with interleaved text, tool activity, and file attachment parts.
 * Supports linear flow: text → tool → text → tool → text → attachment
 */

import { memo, useMemo } from 'react';
import { User, Bot } from 'lucide-react';
import { AgentActivityItem } from './AgentActivityItem';
import { MemoizedMarkdown } from './MemoizedMarkdown';
import { FileAttachmentComponent } from './FileAttachment';
import type { MessageRole } from '@/types/agent';
import type { AgentActivity } from '@/types/agent-activity';
import type { FileAttachment } from '@/types/file-attachment';

// =============================================================================
// Types
// =============================================================================

export interface MessagePart {
  type: 'text' | 'tool' | 'attachment';
  content?: string;
  activity?: AgentActivity;
  attachments?: FileAttachment[];
}

interface ChatMessageProps {
  id?: string;
  role: MessageRole;
  content: string;
  isStreaming?: boolean;
  parts?: MessagePart[];
  timestamp?: string;
  attachments?: FileAttachment[]; // Legacy support for direct attachments
  onActivityApprove?: (activityId: string) => void;
  onActivityReject?: (activityId: string) => void;
}

// =============================================================================
// Helpers
// =============================================================================

function formatTimestamp(ts: string | undefined): string | null {
  if (!ts) return null;
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleTimeString();
  } catch {
    return null;
  }
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
  attachments,
  onActivityApprove,
  onActivityReject,
}: ChatMessageProps) {
  const isUser = role === 'user';
  const isSystem = role === 'system';
  const messageId = id || `msg-${Date.now()}`;
  const formattedTime = useMemo(() => formatTimestamp(timestamp), [timestamp]);

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
            {formattedTime && <span>{formattedTime}</span>}
          </div>
          <div className="rounded-2xl px-4 py-2.5 bg-primary text-primary-foreground max-w-[85%]">
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{content}</p>
            {/* User attachments */}
            {attachments && attachments.length > 0 && (
              <div className="mt-3 pt-3 border-t border-primary-foreground/20 space-y-2">
                {attachments.map(att => (
                  <FileAttachmentComponent
                    key={att.id}
                    attachment={att}
                    compact
                    showPreview
                    showDownload
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Assistant messages — left-aligned with interleaved parts
  const hasParts = Array.isArray(parts) && parts.length > 0;
  const hasContent = !!content;

  return (
    <div className="flex gap-3 py-3">
      {/* Avatar */}
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center mt-0.5">
        <Bot className="h-3.5 w-3.5" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1.5">
          <span className="font-medium">Agent</span>
          {formattedTime && <span>{formattedTime}</span>}
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
              if (part.type === 'attachment' && part.attachments && part.attachments.length > 0) {
                return (
                  <div key={`attachment-${index}`} className="space-y-2">
                    {part.attachments.map(att => (
                      <FileAttachmentComponent
                        key={att.id}
                        attachment={att}
                        showPreview
                        showDownload
                      />
                    ))}
                  </div>
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

        {/* Legacy attachments (not in parts) */}
        {attachments && attachments.length > 0 && (
          <div className="mt-2 space-y-2">
            {attachments.map(att => (
              <FileAttachmentComponent
                key={att.id}
                attachment={att}
                showPreview
                showDownload
              />
            ))}
          </div>
        )}

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



