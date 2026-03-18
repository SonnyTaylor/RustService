/**
 * Conversation Selector Component
 * 
 * Dropdown for managing and switching between saved conversations.
 */

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  MessageSquarePlus,
  ChevronDown,
  Trash2,
  MessageCircle,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Conversation } from '@/types/agent';

interface ConversationSelectorProps {
  currentConversationId: string | null;
  onSelect: (conversation: Conversation) => void;
  onNew: () => void;
  className?: string;
}

/**
 * Format relative time (e.g., "2 hours ago", "Yesterday")
 */
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

/**
 * Truncate title for display
 */
function truncateTitle(title: string, maxLength = 30): string {
  if (title.length <= maxLength) return title;
  return title.substring(0, maxLength - 3) + '...';
}

export function ConversationSelector({
  currentConversationId,
  onSelect,
  onNew,
  className,
}: ConversationSelectorProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<Conversation | null>(null);

  // Current conversation title
  const currentConversation = conversations.find(c => c.id === currentConversationId);
  const displayTitle = currentConversation 
    ? truncateTitle(currentConversation.title) 
    : 'New Chat';

  // Load conversations
  const loadConversations = async () => {
    setLoading(true);
    try {
      const data = await invoke<Conversation[]>('list_conversations', { limit: 50 });
      setConversations(data);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load on mount and when dropdown opens
  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (open) {
      loadConversations();
    }
  }, [open]);

  // Handle delete
  const handleDelete = async () => {
    if (!conversationToDelete) return;
    
    try {
      await invoke('delete_conversation', { conversationId: conversationToDelete.id });
      setConversations(prev => prev.filter(c => c.id !== conversationToDelete.id));
      
      // If we deleted the current conversation, trigger new chat
      if (conversationToDelete.id === currentConversationId) {
        onNew();
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    } finally {
      setConversationToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  const confirmDelete = (e: React.MouseEvent, conversation: Conversation) => {
    e.stopPropagation();
    setConversationToDelete(conversation);
    setDeleteDialogOpen(true);
  };

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn('gap-2 font-normal', className)}
          >
            <MessageCircle className="h-4 w-4" />
            <span className="max-w-[150px] truncate">{displayTitle}</span>
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          {/* New Chat */}
          <DropdownMenuItem
            onClick={() => {
              onNew();
              setOpen(false);
            }}
            className="gap-2"
          >
            <MessageSquarePlus className="h-4 w-4 text-primary" />
            <span className="font-medium">New Chat</span>
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          {/* Conversation List */}
          {loading ? (
            <div className="px-2 py-3 text-sm text-muted-foreground text-center">
              Loading...
            </div>
          ) : conversations.length === 0 ? (
            <div className="px-2 py-3 text-sm text-muted-foreground text-center">
              No conversations yet
            </div>
          ) : (
            <div className="max-h-[300px] overflow-y-auto">
              {conversations.map((conversation) => (
                <DropdownMenuItem
                  key={conversation.id}
                  onClick={() => {
                    onSelect(conversation);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex items-center justify-between gap-2 group',
                    conversation.id === currentConversationId && 'bg-accent'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm">
                      {truncateTitle(conversation.title, 35)}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatRelativeTime(conversation.updatedAt)}
                    </div>
                  </div>
                  
                  {/* Delete button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    onClick={(e) => confirmDelete(e, conversation)}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </DropdownMenuItem>
              ))}
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{conversationToDelete?.title}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default ConversationSelector;
