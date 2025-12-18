/**
 * Chat Message Component (Redesigned)
 *
 * Displays messages in a Claude/Cursor-style interface with:
 * - Activity items showing agent actions
 * - Terminal output blocks for commands
 * - File references with icons
 * - Clean, minimal design
 */

import { memo } from 'react';
import { User } from 'lucide-react';
import { AgentActivityItem } from './AgentActivityItem';
import { MemoizedMarkdown } from './MemoizedMarkdown';
import type { MessageRole } from '@/types/agent';
import type { AgentActivity } from '@/types/agent-activity';

interface ChatMessageProps {
  id?: string;
  role: MessageRole;
  content: string;
  isStreaming?: boolean;
  activities?: AgentActivity[];
  timestamp?: string;
  onActivityApprove?: (activityId: string) => void;
  onActivityReject?: (activityId: string) => void;
}

/**
 * Main chat message component
 */
export const ChatMessage = memo(function ChatMessage({
  id,
  role,
  content,
  isStreaming,
  activities,
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
        <span className="text-xs text-zinc-500 px-3 py-1 rounded-full bg-zinc-800/50">
          {content}
        </span>
      </div>
    );
  }

  // User messages - keep bubble style with simple text
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
            <p className="text-sm whitespace-pre-wrap">{content}</p>
          </div>
        </div>
      </div>
    );
  }

  // Assistant messages - use memoized markdown for performance
  return (
    <div className="py-3">
      {/* Activities (shown before content) */}
      {activities && activities.length > 0 && (
        <div className="space-y-0.5 mb-3">
          {activities.map((activity) => (
            <AgentActivityItem 
              key={activity.id} 
              activity={activity} 
              onApprove={onActivityApprove}
              onReject={onActivityReject}
            />
          ))}
        </div>
      )}

      {/* Assistant text content - memoized for streaming performance */}
      {content && (
        <div className="text-zinc-300">
          <MemoizedMarkdown content={content} id={messageId} />
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

