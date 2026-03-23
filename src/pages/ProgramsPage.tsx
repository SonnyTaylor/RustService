/**
 * Programs Page Component
 *
 * Manage and launch portable tools from the data folder.
 * Features: add/edit programs, icon extraction, search, sort by usage.
 */

import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  AppWindow,
  Plus,
  Search,
  ArrowUpDown,
  AlertCircle,
  Loader2,
  Upload,
  Sparkles,
  X,
  Bot,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import type { Program, ProgramSortOption } from '@/types/programs';
import { PROGRAM_SORT_OPTIONS } from '@/types/programs';
import { useSettings } from '@/components/settings-context';
import { isAiConfigured, aiSearchPrograms, type AiSearchResult } from '@/lib/ai-features';

import {
  fuzzyMatch,
  sortPrograms,
  ProgramDialog,
  ImportDialog,
  ProgramCard,
  EmptyState,
} from '@/components/programs';

// =============================================================================
// Main Component
// =============================================================================

export function ProgramsPage() {
  const { settings } = useSettings();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<ProgramSortOption>('name-asc');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProgram, setEditingProgram] = useState<Program | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  // AI Search state
  const [aiSearchMode, setAiSearchMode] = useState(false);
  const [aiSearchQuery, setAiSearchQuery] = useState('');
  const [aiSearchResults, setAiSearchResults] = useState<AiSearchResult[] | null>(null);
  const [aiSearchLoading, setAiSearchLoading] = useState(false);
  const [aiSearchError, setAiSearchError] = useState<string | null>(null);
  const [aiAbortController, setAiAbortController] = useState<AbortController | null>(null);

  // Refresh programs list
  const refreshPrograms = async () => {
    try {
      const programsList = await invoke<Program[]>('get_programs');
      setPrograms(programsList);
    } catch (e) {
      console.error('Failed to refresh programs:', e);
    }
  };

  // Load programs
  useEffect(() => {
    async function loadData() {
      try {
        const programsList = await invoke<Program[]>('get_programs');
        setPrograms(programsList);
      } catch (e) {
        console.error('Failed to load programs:', e);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  // AI Search handler
  const handleAiSearch = async () => {
    if (!aiSearchQuery.trim() || programs.length === 0) return;
    setAiSearchLoading(true);
    setAiSearchError(null);
    setAiSearchResults(null);

    const controller = new AbortController();
    setAiAbortController(controller);

    try {
      const results = await aiSearchPrograms(programs, aiSearchQuery.trim(), settings.agent, controller.signal);
      setAiSearchResults(results);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setAiSearchError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setAiSearchLoading(false);
      setAiAbortController(null);
    }
  };

  const clearAiSearch = () => {
    aiAbortController?.abort();
    setAiSearchMode(false);
    setAiSearchQuery('');
    setAiSearchResults(null);
    setAiSearchError(null);
    setAiSearchLoading(false);
  };

  const toggleAiSearch = () => {
    if (aiSearchMode) {
      clearAiSearch();
    } else {
      if (!isAiConfigured(settings.agent)) {
        setAiSearchError('AI not configured. Set up a provider in Settings → AI Agent.');
        setTimeout(() => setAiSearchError(null), 4000);
        return;
      }
      setAiSearchMode(true);
      setSearchQuery('');
    }
  };

  // Filter and sort programs
  const filteredPrograms = useMemo(() => {
    let result = programs;

    // If AI search has results, reorder to show matches first
    if (aiSearchMode && aiSearchResults && aiSearchResults.length > 0) {
      const matchedIds = new Set(aiSearchResults.map((r) => r.programId));
      const matched = aiSearchResults
        .map((r) => programs.find((p) => p.id === r.programId))
        .filter((p): p is Program => !!p);
      const unmatched = programs.filter((p) => !matchedIds.has(p.id));
      return [...matched, ...unmatched];
    }

    if (searchQuery) {
      result = result.filter(p =>
        fuzzyMatch(p.name, searchQuery) ||
        fuzzyMatch(p.description, searchQuery)
      );
    }

    return sortPrograms(result, sortBy);
  }, [programs, searchQuery, sortBy, aiSearchMode, aiSearchResults]);

  // Handlers
  const handleAddProgram = () => {
    setEditingProgram(null);
    setDialogOpen(true);
  };

  const handleEditProgram = (program: Program) => {
    setEditingProgram(program);
    setDialogOpen(true);
  };

  const handleSaveProgram = async (data: {
    name: string;
    description: string;
    version: string;
    exePath: string;
    isCli: boolean;
    iconPath: string | null;
  }) => {
    if (editingProgram) {
      // Update existing
      const updated = await invoke<Program>('update_program', {
        id: editingProgram.id,
        ...data,
      });
      setPrograms(prev => prev.map(p => p.id === updated.id ? updated : p));
    } else {
      // Add new
      const created = await invoke<Program>('add_program', data);
      setPrograms(prev => [...prev, created]);
    }
  };

  const handleLaunchProgram = async (id: string) => {
    try {
      await invoke('launch_program', { id });
      // Update local state with incremented launch count
      setPrograms(prev => prev.map(p => {
        if (p.id === id) {
          return {
            ...p,
            launchCount: p.launchCount + 1,
            lastLaunched: new Date().toISOString(),
          };
        }
        return p;
      }));
    } catch (e) {
      console.error('Failed to launch program:', e);
    }
  };

  const handleDeleteProgram = async (id: string) => {
    try {
      await invoke('delete_program', { id });
      setPrograms(prev => prev.filter(p => p.id !== id));
    } catch (e) {
      console.error('Failed to delete program:', e);
    }
  };

  const handleRevealProgram = async (id: string) => {
    try {
      await invoke('reveal_program', { id });
    } catch (e) {
      console.error('Failed to reveal program:', e);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden min-h-0">
      {/* Header */}
      <div className="p-4 border-b flex items-center gap-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <AppWindow className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Programs</h2>
          <Badge variant="secondary" className="ml-1">
            {programs.length}
          </Badge>
        </div>

        <div className="flex-1">
          <div className="relative flex items-center gap-2">
            {aiSearchMode ? (
              <>
                <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-purple-500" />
                <Input
                  placeholder="Describe what you need (e.g. 'check drive health')..."
                  value={aiSearchQuery}
                  onChange={(e) => setAiSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAiSearch()}
                  className="pl-9 border-purple-500/50 focus-visible:ring-purple-500/30"
                  autoFocus
                />
                {aiSearchLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-purple-500 absolute right-3 top-1/2 -translate-y-1/2" />
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={clearAiSearch}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </>
            ) : (
              <>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search programs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </>
            )}
          </div>
        </div>

        {/* AI Search Toggle */}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={aiSearchMode ? 'default' : 'ghost'}
                size="icon"
                onClick={toggleAiSearch}
                className={`h-9 w-9 shrink-0 ${aiSearchMode ? 'bg-purple-600 hover:bg-purple-700 text-white' : ''}`}
              >
                <Sparkles className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{aiSearchMode ? 'Exit AI Search' : 'AI Search'}</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as ProgramSortOption)}>
            <SelectTrigger className="w-40">
              <ArrowUpDown className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROGRAM_SORT_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => setImportDialogOpen(true)} className="h-9 w-9">
                  <Upload className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Import Legacy Programs</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Button onClick={handleAddProgram}>
            <Plus className="h-4 w-4 mr-2" />
            Add Program
          </Button>
        </div>
      </div>

      {/* AI Search Error/Info Banner */}
      {aiSearchError && (
        <div className="px-4 py-2 bg-destructive/10 border-b border-destructive/20 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">{aiSearchError}</p>
          <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto" onClick={() => setAiSearchError(null)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      {aiSearchMode && aiSearchResults && aiSearchResults.length > 0 && (
        <div className="px-4 py-2 bg-purple-500/10 border-b border-purple-500/20 flex items-center gap-2">
          <Bot className="h-4 w-4 text-purple-500 shrink-0" />
          <p className="text-sm text-purple-600 dark:text-purple-400">
            Found {aiSearchResults.length} matching program{aiSearchResults.length !== 1 ? 's' : ''} for &ldquo;{aiSearchQuery}&rdquo;
          </p>
          <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs" onClick={clearAiSearch}>
            Clear
          </Button>
        </div>
      )}
      {aiSearchMode && aiSearchResults && aiSearchResults.length === 0 && (
        <div className="px-4 py-2 bg-muted border-b flex items-center gap-2">
          <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
          <p className="text-sm text-muted-foreground">
            No programs match your description. Try a different query or add new programs.
          </p>
        </div>
      )}

      {/* Content */}
      <ScrollArea className="flex-1 min-h-0">
        {programs.length === 0 ? (
          <EmptyState onAddClick={handleAddProgram} />
        ) : filteredPrograms.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Search className="h-8 w-8 mb-2" />
            <p>No programs match "{searchQuery}"</p>
          </div>
        ) : (
          <div className="p-4 flex flex-col gap-2 overflow-hidden">
            {filteredPrograms.map(program => {
              const aiMatch = aiSearchResults?.find((r) => r.programId === program.id);
              return (
                <div key={program.id} className="relative">
                  {aiMatch && (
                    <div className="mb-1 flex items-center gap-2">
                      <Badge className="bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30 gap-1 text-[11px]">
                        <Sparkles className="h-3 w-3" />
                        {aiMatch.relevance}% match
                      </Badge>
                      <span className="text-xs text-muted-foreground">{aiMatch.reason}</span>
                    </div>
                  )}
                  <ProgramCard
                    program={program}
                    onLaunch={handleLaunchProgram}
                    onEdit={handleEditProgram}
                    onDelete={handleDeleteProgram}
                    onReveal={handleRevealProgram}
                  />
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Add/Edit Dialog */}
      <ProgramDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        program={editingProgram}
        onSave={handleSaveProgram}
      />

      {/* Import Legacy Dialog */}
      <ImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImportComplete={refreshPrograms}
      />
    </div>
  );
}
