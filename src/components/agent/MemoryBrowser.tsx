/**
 * Memory Browser Component
 * 
 * Browse, search, edit, and manage the agent's memory entries.
 * Enhanced with bulk operations, statistics, and filtering.
 */

import { useState, useEffect, useCallback } from 'react';
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
  Edit2,
  Check,
  X,
  Star,
  TrendingUp,
  Database,
  CheckSquare,
  Square,
  ChevronDown,
  Settings2,
  Eye,
  Cpu,
  Sparkles,
  FileStack,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Memory, MemoryType, MemoryStats } from '@/types/agent';
import { MEMORY_TYPE_LABELS, MEMORY_TYPE_DESCRIPTIONS } from '@/types/agent';

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
    case 'behavior':
      return Settings2;
    case 'knowledge':
      return FileStack;
    case 'summary':
      return Sparkles;
    case 'system':
      return Cpu;
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
    case 'behavior':
      return 'text-pink-500 bg-pink-500/10 border-pink-500/30';
    case 'knowledge':
      return 'text-cyan-500 bg-cyan-500/10 border-cyan-500/30';
    case 'summary':
      return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30';
    case 'system':
      return 'text-slate-500 bg-slate-500/10 border-slate-500/30';
    default:
      return 'text-muted-foreground bg-muted';
  }
}

interface MemoryItemProps {
  memory: Memory;
  isSelected: boolean;
  onToggleSelect: () => void;
  onDelete: () => void;
  onUpdate: (content: string, importance: number) => Promise<void>;
}

/**
 * Single memory item display with edit capability
 */
