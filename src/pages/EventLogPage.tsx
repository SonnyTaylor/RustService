/**
 * Event Log Viewer Page
 *
 * View and filter Windows Event Logs.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  ScrollText,
  RefreshCw,
  Search,
  AlertCircle,
  AlertTriangle,
  XCircle,
  Loader2,
  Filter,
  ChevronDown,
  ChevronUp,
  Copy,
  Clock,
  BarChart3,
  ArrowUpDown,
  Calendar,
  Check,
  Download,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AnimatedList, AnimatedItem } from '@/components/animation-context';

import type { EventLogSource, EventLogEntry, EventLogFilter, EventLogStats } from '@/types';
import { getLevelBadgeVariant, formatRelativeTime, getLevelRowClass } from '@/types/event-log';
import { useClipboard } from '@/lib/clipboard-utils';
import { LevelIcon, formatTime, computeStartTime } from '@/components/event-log/event-log-helpers';

/**
 * Event Log Viewer Page - Main component
 */
export function EventLogPage() {
  const [sources, setSources] = useState<EventLogSource[]>([]);
  const [entries, setEntries] = useState<EventLogEntry[]>([]);
  const [stats, setStats] = useState<EventLogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [selectedLog, setSelectedLog] = useState('System');
  const [levelFilter, setLevelFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [limit, setLimit] = useState('100');
  const [timeRange, setTimeRange] = useState('all');
  const [providerFilter, setProviderFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');

  // Expanded entry
  const [expandedEntry, setExpandedEntry] = useState<number | null>(null);

  // Clipboard
  const { copyToClipboard, isCopied } = useClipboard();
  const [copiedAll, setCopiedAll] = useState(false);

  // Unique providers derived from entries
  const uniqueProviders = useMemo(() => {
    const providers = new Set<string>();
    entries.forEach((entry) => {
      if (entry.providerName) {
        providers.add(entry.providerName);
      }
    });
    return Array.from(providers).sort();
  }, [entries]);

  // Sorted entries
  const sortedEntries = useMemo(() => {
    if (sortBy === 'oldest') {
      return [...entries].reverse();
    }
    return entries;
  }, [entries, sortBy]);

  // Load sources on mount
  useEffect(() => {
    loadSources();
  }, []);

  // Load entries when log or filter changes
  useEffect(() => {
    if (selectedLog) {
      loadEntries();
      loadStats();
    }
  }, [selectedLog, levelFilter, limit, timeRange]);

  const loadSources = async () => {
    try {
      const result = await invoke<EventLogSource[]>('get_event_log_sources');
      setSources(result);
      if (result.length > 0 && !result.find(s => s.name === selectedLog)) {
        setSelectedLog(result[0].name);
      }
    } catch (err) {
      console.error('Failed to load log sources:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadEntries = useCallback(async () => {
    setLoadingEntries(true);
    setError(null);
    try {
      const filter: EventLogFilter = {
        logName: selectedLog,
        level: levelFilter === 'All' ? undefined : levelFilter,
        startTime: computeStartTime(timeRange),
        sourceFilter: providerFilter !== 'all' ? providerFilter : undefined,
        limit: parseInt(limit) || 100,
      };
      const result = await invoke<EventLogEntry[]>('get_event_logs', { filter });
      setEntries(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingEntries(false);
    }
  }, [selectedLog, levelFilter, limit, timeRange, providerFilter]);

  const loadStats = async () => {
    try {
      const result = await invoke<EventLogStats>('get_event_log_stats', { logName: selectedLog });
      setStats(result);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      loadEntries();
      return;
    }

    setLoadingEntries(true);
    setError(null);
    try {
      const result = await invoke<EventLogEntry[]>('search_event_logs', {
        logName: selectedLog,
        query: searchQuery,
        limit: parseInt(limit) || 100,
      });
      setEntries(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingEntries(false);
    }
  };

  const copyAllEntries = () => {
    const text = sortedEntries
      .map((entry) => {
        const lines = [
          `[${entry.levelDisplay}] Event ID: ${entry.id} | Record: ${entry.recordId}`,
          `Time: ${formatTime(entry.timeCreated)}`,
          `Source: ${entry.providerName}`,
          `Computer: ${entry.computer}`,
          entry.user ? `User: ${entry.user}` : null,
          entry.taskCategory ? `Category: ${entry.taskCategory}` : null,
          `Message: ${entry.message}`,
          '---',
        ];
        return lines.filter(Boolean).join('\n');
      })
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const hasActiveFilters = levelFilter !== 'All' || timeRange !== 'all' || providerFilter !== 'all' || searchQuery.trim() !== '';
  const parsedLimit = parseInt(limit) || 100;

  return (
    <div className="h-full flex flex-col overflow-hidden min-h-0">
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <ScrollText className="h-6 w-6" />
                Event Log Viewer
              </h2>
              <p className="text-muted-foreground text-sm mt-1">
                View and analyze Windows Event Logs
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={copyAllEntries}
                disabled={sortedEntries.length === 0}
              >
                {copiedAll ? (
                  <Check className="h-4 w-4 mr-2 text-green-500" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                {copiedAll ? 'Copied!' : 'Copy All'}
              </Button>
              <Button variant="outline" size="sm" onClick={loadEntries} disabled={loadingEntries}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loadingEntries ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          {/* Stats Cards - Row 1 */}
          {stats && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-red-600" />
                      <span className="text-xs text-muted-foreground">Critical (24h)</span>
                    </div>
                    <div className="text-2xl font-bold text-red-600 mt-1">
                      {stats.critical24h}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-destructive" />
                      <span className="text-xs text-muted-foreground">Errors (24h)</span>
                    </div>
                    <div className="text-2xl font-bold text-destructive mt-1">
                      {stats.errors24h}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      <span className="text-xs text-muted-foreground">Warnings (24h)</span>
                    </div>
                    <div className="text-2xl font-bold text-yellow-600 mt-1">
                      {stats.warnings24h}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Errors (30d)</span>
                    </div>
                    <div className="text-2xl font-bold mt-1">
                      {stats.errors30d}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Stats Cards - Row 2 */}
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-destructive" />
                      <span className="text-xs text-muted-foreground">Errors (7d)</span>
                    </div>
                    <div className="text-2xl font-bold text-destructive mt-1">
                      {stats.errors7d}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      <span className="text-xs text-muted-foreground">Warnings (7d)</span>
                    </div>
                    <div className="text-2xl font-bold text-yellow-600 mt-1">
                      {stats.warnings7d}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      <span className="text-xs text-muted-foreground">Warnings (30d)</span>
                    </div>
                    <div className="text-2xl font-bold text-yellow-600 mt-1">
                      {stats.warnings30d}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}

          {/* Filters */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-4">
                <Select value={selectedLog} onValueChange={setSelectedLog}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Select log" />
                  </SelectTrigger>
                  <SelectContent>
                    {sources.map((source) => (
                      <SelectItem key={source.name} value={source.name}>
                        {source.displayName}
                        {source.recordsCount !== null && (
                          <span className="text-muted-foreground ml-2">
                            ({source.recordsCount.toLocaleString()})
                          </span>
                        )}
                      </SelectItem>
                    ))}
                    {sources.length === 0 && (
                      <>
                        <SelectItem value="System">System</SelectItem>
                        <SelectItem value="Application">Application</SelectItem>
                        <SelectItem value="Security">Security</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>

                <Select value={levelFilter} onValueChange={setLevelFilter}>
                  <SelectTrigger className="w-36">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Levels</SelectItem>
                    <SelectItem value="Errors">Errors Only</SelectItem>
                    <SelectItem value="Warnings">Warnings+</SelectItem>
                    <SelectItem value="Critical">Critical</SelectItem>
                    <SelectItem value="Error">Error</SelectItem>
                    <SelectItem value="Warning">Warning</SelectItem>
                    <SelectItem value="Information">Information</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={timeRange} onValueChange={setTimeRange}>
                  <SelectTrigger className="w-36">
                    <Calendar className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Time range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="1h">Last Hour</SelectItem>
                    <SelectItem value="24h">Last 24h</SelectItem>
                    <SelectItem value="7d">Last 7 Days</SelectItem>
                    <SelectItem value="30d">Last 30 Days</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={providerFilter} onValueChange={setProviderFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Providers</SelectItem>
                    {uniqueProviders.map((provider) => (
                      <SelectItem key={provider} value={provider}>
                        {provider}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'newest' | 'oldest')}>
                  <SelectTrigger className="w-36">
                    <ArrowUpDown className="h-4 w-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest First</SelectItem>
                    <SelectItem value="oldest">Oldest First</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={limit} onValueChange={setLimit}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="250">250</SelectItem>
                    <SelectItem value="500">500</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex-1 min-w-48 flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search messages, sources, or event IDs..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      className="pl-9"
                    />
                  </div>
                  <Button onClick={handleSearch} disabled={loadingEntries}>
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
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
          {loadingEntries && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Event List */}
          {!loadingEntries && (
            <div className="space-y-1">
              {/* Result count */}
              {sortedEntries.length > 0 && (
                <div className="text-sm text-muted-foreground px-1 pb-2">
                  Showing {sortedEntries.length} events
                  {sortedEntries.length === parsedLimit && (
                    <span className="ml-1">(limit: {parsedLimit})</span>
                  )}
                </div>
              )}

              {sortedEntries.length === 0 ? (
                <Card>
                  <CardContent className="py-12 flex flex-col items-center justify-center text-center">
                    <ScrollText className="h-10 w-10 text-muted-foreground mb-3" />
                    <p className="text-muted-foreground font-medium">
                      {hasActiveFilters
                        ? 'No events match your current filters'
                        : 'No events found'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {hasActiveFilters
                        ? 'Try adjusting the level, time range, or provider filters'
                        : `No events available in the ${selectedLog} log`}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <AnimatedList className="space-y-1">
                  {sortedEntries.map((entry) => (
                    <AnimatedItem key={entry.recordId}>
                      <Collapsible
                        open={expandedEntry === entry.recordId}
                        onOpenChange={(open) => setExpandedEntry(open ? entry.recordId : null)}
                      >
                        <Card className={`transition-colors ${getLevelRowClass(entry.levelDisplay)}`}>
                          <CollapsibleTrigger asChild>
                            <CardContent className="py-3 cursor-pointer hover:bg-muted/50">
                              <div className="flex items-start gap-3">
                                <LevelIcon level={entry.levelDisplay} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Badge variant={getLevelBadgeVariant(entry.levelDisplay)}>
                                      {entry.levelDisplay}
                                    </Badge>
                                    <span className="font-mono text-xs text-muted-foreground">
                                      ID: {entry.id}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {entry.providerName}
                                    </span>
                                  </div>
                                  <div className="text-sm mt-1 line-clamp-2">
                                    {entry.message.split('\n')[0]}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                    <Clock className="h-3 w-3" />
                                    <span>{formatTime(entry.timeCreated)}</span>
                                    <span>({formatRelativeTime(entry.timeCreated)})</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  {expandedEntry === entry.recordId ? (
                                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <Separator />
                            <CardContent className="py-4 space-y-3">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                  <span className="text-xs text-muted-foreground">Event ID</span>
                                  <div className="font-mono">{entry.id}</div>
                                </div>
                                <div>
                                  <span className="text-xs text-muted-foreground">Record ID</span>
                                  <div className="font-mono">{entry.recordId}</div>
                                </div>
                                <div>
                                  <span className="text-xs text-muted-foreground">Computer</span>
                                  <div>{entry.computer}</div>
                                </div>
                                {entry.user && (
                                  <div>
                                    <span className="text-xs text-muted-foreground">User</span>
                                    <div>{entry.user}</div>
                                  </div>
                                )}
                              </div>
                              {entry.taskCategory && (
                                <div className="text-sm">
                                  <span className="text-xs text-muted-foreground">Task Category</span>
                                  <div>{entry.taskCategory}</div>
                                </div>
                              )}
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs text-muted-foreground">Full Message</span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2"
                                    onClick={() => copyToClipboard(entry.message, String(entry.recordId))}
                                  >
                                    {isCopied(String(entry.recordId)) ? (
                                      <Check className="h-3 w-3 mr-1 text-green-500" />
                                    ) : (
                                      <Copy className="h-3 w-3 mr-1" />
                                    )}
                                    {isCopied(String(entry.recordId)) ? 'Copied' : 'Copy'}
                                  </Button>
                                </div>
                                <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto whitespace-pre-wrap font-mono">
                                  {entry.message}
                                </pre>
                              </div>
                              {entry.keywords.length > 0 && (
                                <div>
                                  <span className="text-xs text-muted-foreground">Keywords</span>
                                  <div className="flex gap-1 flex-wrap mt-1">
                                    {entry.keywords.map((kw, idx) => (
                                      <Badge key={idx} variant="outline" className="text-xs">
                                        {kw}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </CardContent>
                          </CollapsibleContent>
                        </Card>
                      </Collapsible>
                    </AnimatedItem>
                  ))}
                </AnimatedList>
              )}

              {sortedEntries.length > 0 && sortedEntries.length === parsedLimit && (
                <div className="text-center py-4 text-sm text-muted-foreground">
                  Showing {sortedEntries.length} events. Increase limit to see more.
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
