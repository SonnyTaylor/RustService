/**
 * Startup Optimizer Renderer
 *
 * Custom renderer for startup optimization results.
 * Shows classified startup items with filter and disable highlights.
 */

import { useState } from 'react';
import { Rocket, Search, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import type { ServiceRendererProps } from './index';

// =============================================================================
// Types
// =============================================================================

interface StartupItemEntry {
  id: string;
  name: string;
  command: string;
  source: string;
  sourceLocation: string;
  enabled: boolean;
  publisher: string | null;
  description: string | null;
  classification: 'essential' | 'useful' | 'unnecessary';
  disabledThisRun: boolean;
}

interface StartupOptimizeData {
  type: 'startup_optimize';
  mode: 'report' | 'disable';
  aiPowered: boolean;
  totalItems: number;
  essentialCount: number;
  usefulCount: number;
  unnecessaryCount: number;
  disabledThisRun: string[];
  failedItems: { name: string; error: string }[];
  items: StartupItemEntry[];
}

type FilterType = 'all' | 'essential' | 'useful' | 'unnecessary';

// =============================================================================
// Findings Variant
// =============================================================================

function FindingsRenderer({ result }: ServiceRendererProps) {
  const finding = result.findings[0];
  const data = finding?.data as StartupOptimizeData | undefined;
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');

  if (!data || data.type !== 'startup_optimize') return null;

  const hasUnnecessary = data.unnecessaryCount > 0;
  const disabledCount = data.disabledThisRun.length;

  const getStatusColor = () => {
    if (hasUnnecessary && data.mode === 'report')
      return 'from-yellow-500/10 to-orange-500/10 dark:from-yellow-500/20 dark:to-orange-500/20';
    return 'from-green-500/10 to-emerald-500/10 dark:from-green-500/20 dark:to-emerald-500/20';
  };

  const filteredItems = data.items.filter((item) => {
    if (filter !== 'all' && item.classification !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        item.command.toLowerCase().includes(q) ||
        (item.publisher ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const classificationBadge = (c: string, disabledThisRun: boolean) => {
    if (disabledThisRun) {
      return (
        <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-xs">
          Disabled
        </Badge>
      );
    }
    switch (c) {
      case 'essential':
        return (
          <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-xs">
            Essential
          </Badge>
        );
      case 'unnecessary':
        return (
          <Badge className="bg-red-500/10 text-red-500 border-red-500/20 text-xs">
            Unnecessary
          </Badge>
        );
      default:
        return (
          <Badge className="bg-muted text-muted-foreground border text-xs">
            Useful
          </Badge>
        );
    }
  };

  const sourceName = (source: string) => {
    switch (source) {
      case 'registryCurrentUser':
        return 'Registry (User)';
      case 'registryLocalMachine':
        return 'Registry (Machine)';
      case 'startupFolderUser':
        return 'Startup Folder (User)';
      case 'startupFolderAllUsers':
        return 'Startup Folder (All)';
      case 'taskScheduler':
        return 'Task Scheduler';
      default:
        return source;
    }
  };

  return (
    <Card className="overflow-hidden border-0 shadow-lg">
      <CardHeader className={`px-4 py-2 bg-gradient-to-r ${getStatusColor()}`}>
        <CardTitle className="flex items-center gap-2 text-sm">
          <div
            className={`p-2 rounded-lg ${
              hasUnnecessary && data.mode === 'report'
                ? 'bg-yellow-500/20 text-yellow-500'
                : 'bg-green-500/20 text-green-500'
            }`}
          >
            <Rocket className="h-5 w-5" />
          </div>
          Startup Optimizer
          {data.aiPowered && (
            <Badge className="bg-violet-500/10 text-violet-500 border-violet-500/20 text-xs gap-1">
              <Sparkles className="h-3 w-3" />
              AI
            </Badge>
          )}
          <Badge className="ml-auto bg-muted/50 text-foreground border">
            {data.mode === 'disable'
              ? `Disabled ${disabledCount} Item${disabledCount !== 1 ? 's' : ''}`
              : 'Report Only'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-3 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-muted/30 border text-center">
            <p className="text-2xl font-bold">{data.totalItems}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
            <p className="text-2xl font-bold text-green-500">
              {data.essentialCount}
            </p>
            <p className="text-xs text-muted-foreground">Essential</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/30 border text-center">
            <p className="text-2xl font-bold">{data.usefulCount}</p>
            <p className="text-xs text-muted-foreground">Useful</p>
          </div>
          <div
            className={`p-3 rounded-lg border text-center ${
              data.unnecessaryCount > 0
                ? 'bg-red-500/10 border-red-500/20'
                : 'bg-muted/30'
            }`}
          >
            <p
              className={`text-2xl font-bold ${
                data.unnecessaryCount > 0 ? 'text-red-500' : ''
              }`}
            >
              {data.unnecessaryCount}
            </p>
            <p className="text-xs text-muted-foreground">Unnecessary</p>
          </div>
        </div>

        {/* Filter + Search */}
        <div className="flex gap-2 flex-wrap">
          {(['all', 'essential', 'useful', 'unnecessary'] as FilterType[]).map(
            (f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filter === f
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ),
          )}
        </div>

        {data.items.length > 5 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search startup items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        )}

        {/* Item List */}
        <div className="max-h-80 overflow-y-auto space-y-1.5">
          {filteredItems.map((item, i) => (
            <div
              key={i}
              className={`p-2.5 rounded-lg border text-sm ${
                item.disabledThisRun
                  ? 'bg-blue-500/10 border-blue-500/20'
                  : item.classification === 'unnecessary'
                    ? 'bg-red-500/5 border-red-500/20'
                    : 'bg-muted/20'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {sourceName(item.source)}
                    {item.publisher ? ` · ${item.publisher}` : ''}
                    {!item.enabled && !item.disabledThisRun ? ' · Disabled' : ''}
                  </p>
                </div>
                {classificationBadge(item.classification, item.disabledThisRun)}
              </div>
            </div>
          ))}
          {filteredItems.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              {search ? 'No matching items' : 'No items to display'}
            </p>
          )}
        </div>

        {/* Hint */}
        {data.mode === 'report' && data.unnecessaryCount > 0 && (
          <p className="text-xs text-muted-foreground text-center">
            Re-run with &quot;Disable Unnecessary Items&quot; enabled to
            automatically disable {data.unnecessaryCount} item
            {data.unnecessaryCount !== 1 ? 's' : ''}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Customer Print Variant
// =============================================================================

function CustomerRenderer({ result }: ServiceRendererProps) {
  const finding = result.findings[0];
  const data = finding?.data as StartupOptimizeData | undefined;

  if (!data || data.type !== 'startup_optimize') return null;

  const isGood = data.unnecessaryCount === 0;
  const disabledCount = data.disabledThisRun.length;

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <div className="flex items-start gap-3">
        <div
          className={`p-2 rounded-lg ${isGood ? 'bg-green-100' : 'bg-yellow-100'}`}
        >
          <Rocket
            className={`h-5 w-5 ${isGood ? 'text-green-600' : 'text-yellow-600'}`}
          />
        </div>
        <div className="flex-1">
          <p className="font-bold text-gray-800">
            {isGood
              ? '✓ No Unnecessary Startup Items'
              : data.mode === 'disable'
                ? `✓ Disabled ${disabledCount} Unnecessary Startup Item${disabledCount !== 1 ? 's' : ''}`
                : `⚠ ${data.unnecessaryCount} Unnecessary Startup Item${data.unnecessaryCount !== 1 ? 's' : ''} Found`}
          </p>
          <p className="text-sm text-gray-500">
            {data.totalItems} items analyzed{data.aiPowered ? ' by AI' : ''}: {data.essentialCount} essential,{' '}
            {data.usefulCount} useful, {data.unnecessaryCount} unnecessary
          </p>
          {data.disabledThisRun.length > 0 && (
            <p className="text-sm text-gray-500 mt-1">
              Disabled: {data.disabledThisRun.join(', ')}
            </p>
          )}
        </div>
        <div
          className={`text-2xl ${isGood || data.mode === 'disable' ? 'text-green-500' : 'text-yellow-500'}`}
        >
          {isGood || data.mode === 'disable' ? '✓' : '⚠'}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Renderer
// =============================================================================

export function StartupOptimizeRenderer(props: ServiceRendererProps) {
  if (props.variant === 'customer') return <CustomerRenderer {...props} />;
  return <FindingsRenderer {...props} />;
}
