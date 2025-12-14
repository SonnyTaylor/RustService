/**
 * Programs Page Component
 *
 * Manage and launch portable tools from the data folder.
 * Features: add/edit programs, icon extraction, search, sort by usage.
 */

import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import * as dialog from '@tauri-apps/plugin-dialog';
import {
  AppWindow,
  Plus,
  Search,
  Play,
  Edit,
  Trash2,
  FolderOpen,
  Terminal,
  Image,
  MoreVertical,
  ArrowUpDown,
  AlertCircle,
  Loader2,
  Upload,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

import type { Program, ProgramSortOption } from '@/types/programs';
import { PROGRAM_SORT_OPTIONS } from '@/types/programs';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Fuzzy search within a string
 */
function fuzzyMatch(text: string, query: string): boolean {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  
  // Simple substring match first
  if (lowerText.includes(lowerQuery)) return true;
  
  // Fuzzy match: all query chars in order
  let queryIndex = 0;
  for (const char of lowerText) {
    if (char === lowerQuery[queryIndex]) {
      queryIndex++;
      if (queryIndex === lowerQuery.length) return true;
    }
  }
  
  return false;
}

/**
 * Sort programs based on selected option
 */
function sortPrograms(programs: Program[], sortBy: ProgramSortOption): Program[] {
  const sorted = [...programs];
  
  switch (sortBy) {
    case 'name-asc':
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case 'name-desc':
      return sorted.sort((a, b) => b.name.localeCompare(a.name));
    case 'most-used':
      return sorted.sort((a, b) => b.launchCount - a.launchCount);
    case 'recently-added':
      return sorted.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    case 'recently-launched':
      return sorted.sort((a, b) => {
        if (!a.lastLaunched && !b.lastLaunched) return 0;
        if (!a.lastLaunched) return 1;
        if (!b.lastLaunched) return -1;
        return new Date(b.lastLaunched).getTime() - new Date(a.lastLaunched).getTime();
      });
    default:
      return sorted;
  }
}

// =============================================================================
// Program Dialog Component
// =============================================================================

interface ProgramDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  program?: Program | null;
  onSave: (data: {
    name: string;
    description: string;
    version: string;
    exePath: string;
    isCli: boolean;
    iconPath: string | null;
  }) => Promise<void>;
}

