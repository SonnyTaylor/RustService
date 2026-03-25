/**
 * Agent Input Area Component
 *
 * Message input with file attachment support, send/stop buttons,
 * and clear chat action. Used at the bottom of the agent chat.
 */

import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Send,
  Loader2,
  Square,
  Paperclip,
  X,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { FileAttachment } from '@/types/file-attachment';

// =============================================================================
// Types
// =============================================================================

interface AgentInputAreaProps {
  input: string;
  onInputChange: (value: string) => void;
  isLoading: boolean;
  hasMessages: boolean;
  onSend: (text: string, attachments?: FileAttachment[]) => Promise<void>;
  onStop: () => void;
  onClear: () => void;
}

// =============================================================================
// Component
// =============================================================================

export function AgentInputArea({
  input,
  onInputChange,
  isLoading,
  hasMessages,
  onSend,
  onStop,
  onClear,
}: AgentInputAreaProps) {
  const [pendingAttachments, setPendingAttachments] = useState<FileAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const removePendingAttachment = useCallback(
    (id: string) => {
      setPendingAttachments(prev => prev.filter(att => att.id !== id));
    },
    [],
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      setIsUploading(true);
      const newAttachments: FileAttachment[] = [];

      for (const file of files) {
        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              resolve(result.split(',')[1]);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          const attachment = await invoke<FileAttachment>('save_uploaded_file', {
            file_name: file.name,
            mime_type: file.type || 'application/octet-stream',
            size: file.size,
            content_base64: base64,
          });

          newAttachments.push(attachment);
        } catch (error) {
          console.error('Failed to upload file:', error);
        }
      }

      setPendingAttachments(prev => [...prev, ...newAttachments]);
      setIsUploading(false);
      e.target.value = '';
    },
    [],
  );

  const handleSendMessage = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!input.trim() && pendingAttachments.length === 0) return;
      const text =
        input.trim() ||
        (pendingAttachments.length > 0 ? 'Please analyze these files:' : '');
      const attachments = [...pendingAttachments];
      onInputChange('');
      setPendingAttachments([]);
      await onSend(text, attachments);
    },
    [input, pendingAttachments, onInputChange, onSend],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage(e);
      }
    },
    [handleSendMessage],
  );

  return (
    <div className="p-4 border-t bg-background/80 backdrop-blur-sm z-10">
      <form onSubmit={handleSendMessage} className="max-w-3xl mx-auto relative flex gap-2">
        <div className="flex-1 relative">
          {/* Pending Attachments Preview */}
          {pendingAttachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {pendingAttachments.map(att => (
                <div
                  key={att.id}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-muted text-xs"
                >
                  <Paperclip className="h-3 w-3" />
                  <span className="truncate max-w-[120px]">{att.originalName}</span>
                  <button
                    type="button"
                    onClick={() => removePendingAttachment(att.id)}
                    className="ml-1 hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={e => onInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                pendingAttachments.length > 0
                  ? 'Add a message about these files...'
                  : 'Ask ServiceAgent...'
              }
              className="min-h-[44px] max-h-32 resize-none pr-12 bg-background flex-1"
              rows={1}
              disabled={isUploading}
            />

            {/* File Upload Button */}
            <div className="relative">
              <input
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload-input"
                disabled={isUploading || isLoading}
              />
              <label htmlFor="file-upload-input">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  disabled={isUploading || isLoading}
                  asChild
                >
                  <span>
                    {isUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Paperclip className="h-4 w-4" />
                    )}
                  </span>
                </Button>
              </label>
            </div>

            {/* Send / Stop Button */}
            {isLoading ? (
              <Button
                type="button"
                size="icon"
                variant="destructive"
                className="h-10 w-10 shrink-0"
                onClick={onStop}
                title="Stop generating"
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                className="h-10 w-10 shrink-0"
                disabled={
                  (!input.trim() && pendingAttachments.length === 0) ||
                  isUploading
                }
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {hasMessages && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClear}
            title="Clear Chat"
          >
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}
      </form>
    </div>
  );
}