function MemoryItem({ memory, isSelected, onToggleSelect, onDelete, onUpdate }: MemoryItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(memory.content);
  const [editImportance, setEditImportance] = useState(memory.importance);
  const [isSaving, setIsSaving] = useState(false);
  
  const Icon = getMemoryIcon(memory.type);
  const colorClasses = getMemoryColor(memory.type);

  const handleSave = async () => {
    if (editContent === memory.content && editImportance === memory.importance) {
      setIsEditing(false);
      return;
    }
    
    setIsSaving(true);
    try {
      await onUpdate(editContent, editImportance);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditContent(memory.content);
    setEditImportance(memory.importance);
    setIsEditing(false);
  };

  return (
    <Card className={cn('group transition-colors', isSelected && 'border-primary/50 bg-primary/5')}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Selection checkbox */}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={onToggleSelect}
          >
            {isSelected ? (
              <CheckSquare className="h-4 w-4 text-primary" />
            ) : (
              <Square className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
          
          <div className={cn('p-2 rounded-lg border shrink-0', colorClasses)}>
            <Icon className="h-4 w-4" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge variant="outline" className={cn('text-xs', colorClasses)}>
                {MEMORY_TYPE_LABELS[memory.type] || memory.type}
              </Badge>
              
              {/* Importance indicator */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Star className={cn('h-3 w-3', memory.importance >= 70 && 'text-yellow-500 fill-yellow-500')} />
                      <span>{memory.importance}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>Importance: {memory.importance}/100</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              
              {/* Access count */}
              {memory.accessCount > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Eye className="h-3 w-3" />
                        <span>{memory.accessCount}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>Accessed {memory.accessCount} times</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(memory.createdAt).toLocaleDateString()}
              </span>
            </div>
            
            {isEditing ? (
              <div className="space-y-3">
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="min-h-[100px] text-sm"
                  disabled={isSaving}
                />
                
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground">Importance:</span>
                  <Slider
                    value={[editImportance]}
                    onValueChange={([val]) => setEditImportance(val)}
                    min={0}
                    max={100}
                    step={5}
                    className="flex-1"
                    disabled={isSaving}
                  />
                  <span className="text-xs font-medium w-8">{editImportance}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={handleSave} disabled={isSaving}>
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    <span className="ml-1">Save</span>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleCancel} disabled={isSaving}>
                    <X className="h-4 w-4" />
                    <span className="ml-1">Cancel</span>
                  </Button>
                </div>
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>

          {!isEditing && (
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8"
                onClick={() => setIsEditing(true)}
              >
                <Edit2 className="h-4 w-4" />
              </Button>
              
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
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Memory Statistics Panel
 */
function MemoryStatsPanel({ stats }: { stats: MemoryStats | null }) {
  if (!stats) return null;
  
  const memoryTypes: MemoryType[] = ['fact', 'solution', 'conversation', 'instruction', 'behavior', 'knowledge', 'summary', 'system'];
  const maxCount = Math.max(...Object.values(stats.byType), 1);
  
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between px-0 hover:bg-transparent">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Statistics</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{stats.totalCount} memories</Badge>
            <ChevronDown className="h-4 w-4" />
          </div>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3 space-y-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Database className="h-3 w-3" />
          <span>Storage: {(stats.totalSizeBytes / 1024).toFixed(1)} KB</span>
        </div>
        
        <div className="space-y-2">
          {memoryTypes.map(type => {
            const count = stats.byType[type] || 0;
            if (count === 0) return null;
            
            const Icon = getMemoryIcon(type);
            const colorClasses = getMemoryColor(type);
            const percentage = (count / maxCount) * 100;
            
            return (
              <div key={type} className="flex items-center gap-2">
                <div className={cn('p-1 rounded border', colorClasses)}>
                  <Icon className="h-3 w-3" />
                </div>
                <span className="text-xs w-24 capitalize">{MEMORY_TYPE_LABELS[type] || type}</span>
                <Progress value={percentage} className="flex-1 h-2" />
                <span className="text-xs text-muted-foreground w-8 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Memory Browser Component
 */
export function MemoryBrowser() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const loadMemories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, statsData] = await Promise.all([
        invoke<Memory[]>('get_all_memories', {
          memory_type: filterType === 'all' ? undefined : filterType,
          limit: 100,
        }),
        invoke<MemoryStats>('get_memory_stats'),
      ]);
      setMemories(data);
      setStats(statsData);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [filterType]);

  const searchMemories = useCallback(async () => {
    if (!searchQuery.trim()) {
      loadMemories();
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await invoke<Memory[]>('search_memories', {
        query: searchQuery,
        memory_type: filterType === 'all' ? undefined : filterType,
        limit: 50,
      });
      setMemories(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [searchQuery, filterType, loadMemories]);

  const deleteMemory = async (id: string) => {
    try {
      await invoke('delete_memory', { memory_id: id });
      setMemories(prev => prev.filter(m => m.id !== id));
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      // Refresh stats
      const statsData = await invoke<MemoryStats>('get_memory_stats');
      setStats(statsData);
    } catch (err) {
      console.error('Failed to delete memory:', err);
    }
  };

  const updateMemory = async (id: string, content: string, importance: number) => {
    try {
      const updated = await invoke<Memory>('update_memory', {
        memory_id: id,
        content,
        importance,
      });
      setMemories(prev => prev.map(m => m.id === id ? updated : m));
    } catch (err) {
      console.error('Failed to update memory:', err);
      throw err;
    }
  };

  const bulkDeleteMemories = async () => {
    if (selectedIds.size === 0) return;
    
    try {
      await invoke('bulk_delete_memories', { memory_ids: Array.from(selectedIds) });
      setMemories(prev => prev.filter(m => !selectedIds.has(m.id)));
      setSelectedIds(new Set());
      // Refresh stats
      const statsData = await invoke<MemoryStats>('get_memory_stats');
      setStats(statsData);
    } catch (err) {
      console.error('Failed to bulk delete memories:', err);
    }
  };

  const clearAllMemories = async () => {
    try {
      await invoke('clear_all_memories');
      setMemories([]);
      setSelectedIds(new Set());
      const statsData = await invoke<MemoryStats>('get_memory_stats');
      setStats(statsData);
    } catch (err) {
      console.error('Failed to clear memories:', err);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === memories.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(memories.map(m => m.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  useEffect(() => {
    loadMemories();
  }, [filterType, loadMemories]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      searchMemories();
    }, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery, searchMemories]);

  const allMemoryTypes: MemoryType[] = ['fact', 'solution', 'conversation', 'instruction', 'behavior', 'knowledge', 'summary', 'system'];

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

      {/* Statistics */}
      <div className="mb-4">
        <MemoryStatsPanel stats={stats} />
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
            {allMemoryTypes.map(type => (
              <SelectItem key={type} value={type}>
                {MEMORY_TYPE_LABELS[type] || type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Bulk Actions */}
      {memories.length > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={toggleSelectAll}
          >
            {selectedIds.size === memories.length ? (
              <>
                <CheckSquare className="h-3 w-3 mr-1" />
                Deselect All
              </>
            ) : (
              <>
                <Square className="h-3 w-3 mr-1" />
                Select All
              </>
            )}
          </Button>
          
          {selectedIds.size > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7 text-xs"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Delete {selectedIds.size} selected
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Selected Memories?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete {selectedIds.size} memory entries. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-500 hover:bg-red-600"
                    onClick={bulkDeleteMemories}
                  >
                    Delete Selected
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}

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
                isSelected={selectedIds.has(memory.id)}
                onToggleSelect={() => toggleSelect(memory.id)}
                onDelete={() => deleteMemory(memory.id)}
                onUpdate={(content, importance) => updateMemory(memory.id, content, importance)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

export default MemoryBrowser;
