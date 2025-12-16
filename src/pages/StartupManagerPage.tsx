/**
 * Startup Manager Page
 * 
 * Manage Windows startup programs from Registry and shell folders.
 */

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Rocket,
  RefreshCw,
  Power,
  Trash2,
  Search,
  AlertCircle,
  CheckCircle2,
  Loader2,
  FolderOpen,
  Key,
  Clock,
  ExternalLink,
  Filter,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

import type { StartupItem, StartupSource, StartupImpact } from '@/types';

/** Get human-readable source name */
function getSourceDisplayName(source: StartupSource): string {
  switch (source) {
    case 'registryCurrentUser':
      return 'Registry (User)';
    case 'registryLocalMachine':
      return 'Registry (System)';
    case 'startupFolderUser':
      return 'Startup Folder (User)';
    case 'startupFolderAllUsers':
      return 'Startup Folder (All)';
    case 'taskScheduler':
      return 'Task Scheduler';
    default:
      return 'Unknown';
  }
}

/** Get source icon */
function SourceIcon({ source }: { source: StartupSource }) {
  switch (source) {
    case 'registryCurrentUser':
    case 'registryLocalMachine':
      return <Key className="h-4 w-4" />;
    case 'startupFolderUser':
    case 'startupFolderAllUsers':
      return <FolderOpen className="h-4 w-4" />;
    case 'taskScheduler':
      return <Clock className="h-4 w-4" />;
    default:
      return <Rocket className="h-4 w-4" />;
  }
}

/** Get impact badge variant */
function getImpactBadgeVariant(impact: StartupImpact): 'destructive' | 'default' | 'secondary' | 'outline' {
  switch (impact) {
    case 'high':
      return 'destructive';
    case 'medium':
      return 'default';
    case 'low':
      return 'secondary';
    default:
      return 'outline';
  }
}

/**
 * Startup Manager Page - Main component
 */
export function StartupManagerPage() {
  const [items, setItems] = useState<StartupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [toggling, setToggling] = useState<string | null>(null);
  const [deleteItem, setDeleteItem] = useState<StartupItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Load startup items
  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<StartupItem[]>('get_startup_items');
      setItems(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // Toggle startup item
  const handleToggle = async (item: StartupItem) => {
    setToggling(item.id);
    try {
      await invoke('toggle_startup_item', {
        id: item.id,
        enabled: !item.enabled,
      });
      // Update local state
      setItems(prev => prev.map(i => 
        i.id === item.id ? { ...i, enabled: !i.enabled } : i
      ));
    } catch (err) {
      console.error('Failed to toggle startup item:', err);
      // Reload to get correct state
      await loadItems();
    } finally {
      setToggling(null);
    }
  };

  // Delete startup item
  const handleDelete = async () => {
    if (!deleteItem) return;
    setDeleting(true);
    try {
      await invoke('delete_startup_item', { id: deleteItem.id });
      setItems(prev => prev.filter(i => i.id !== deleteItem.id));
    } catch (err) {
      console.error('Failed to delete startup item:', err);
    } finally {
      setDeleting(false);
      setDeleteItem(null);
    }
  };

  // Filter items
  const filteredItems = items.filter(item => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!item.name.toLowerCase().includes(query) &&
          !item.command.toLowerCase().includes(query)) {
        return false;
      }
    }
    
    // Source filter
    if (sourceFilter !== 'all') {
      if (sourceFilter === 'registry' && 
          !item.source.startsWith('registry')) {
        return false;
      }
      if (sourceFilter === 'folder' && 
          !item.source.startsWith('startupFolder')) {
        return false;
      }
      if (sourceFilter === 'task' && 
          item.source !== 'taskScheduler') {
        return false;
      }
    }
    
    // Status filter
    if (statusFilter === 'enabled' && !item.enabled) return false;
    if (statusFilter === 'disabled' && item.enabled) return false;
    
    return true;
  });

  // Stats
  const enabledCount = items.filter(i => i.enabled).length;
  const disabledCount = items.filter(i => !i.enabled).length;
  const highImpactCount = items.filter(i => i.impact === 'high' && i.enabled).length;

  return (
    <div className="h-full flex flex-col overflow-hidden min-h-0">
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Rocket className="h-6 w-6" />
                Startup Manager
              </h2>
              <p className="text-muted-foreground text-sm mt-1">
                Manage programs that run when Windows starts
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={loadItems} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold">{items.length}</div>
                <div className="text-xs text-muted-foreground">Total Items</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-green-500">{enabledCount}</div>
                <div className="text-xs text-muted-foreground">Enabled</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-muted-foreground">{disabledCount}</div>
                <div className="text-xs text-muted-foreground">Disabled</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-destructive">{highImpactCount}</div>
                <div className="text-xs text-muted-foreground">High Impact (Active)</div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-48">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search startup items..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger className="w-40">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    <SelectItem value="registry">Registry</SelectItem>
                    <SelectItem value="folder">Startup Folder</SelectItem>
                    <SelectItem value="task">Task Scheduler</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="enabled">Enabled</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Error State */}
          {error && (
            <Card className="border-destructive">
              <CardContent className="pt-4 flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                <span>{error}</span>
              </CardContent>
            </Card>
          )}

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Items List */}
          {!loading && (
            <div className="space-y-2">
              {filteredItems.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    {searchQuery || sourceFilter !== 'all' || statusFilter !== 'all'
                      ? 'No items match your filters'
                      : 'No startup items found'}
                  </CardContent>
                </Card>
              ) : (
                filteredItems.map((item) => (
                  <Card key={item.id} className={!item.enabled ? 'opacity-60' : ''}>
                    <CardContent className="py-4">
                      <div className="flex items-start gap-4">
                        {/* Toggle Switch */}
                        <div className="pt-1">
                          {toggling === item.id ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : item.source.startsWith('startupFolder') ? (
                            <div className="w-9 h-5 flex items-center justify-center">
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            </div>
                          ) : (
                            <Switch
                              checked={item.enabled}
                              onCheckedChange={() => handleToggle(item)}
                              disabled={toggling !== null}
                            />
                          )}
                        </div>

                        {/* Item Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{item.name}</span>
                            <Badge variant={getImpactBadgeVariant(item.impact)}>
                              {item.impact} impact
                            </Badge>
                            {!item.enabled && (
                              <Badge variant="secondary">Disabled</Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground mt-1 truncate max-w-lg">
                            {item.command}
                          </div>
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <SourceIcon source={item.source} />
                              {getSourceDisplayName(item.source)}
                            </div>
                            {item.publisher && (
                              <span>• {item.publisher}</span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1">
                          {item.path && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Open file location"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteItem(item)}
                            title="Delete startup item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}

          {/* Info Card */}
          <Card className="bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">About Startup Items</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                <strong>Registry items</strong> can be enabled or disabled without deleting them.
              </p>
              <p>
                <strong>Startup folder items</strong> are always enabled if present - delete to remove.
              </p>
              <p>
                <strong>High impact</strong> items typically use more resources and slow down startup.
              </p>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteItem !== null} onOpenChange={() => setDeleteItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Startup Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteItem?.name}" from startup?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