function ProgramDialog({ open, onOpenChange, program, onSave }: ProgramDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [version, setVersion] = useState('');
  const [exePath, setExePath] = useState('');
  const [isCli, setIsCli] = useState(false);
  const [iconPath, setIconPath] = useState<string | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog opens/closes or program changes
  useEffect(() => {
    if (open) {
      if (program) {
        setName(program.name);
        setDescription(program.description);
        setVersion(program.version);
        setExePath(program.exePath);
        setIsCli(program.isCli);
        setIconPath(program.iconPath);
        setIconPreview(program.iconPath ? `icon://${program.iconPath}` : null);
      } else {
        setName('');
        setDescription('');
        setVersion('');
        setExePath('');
        setIsCli(false);
        setIconPath(null);
        setIconPreview(null);
      }
      setError(null);
    }
  }, [open, program]);

  // Load icon preview
  useEffect(() => {
    async function loadIconPreview() {
      if (iconPath) {
        try {
          // Use backend command for secure local file access
          const url = await invoke<string | null>('get_program_icon', { iconPath });
          setIconPreview(url);
        } catch {
          setIconPreview(null);
        }
      }
    }
    loadIconPreview();
  }, [iconPath]);

  const handleBrowseExe = async () => {
    try {
      const selected = await dialog.open({
        multiple: false,
        filters: [{ name: 'Executables', extensions: ['exe'] }],
      });
      
      if (selected) {
        setExePath(selected);
        setError(null);
        
        // Auto-extract icon
        setIsExtracting(true);
        try {
          const extractedPath = await invoke<string>('extract_program_icon', { 
            exePath: selected 
          });
          setIconPath(extractedPath);
        } catch (e) {
          console.warn('Could not extract icon:', e);
          // Not a fatal error, continue without icon
        } finally {
          setIsExtracting(false);
        }
        
        // Try to auto-fill name from filename
        if (!name) {
          const filename = selected.split(/[/\\]/).pop()?.replace('.exe', '') || '';
          setName(filename.charAt(0).toUpperCase() + filename.slice(1));
        }
      }
    } catch (e) {
      console.error('Failed to open file dialog:', e);
    }
  };

  const handleBrowseIcon = async () => {
    try {
      const selected = await dialog.open({
        multiple: false,
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'ico', 'bmp'] }],
      });
      
      if (selected) {
        setIconPath(selected);
        // Custom icons will preview after save - just show placeholder
        setIconPreview(null);
      }
    } catch (e) {
      console.error('Failed to open file dialog:', e);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!exePath.trim()) {
      setError('Executable path is required');
      return;
    }

    setIsSaving(true);
    setError(null);
    
    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        version: version.trim(),
        exePath: exePath.trim(),
        isCli,
        iconPath,
      });
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{program ? 'Edit Program' : 'Add Program'}</DialogTitle>
          <DialogDescription>
            {program ? 'Update program details' : 'Add a portable program to your launcher'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Executable Path */}
          <div className="space-y-2">
            <Label htmlFor="exe-path">Executable</Label>
            <div className="flex gap-2">
              <Input
                id="exe-path"
                value={exePath}
                onChange={(e) => setExePath(e.target.value)}
                placeholder="C:\path\to\program.exe"
                className="flex-1"
              />
              <Button type="button" variant="outline" onClick={handleBrowseExe}>
                Browse
              </Button>
            </div>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Program Name"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this program do?"
            />
          </div>

          {/* Version */}
          <div className="space-y-2">
            <Label htmlFor="version">Version</Label>
            <Input
              id="version"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="1.0.0"
            />
          </div>

          {/* Icon */}
          <div className="space-y-2">
            <Label>Icon</Label>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg border bg-muted flex items-center justify-center overflow-hidden">
                {isExtracting ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : iconPreview ? (
                  <img 
                    src={iconPreview} 
                    alt="Icon preview" 
                    className="w-full h-full object-cover"
                    onError={() => setIconPreview(null)}
                  />
                ) : (
                  <AppWindow className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={handleBrowseIcon}>
                <Image className="h-4 w-4 mr-2" />
                Custom Icon
              </Button>
            </div>
          </div>

          {/* CLI Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="is-cli" className="cursor-pointer">CLI Tool</Label>
              <p className="text-xs text-muted-foreground">
                Cannot be launched from the GUI
              </p>
            </div>
            <Switch
              id="is-cli"
              checked={isCli}
              onCheckedChange={setIsCli}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {program ? 'Save Changes' : 'Add Program'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Import Legacy Dialog Component
// =============================================================================

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
}

function ImportDialog({ open, onOpenChange, onImportComplete }: ImportDialogProps) {
  const [isImporting, setIsImporting] = useState(false);
  const [resetLaunchCount, setResetLaunchCount] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setResult(null);
      setResetLaunchCount(false);
    }
  }, [open]);

  const handleImport = async () => {
    try {
      // Open file picker for JSON
      const selected = await dialog.open({
        multiple: false,
        filters: [{ name: 'JSON Files', extensions: ['json'] }],
      });

      if (!selected) return;

      setIsImporting(true);
      setResult(null);

      // Call backend import command with file path (backend reads the file)
      const importedCount = await invoke<number>('import_legacy_programs', {
        filePath: selected,
        resetLaunchCount,
      });

      setResult({
        success: true,
        message: `Successfully imported ${importedCount} program${importedCount !== 1 ? 's' : ''}`,
      });

      onImportComplete();
    } catch (e) {
      setResult({
        success: false,
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Import Legacy Programs</DialogTitle>
          <DialogDescription>
            Import programs from an autoservice JSON file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Reset Launch Count Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="reset-count" className="cursor-pointer">Reset launch counts</Label>
              <p className="text-xs text-muted-foreground">
                Start all programs at 0 launches
              </p>
            </div>
            <Switch
              id="reset-count"
              checked={resetLaunchCount}
              onCheckedChange={setResetLaunchCount}
            />
          </div>

          {/* Result Message */}
          {result && (
            <div className={`flex items-center gap-2 text-sm ${result.success ? 'text-green-600' : 'text-destructive'}`}>
              <AlertCircle className="h-4 w-4" />
              {result.message}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {result?.success ? 'Done' : 'Cancel'}
          </Button>
          <Button onClick={handleImport} disabled={isImporting}>
            {isImporting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Upload className="h-4 w-4 mr-2" />
            Select JSON File
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Program Card Component
// =============================================================================

interface ProgramCardProps {
  program: Program;
  dataDir: string;
  onLaunch: (id: string) => void;
  onEdit: (program: Program) => void;
  onDelete: (id: string) => void;
  onReveal: (id: string) => void;
}

function ProgramCard({ 
  program, 
  onLaunch, 
  onEdit, 
  onDelete, 
  onReveal,
}: Omit<ProgramCardProps, 'dataDir'>) {
  const [iconUrl, setIconUrl] = useState<string | null>(null);

  // Load icon via backend command
  useEffect(() => {
    if (program.iconPath) {
      invoke<string | null>('get_program_icon', { iconPath: program.iconPath })
        .then(url => setIconUrl(url))
        .catch(() => setIconUrl(null));
    } else {
      setIconUrl(null);
    }
  }, [program.iconPath]);

  return (
    <Card className="group hover:shadow-md transition-all duration-200 hover:border-primary/50">
      <CardContent className="p-3 py-2">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
            {iconUrl ? (
              <img 
                src={iconUrl} 
                alt={program.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.parentElement?.classList.add('no-icon');
                }}
              />
            ) : (
              <AppWindow className="h-5 w-5 text-muted-foreground" />
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium truncate">{program.name}</h3>
              {program.isCli && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Terminal className="h-3 w-3" />
                  CLI
                </Badge>
              )}
            </div>
            {program.description && (
              <p className="text-sm text-muted-foreground truncate">
                {program.description}
              </p>
            )}
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              {program.version && <span>v{program.version}</span>}
              <span>Launched {program.launchCount}×</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <TooltipProvider delayDuration={300}>
              {program.isCli ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" disabled className="h-8 w-8">
                      <Play className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>CLI tools cannot be launched from GUI</TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-100 dark:hover:bg-green-900/30"
                      onClick={() => onLaunch(program.id)}
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Launch</TooltipContent>
                </Tooltip>
              )}
            </TooltipProvider>

            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(program)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onReveal(program.id)}>
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Show in Explorer
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={() => onDelete(program.id)}
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
        <AppWindow className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <h3 className="text-lg font-semibold">No Programs Yet</h3>
        <p className="text-muted-foreground text-sm max-w-sm mt-1">
          Add portable programs to quickly launch them from here.
          Drop executables in your data folder and add them to get started.
        </p>
      </div>
      <Button onClick={onAddClick}>
        <Plus className="h-4 w-4 mr-2" />
        Add Your First Program
      </Button>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function ProgramsPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<ProgramSortOption>('name-asc');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProgram, setEditingProgram] = useState<Program | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

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

  // Filter and sort programs
  const filteredPrograms = useMemo(() => {
    let result = programs;
    
    if (searchQuery) {
      result = result.filter(p => 
        fuzzyMatch(p.name, searchQuery) || 
        fuzzyMatch(p.description, searchQuery)
      );
    }
    
    return sortPrograms(result, sortBy);
  }, [programs, searchQuery, sortBy]);

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
    <div className="h-full flex flex-col">
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
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search programs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

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

      {/* Content */}
      <ScrollArea className="flex-1">
        {programs.length === 0 ? (
          <EmptyState onAddClick={handleAddProgram} />
        ) : filteredPrograms.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Search className="h-8 w-8 mb-2" />
            <p>No programs match "{searchQuery}"</p>
          </div>
        ) : (
          <div className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPrograms.map(program => (
              <ProgramCard
                key={program.id}
                program={program}
                onLaunch={handleLaunchProgram}
                onEdit={handleEditProgram}
                onDelete={handleDeleteProgram}
                onReveal={handleRevealProgram}
              />
            ))}
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
