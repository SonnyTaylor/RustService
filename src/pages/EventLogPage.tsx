/**
 * Event Log Viewer Page
 * 
 * View and filter Windows Event Logs.
 */

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  ScrollText,
  RefreshCw,
  Search,
  AlertCircle,
  AlertTriangle,
  Info,
  XCircle,
  Loader2,
  Filter,
  ChevronDown,
  ChevronUp,
  Copy,
  Clock,
  BarChart3,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

import type { EventLogSource, EventLogEntry, EventLogFilter, EventLogStats } from '@/types';

/** Get level icon */
function LevelIcon({ level }: { level: string }) {
  const l = level.toLowerCase();
  if (l === 'critical') return <XCircle className="h-4 w-4 text-red-600" />;
  if (l === 'error') return <AlertCircle className="h-4 w-4 text-destructive" />;
  if (l === 'warning') return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
  if (l === 'information') return <Info className="h-4 w-4 text-blue-500" />;
  return <Info className="h-4 w-4 text-muted-foreground" />;
}

/** Get level badge variant */
function getLevelBadgeVariant(level: string): 'destructive' | 'default' | 'secondary' {
  const l = level.toLowerCase();
  if (l === 'critical' || l === 'error') return 'destructive';
  if (l === 'warning') return 'default';
  return 'secondary';
}

/** Format timestamp */
function formatTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString();
  } catch {
    return isoString;
  }
}

/** Format relative time */
function formatRelativeTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return 'Just now';
  } catch {
    return '';
  }
}

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

  // Expanded entry
  const [expandedEntry, setExpandedEntry] = useState<number | null>(null);

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
  }, [selectedLog, levelFilter, limit]);

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
        limit: parseInt(limit) || 100,
      };
      const result = await invoke<EventLogEntry[]>('get_event_logs', { filter });
      setEntries(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingEntries(false);
    }
  }, [selectedLog, levelFilter, limit]);

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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden min-h-0">
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-6 space-y-6">
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
            <Button variant="outline" size="sm" onClick={loadEntries} disabled={loadingEntries}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loadingEntries ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Stats Cards */}
          {stats && (
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
                      placeholder="Search in messages..."
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
              {entries.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No events found matching your criteria
                  </CardContent>
                </Card>
              ) : (
                entries.map((entry) => (
                  <Collapsible
                    key={entry.recordId}
                    open={expandedEntry === entry.recordId}
                    onOpenChange={(open) => setExpandedEntry(open ? entry.recordId : null)}
                  >
                    <Card className={`transition-colors ${
                      entry.levelDisplay.toLowerCase() === 'critical' || 
                      entry.levelDisplay.toLowerCase() === 'error' 
                        ? 'border-l-2 border-l-destructive bg-destructive/5' 
                        : entry.levelDisplay.toLowerCase() === 'warning'
                          ? 'border-l-2 border-l-yellow-500 bg-yellow-500/5'
                          : ''
                    }`}>
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
                                onClick={() => copyToClipboard(entry.message)}
                              >
                                <Copy className="h-3 w-3 mr-1" />
                                Copy
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
                ))
              )}

              {entries.length > 0 && entries.length === parseInt(limit) && (
                <div className="text-center py-4 text-sm text-muted-foreground">
                  Showing {entries.length} events. Increase limit to see more.
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
