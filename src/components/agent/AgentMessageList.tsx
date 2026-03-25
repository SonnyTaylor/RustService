/**
 * Agent Message List Component
 *
 * Scrollable message list with empty state, animated message rendering,
 * and service run monitor integration.
 */

import { useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from '@/components/animation-context';
import { ChatMessage } from '@/components/agent/ChatMessage';
import { ServiceRunMonitor } from '@/components/agent/ServiceRunMonitor';
import type { Message } from '@/hooks/useConversations';
import type { ActiveServiceRun } from '@/hooks/useServiceSupervision';

// =============================================================================
// Types
// =============================================================================

interface AgentMessageListProps {
  messages: Message[];
  isLoading: boolean;
  activeServiceRun: ActiveServiceRun | null;
  onActivityApprove: (activityId: string) => void;
  onActivityReject: (activityId: string) => void;
  onSuggestionClick: (text: string) => void;
  onCancelServiceRun: () => void;
}

// =============================================================================
// Suggestions
// =============================================================================

const SUGGESTIONS = [
  { icon: '\uD83D\uDD0D', text: 'Run a quick system diagnostic' },
  { icon: '\uD83D\uDCC2', text: 'List files in the programs folder' },
  { icon: '\u26A1', text: 'Check disk health with SMART data' },
  { icon: '\uD83E\uDDF9', text: 'Help me clean up temp files' },
] as const;

// =============================================================================
// Component
// =============================================================================

export function AgentMessageList({
  messages,
  isLoading,
  activeServiceRun,
  onActivityApprove,
  onActivityReject,
  onSuggestionClick,
  onCancelServiceRun,
}: AgentMessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto min-h-0">
      <div className="p-4 max-w-3xl mx-auto w-full space-y-4">
        {messages.length === 0 ? (
          <EmptyState onSuggestionClick={onSuggestionClick} />
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((msg, index) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              >
                <ChatMessage
                  id={msg.id}
                  role={msg.role}
                  content={msg.content}
                  timestamp={msg.createdAt}
                  parts={msg.parts}
                  attachments={msg.attachments}
                  isStreaming={
                    isLoading &&
                    msg.role === 'assistant' &&
                    index === messages.length - 1
                  }
                  onActivityApprove={onActivityApprove}
                  onActivityReject={onActivityReject}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        )}

        {/* Service Run Monitor */}
        {activeServiceRun && (
          <ServiceRunMonitor
            reportId={activeServiceRun.reportId}
            onPause={async () => {
              try {
                await invoke('pause_service_run');
              } catch (e) {
                console.error(e);
              }
            }}
            onResume={async () => {
              try {
                await invoke('resume_service_run');
              } catch (e) {
                console.error(e);
              }
            }}
            onCancel={async () => {
              try {
                await invoke('cancel_service_run');
                onCancelServiceRun();
              } catch (e) {
                console.error(e);
              }
            }}
          />
        )}

        {/* Invisible element to scroll to */}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}

// =============================================================================
// Empty State (private)
// =============================================================================

function EmptyState({
  onSuggestionClick,
}: {
  onSuggestionClick: (text: string) => void;
}) {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center space-y-6 max-w-lg">
        <div className="relative mx-auto w-16 h-16">
          <div className="absolute inset-0 rounded-2xl bg-primary/10 animate-pulse" />
          <div className="relative w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
        </div>
        <div>
          <h3 className="text-lg font-semibold">What can I help with?</h3>
          <p className="text-sm text-muted-foreground mt-1">
            I can run commands, manage files, search the web, and help
            diagnose system issues.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {SUGGESTIONS.map(suggestion => (
            <button
              key={suggestion.text}
              onClick={() => onSuggestionClick(suggestion.text)}
              className="flex items-center gap-2 p-3 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/60 hover:border-border transition-colors text-left text-sm group"
            >
              <span className="text-base">{suggestion.icon}</span>
              <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                {suggestion.text}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
