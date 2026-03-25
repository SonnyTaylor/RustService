/**
 * Scripts Page Component
 *
 * Manage and execute PowerShell and CMD scripts.
 * Features: add/edit scripts, run with admin, search, sort by usage.
 */

import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  ScrollText,
  Plus,
  Search,
  Play,
  Edit,
  Trash2,
  MoreVertical,
  ArrowUpDown,
  Loader2,
  Terminal,
  Shield,
  Sparkles,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import type { Script, ScriptSortOption, ScriptType } from '@/types/scripts';
import { SCRIPT_SORT_OPTIONS } from '@/types/scripts';
import { useSettings } from '@/components/settings-context';
import { isAiConfigured } from '@/lib/ai-features';
import { fuzzyMatch } from '@/lib/search-utils';
import { sortScripts } from '@/lib/script-utils';
import { ScriptDialog } from '@/components/scripts/ScriptDialog';
import { AIScriptDialog } from '@/components/scripts/AIScriptDialog';

// =============================================================================
// Script Card Component
// =============================================================================

interface ScriptCardProps {
  script: Script;
  onRun: (id: string) => void;
  onEdit: (script: Script) => void;
  onDelete: (id: string) => void;
}

function ScriptCard({
  script,
  onRun,
  onEdit,
  onDelete,
}: ScriptCardProps) {
  return (
    <Card className="group hover:shadow-md transition-all duration-200 hover:border-primary/50 w-full">
      <CardContent className="p-3 py-0">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
            <Terminal className="h-5 w-5 text-muted-foreground" />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium truncate">{script.name}</h3>
              <Badge
                variant="secondary"
                className={`gap-1 text-xs ${
                  script.scriptType === 'powershell'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                }`}
              >
                {script.scriptType === 'powershell' ? 'PS' : 'CMD'}
              </Badge>
              {script.runAsAdmin && (
                <Badge
                  variant="outline"
                  className="gap-1 text-xs border-yellow-500 text-yellow-600 dark:text-yellow-400"
                >
                  <Shield className="h-3 w-3" />
                  Admin
                </Badge>
              )}
            </div>
            {script.description && (
              <p className="text-sm text-muted-foreground truncate">
                {script.description}
              </p>
            )}
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span>Run {script.runCount}×</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-100 dark:hover:bg-green-900/30"
                    onClick={() => onRun(script.id)}
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Run Script</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(script)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDelete(script.id)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Empty State Component
// =============================================================================

function EmptyState({ onAddClick }: { onAddClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-12">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
        <ScrollText className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <h3 className="text-lg font-semibold">No Scripts Yet</h3>
        <p className="text-muted-foreground text-sm max-w-sm mt-1">
          Create PowerShell or CMD scripts to automate common tasks. Scripts can
          run with normal or admin privileges.
        </p>
      </div>
      <Button onClick={onAddClick}>
        <Plus className="h-4 w-4 mr-2" />
        Add Your First Script
      </Button>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function ScriptsPage() {
  const { settings } = useSettings();
  const [scripts, setScripts] = useState<Script[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<ScriptSortOption>('name-asc');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingScript, setEditingScript] = useState<Script | null>(null);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiGeneratedData, setAiGeneratedData] = useState<{
    name: string;
    description: string;
    scriptType: ScriptType;
    content: string;
    runAsAdmin: boolean;
  } | null>(null);

  // Load scripts
  useEffect(() => {
    async function loadData() {
      try {
        const scriptsList = await invoke<Script[]>('get_scripts');
        setScripts(scriptsList);
      } catch (e) {
        console.error('Failed to load scripts:', e);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  // Filter and sort scripts
  const filteredScripts = useMemo(() => {
    let result = scripts;

    if (searchQuery) {
      result = result.filter(
        (s) =>
          fuzzyMatch(s.name, searchQuery) ||
          fuzzyMatch(s.description, searchQuery) ||
          fuzzyMatch(s.content, searchQuery)
      );
    }

    return sortScripts(result, sortBy);
  }, [scripts, searchQuery, sortBy]);

  // Handlers
  const handleAddScript = () => {
    setEditingScript(null);
    setAiGeneratedData(null);
    setDialogOpen(true);
  };

  const handleAiGenerated = (data: {
    name: string;
    description: string;
    scriptType: ScriptType;
    content: string;
    runAsAdmin: boolean;
  }) => {
    // Pre-fill the regular script dialog with AI-generated content
    setAiGeneratedData(data);
    setEditingScript(null);
    setDialogOpen(true);
  };

  const handleOpenAiDialog = () => {
    if (!isAiConfigured(settings.agent)) {
      // Show error inline - no toast available
      console.error('AI not configured. Set up a provider in Settings → AI Agent.');
      return;
    }
    setAiDialogOpen(true);
  };

  const handleEditScript = (script: Script) => {
    setEditingScript(script);
    setDialogOpen(true);
  };

  const handleSaveScript = async (data: {
    name: string;
    description: string;
    scriptType: ScriptType;
    content: string;
    runAsAdmin: boolean;
  }) => {
    if (editingScript) {
      // Update existing
      const updated = await invoke<Script>('update_script', {
        id: editingScript.id,
        ...data,
      });
      setScripts((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s))
      );
    } else {
      // Add new
      const created = await invoke<Script>('add_script', data);
      setScripts((prev) => [...prev, created]);
    }
  };

  const handleRunScript = async (id: string) => {
    try {
      await invoke('run_script', { id });

      // Update local state with incremented run count
      setScripts((prev) =>
        prev.map((s) => {
          if (s.id === id) {
            return {
              ...s,
              runCount: s.runCount + 1,
              lastRun: new Date().toISOString(),
            };
          }
          return s;
        })
      );
    } catch (e) {
      console.error('Failed to run script:', e);
    }
  };

  const handleDeleteScript = async (id: string) => {
    try {
      await invoke('delete_script', { id });
      setScripts((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      console.error('Failed to delete script:', e);
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
          <ScrollText className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Scripts</h2>
          <Badge variant="secondary" className="ml-1">
            {scripts.length}
          </Badge>
        </div>

        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search scripts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Select
            value={sortBy}
            onValueChange={(v) => setSortBy(v as ScriptSortOption)}
          >
            <SelectTrigger className="w-40">
              <ArrowUpDown className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCRIPT_SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={handleOpenAiDialog} variant="outline" className="gap-2 border-purple-500/30 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10">
            <Sparkles className="h-4 w-4" />
            Generate with AI
          </Button>

          <Button onClick={handleAddScript}>
            <Plus className="h-4 w-4 mr-2" />
            Add Script
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1 min-h-0">
        {scripts.length === 0 ? (
          <EmptyState onAddClick={handleAddScript} />
        ) : filteredScripts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Search className="h-8 w-8 mb-2" />
            <p>No scripts match "{searchQuery}"</p>
          </div>
        ) : (
          <div className="p-4 flex flex-col gap-2 overflow-hidden">
            {filteredScripts.map((script) => (
              <ScriptCard
                key={script.id}
                script={script}
                onRun={handleRunScript}
                onEdit={handleEditScript}
                onDelete={handleDeleteScript}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Add/Edit Dialog */}
      <ScriptDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setAiGeneratedData(null);
        }}
        script={editingScript || (aiGeneratedData ? ({ ...aiGeneratedData, id: '', runCount: 0, createdAt: '', lastRun: null } as Script) : null)}
        onSave={handleSaveScript}
      />

      {/* AI Script Generator Dialog */}
      <AIScriptDialog
        open={aiDialogOpen}
        onOpenChange={setAiDialogOpen}
        onGenerated={handleAiGenerated}
      />
    </div>
  );
}
