/**
 * Required Programs Panel Component
 *
 * View and manage external program dependencies for services.
 */

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import * as dialog from '@tauri-apps/plugin-dialog';
import {
  ExternalLink,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Package,
  Loader2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import type { RequiredProgramStatus } from '@/types/required-programs';

// =============================================================================
// Required Programs Panel
// =============================================================================

export function ProgramsPanel() {
  const [statuses, setStatuses] = useState<RequiredProgramStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [customPath, setCustomPath] = useState('');

  const loadStatuses = async () => {
    try {
      const data = await invoke<RequiredProgramStatus[]>('get_required_programs_status');
      setStatuses(data);
    } catch (e) {
      console.error('Failed to load required programs:', e);
    }
  };

  useEffect(() => {
    async function init() {
      setIsLoading(true);
      await loadStatuses();
      setIsLoading(false);
    }
    init();
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadStatuses();
    setIsRefreshing(false);
  };

  const handleBrowse = async (programId: string) => {
    try {
      const selected = await dialog.open({
        multiple: false,
        filters: [{ name: 'Executables', extensions: ['exe'] }],
      });
      if (selected) {
        await invoke('set_program_path_override', { programId, path: selected });
        await loadStatuses();
        setEditingId(null);
        setCustomPath('');
      }
    } catch (e) {
      console.error('Failed to browse:', e);
    }
  };

  const handleSaveCustomPath = async (programId: string) => {
    try {
      await invoke('set_program_path_override', { programId, path: customPath || null });
      await loadStatuses();
      setEditingId(null);
      setCustomPath('');
    } catch (e) {
      console.error('Failed to save path:', e);
    }
  };

  const handleClearOverride = async (programId: string) => {
    try {
      await invoke('set_program_path_override', { programId, path: null });
      await loadStatuses();
    } catch (e) {
      console.error('Failed to clear override:', e);
    }
  };

  const foundCount = statuses.filter((s) => s.found).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-2xl font-semibold mb-1">Required Programs</h3>
          <p className="text-muted-foreground">
            External tools required by services. Place programs in the{' '}
            <span className="font-mono text-sm">data/programs</span> folder for auto-detection.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Summary */}
      <Card>
        <CardContent className="p-4 py-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <span className="font-medium">{foundCount} Found</span>
            </div>
            <Separator orientation="vertical" className="h-5" />
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium text-muted-foreground">
                {statuses.length - foundCount} Missing
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Program List */}
      <div className="space-y-3">
        {statuses.map((status) => (
          <Card key={status.definition.id}>
            <CardContent className="p-4 py-0">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {status.found ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{status.definition.name}</span>
                      {status.isCustom && (
                        <Badge variant="outline" className="text-xs">
                          Custom Path
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {status.definition.description}
                    </p>
                    {status.path && (
                      <p className="text-xs font-mono text-muted-foreground mt-1 truncate">
                        {status.path}
                      </p>
                    )}
                    {!status.found && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Expected: {status.definition.exeNames.join(', ')}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {status.definition.url && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => window.open(status.definition.url, '_blank')}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  )}
                  {status.isCustom ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleClearOverride(status.definition.id)}
                    >
                      Reset
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleBrowse(status.definition.id)}
                    >
                      Browse
                    </Button>
                  )}
                </div>
              </div>

              {/* Custom path editor (if editing) */}
              {editingId === status.definition.id && (
                <div className="mt-3 pt-3 border-t flex gap-2">
                  <Input
                    value={customPath}
                    onChange={(e) => setCustomPath(e.target.value)}
                    placeholder="C:\path\to\program.exe"
                    className="flex-1"
                  />
                  <Button size="sm" onClick={() => handleSaveCustomPath(status.definition.id)}>
                    Save
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingId(null);
                      setCustomPath('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {statuses.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                No required programs defined yet. Add services that use external tools.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
