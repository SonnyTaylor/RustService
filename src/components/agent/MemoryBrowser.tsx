/**
 * Memory Browser Component
 * 
 * Browse, search, and manage the agent's memory entries.
 */

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Brain,
  Search,
  Trash2,
  RefreshCw,
  Lightbulb,
  MessageSquare,
  FileText,
  BookOpen,
  Filter,
  Calendar,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { Memory, MemoryType } from '@/types/agent';

/**
 * Get icon for memory type
 */
function getMemoryIcon(type: MemoryType) {
  switch (type) {
    case 'fact':
      return FileText;
    case 'solution':
      return Lightbulb;
    case 'conversation':
      return MessageSquare;
    case 'instruction':
      return BookOpen;
    default:
      return Brain;
  }
}

/**
 * Get color for memory type
 */
function getMemoryColor(type: MemoryType) {
  switch (type) {
    case 'fact':
      return 'text-blue-500 bg-blue-500/10 border-blue-500/30';
    case 'solution':
      return 'text-green-500 bg-green-500/10 border-green-500/30';
    case 'conversation':
      return 'text-purple-500 bg-purple-500/10 border-purple-500/30';
    case 'instruction':
      return 'text-orange-500 bg-orange-500/10 border-orange-500/30';
    default:
      return 'text-muted-foreground bg-muted';
  }
}

interface MemoryItemProps {
  memory: Memory;
  onDelete: () => void;
}

/**
 * Single memory item display
 */
function MemoryItem({ memory, onDelete }: MemoryItemProps) {
  const Icon = getMemoryIcon(memory.type);
  const colorClasses = getMemoryColor(memory.type);

  return (
    <Card className="group">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn('p-2 rounded-lg border', colorClasses)}>
            <Icon className="h-4 w-4" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className={cn('text-xs', colorClasses)}>
                {memory.type}
              </Badge>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(memory.createdAt).toLocaleDateString()}
              </span>
            </div>
            
            <p className="text-sm line-clamp-3 whitespace-pre-wrap">
              {memory.content}
            </p>
            
            {memory.metadata?.tags && Array.isArray(memory.metadata.tags) && (
              <div className="flex flex-wrap gap-1 mt-2">
                {memory.metadata.tags.map((tag: string, i: number) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-muted-foreground hover:text-red-500"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Memory?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete this memory entry. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-500 hover:bg-red-600"
                  onClick={onDelete}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Memory Browser Component
 */
export function MemoryBrowser() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  const loadMemories = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await invoke<Memory[]>('get_all_memories', {
        memoryType: filterType === 'all' ? undefined : filterType,
        limit: 100,
      });
      setMemories(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const searchMemories = async () => {
    if (!searchQuery.trim()) {
      loadMemories();
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await invoke<Memory[]>('search_memories', {
        query: searchQuery,
        memoryType: filterType === 'all' ? undefined : filterType,
        limit: 50,
      });
      setMemories(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const deleteMemory = async (id: string) => {
    try {
      await invoke('delete_memory', { memoryId: id });
      setMemories(prev => prev.filter(m => m.id !== id));
    } catch (err) {
      console.error('Failed to delete memory:', err);
    }
  };

  const clearAllMemories = async () => {
    try {
      await invoke('clear_all_memories');
      setMemories([]);
    } catch (err) {
      console.error('Failed to clear memories:', err);
    }
  };

  useEffect(() => {
    loadMemories();
  }, [filterType]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      searchMemories();
    }, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Memory</h2>
          <Badge variant="secondary">{memories.length}</Badge>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={loadMemories} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear All Memories?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all memory entries. The agent will 
                  lose all learned information. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-500 hover:bg-red-600"
                  onClick={clearAllMemories}
                >
                  Clear All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search memories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[140px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="fact">Facts</SelectItem>
            <SelectItem value="solution">Solutions</SelectItem>
            <SelectItem value="conversation">Conversations</SelectItem>
            <SelectItem value="instruction">Instructions</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Memory List */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <Card className="border-red-500/30">
            <CardContent className="p-4 flex items-center gap-2 text-red-500">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </CardContent>
          </Card>
        ) : memories.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Brain className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <CardTitle className="text-base mb-2">No memories yet</CardTitle>
              <CardDescription>
                The agent will save important information here as it learns.
              </CardDescription>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3 pr-4">
            {memories.map((memory) => (
              <MemoryItem
                key={memory.id}
                memory={memory}
                onDelete={() => deleteMemory(memory.id)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

export default MemoryBrowser;

