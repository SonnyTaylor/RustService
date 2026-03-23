/**
 * Bluescreen (BSOD) Analysis Page
 *
 * View and analyze Windows crash dumps.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Skull,
  RefreshCw,
  AlertCircle,
  Loader2,
  FileWarning,
  ChevronDown,
  ChevronUp,
  Clock,
  HardDrive,
  Cpu,
  Trash2,
  Copy,
  CheckCircle2,
  Lightbulb,
  AlertTriangle,
  Search,
  ArrowUpDown,
  Calendar,
  Check,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
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
} from '@/components/ui/alert-dialog';
import { AnimatedList, AnimatedItem } from '@/components/animation-context';

import type { BsodEntry, BsodDetails, BsodStats } from '@/types';
import { formatCrashTime, formatDumpSize, getStopCodeCategory } from '@/types/bluescreen';

/** Get days since crash */
function getDaysSinceCrash(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return `${diffDays} days ago`;
  } catch {
    return '';
  }
}

/** Get border color class for a stop code category */
function getCategoryBorderClass(category: string): string {
  switch (category) {
    case 'Driver':
      return 'border-l-4 border-l-yellow-500';
    case 'Memory':
      return 'border-l-4 border-l-destructive';
    case 'Hardware':
      return 'border-l-4 border-l-orange-500';
    case 'Graphics':
      return 'border-l-4 border-l-purple-500';
    case 'System':
      return 'border-l-4 border-l-blue-500';
    default:
      return 'border-l-4 border-l-muted-foreground';
  }
}

/** Get badge variant/class for a stop code category */
function getCategoryBadgeClass(category: string): string {
  switch (category) {
    case 'Driver':
      return 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30';
    case 'Memory':
      return 'bg-destructive/15 text-destructive border-destructive/30';
    case 'Hardware':
      return 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30';
    case 'Graphics':
      return 'bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30';
    case 'System':
      return 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30';
    default:
      return 'bg-muted text-muted-foreground border-muted-foreground/30';
  }
}

/**
 * Bluescreen Analysis Page - Main component
 */
export function BluescreenPage() {
  const [entries, setEntries] = useState<BsodEntry[]>([]);
  const [stats, setStats] = useState<BsodStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Expanded entry and details
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [details, setDetails] = useState<BsodDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Delete state
  const [deleteEntry, setDeleteEntry] = useState<BsodEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Copy feedback state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [timeRange, setTimeRange] = useState('all');
  const [sortOrder, setSortOrder] = useState('newest');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [history, statsResult] = await Promise.all([
        invoke<BsodEntry[]>('get_bsod_history'),
        invoke<BsodStats>('get_bsod_stats'),
      ]);
      setEntries(history);
      setStats(statsResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered and sorted entries
  const filteredEntries = useMemo(() => {
    let result = [...entries];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter((entry) => {
        const stopCode = (entry.stopCode || '').toLowerCase();
        const stopCodeName = (entry.stopCodeName || '').toLowerCase();
        const faultingModule = (entry.faultingModule || '').toLowerCase();
        return (
          stopCode.includes(query) ||
          stopCodeName.includes(query) ||
          faultingModule.includes(query)
        );
      });
    }

    // Time range filter
    if (timeRange !== 'all') {
      const now = new Date();
      let cutoff: Date;
      switch (timeRange) {
        case '7d':
          cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        default:
          cutoff = new Date(0);
      }
      result = result.filter((entry) => {
        try {
          return new Date(entry.crashTime) >= cutoff;
        } catch {
          return true;
        }
      });
    }

    // Sort
    result.sort((a, b) => {
      try {
        const dateA = new Date(a.crashTime).getTime();
        const dateB = new Date(b.crashTime).getTime();
        return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
      } catch {
        return 0;
      }
    });

    return result;
  }, [entries, searchQuery, timeRange, sortOrder]);

  const hasActiveFilters = searchQuery.trim() !== '' || timeRange !== 'all';

  const loadDetails = async (dumpPath: string) => {
    setLoadingDetails(true);
    try {
      const result = await invoke<BsodDetails>('get_bsod_details', { dumpPath });
      setDetails(result);
    } catch (err) {
      console.error('Failed to load details:', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleExpand = (entry: BsodEntry) => {
    if (expandedEntry === entry.id) {
      setExpandedEntry(null);
      setDetails(null);
    } else {
      setExpandedEntry(entry.id);
      loadDetails(entry.dumpPath);
    }
  };

  const handleDelete = async () => {
    if (!deleteEntry) return;
    setDeleting(true);
    try {
      await invoke('delete_crash_dump', { dumpPath: deleteEntry.dumpPath });
      setEntries(prev => prev.filter(e => e.id !== deleteEntry.id));
    } catch (err) {
      console.error('Failed to delete dump:', err);
    } finally {
      setDeleting(false);
      setDeleteEntry(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const copyCrashReport = (entry: BsodEntry) => {
    const report = [
      'BSOD Crash Report',
      `Stop Code: ${entry.stopCodeName || entry.stopCode}`,
      `Bug Check: ${entry.bugCheckCode}`,
      `Module: ${entry.faultingModule || 'Unknown'}`,
      `Time: ${formatCrashTime(entry.crashTime)}`,
      `Dump: ${entry.dumpPath}`,
    ].join('\n');

    navigator.clipboard.writeText(report);
    setCopiedId(entry.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden min-h-0">
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Skull className="h-6 w-6" />
                Bluescreen Analysis
              </h2>
              <p className="text-muted-foreground text-sm mt-1">
                View and analyze Windows crash dumps (BSOD)
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Stats Cards */}
          {stats && (
            <div className="space-y-4">
              {/* First row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold">
                      {stats.totalCrashes}
                    </div>
                    <div className="text-xs text-muted-foreground">Total Crashes</div>
                  </CardContent>
                </Card>
                <Card className={stats.crashesLast7Days > 2 ? 'border-destructive' : ''}>
                  <CardContent className="pt-4">
                    <div className={`text-2xl font-bold ${
                      stats.crashesLast7Days > 2 ? 'text-destructive' :
                      stats.crashesLast7Days > 0 ? 'text-yellow-500' : 'text-green-500'
                    }`}>
                      {stats.crashesLast7Days}
                    </div>
                    <div className="text-xs text-muted-foreground">Last 7 Days</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-2xl font-bold">
                      {stats.crashesLast30Days}
                    </div>
                    <div className="text-xs text-muted-foreground">Last 30 Days</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-sm font-medium truncate">
                      {stats.mostCommonStopCode || 'N/A'}
                    </div>
                    <div className="text-xs text-muted-foreground">Most Common</div>
                  </CardContent>
                </Card>
              </div>

              {/* Second row */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-muted-foreground" />
                      <div className="text-sm font-medium truncate">
                        {stats.mostCommonModule || 'N/A'}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Most Common Module</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <div className="text-sm font-medium truncate">
                        {stats.oldestCrash && stats.newestCrash
                          ? `${formatCrashTime(stats.oldestCrash)} \u2192 ${formatCrashTime(stats.newestCrash)}`
                          : 'N/A'}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Crash Date Range</div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* Warning for frequent crashes */}
          {stats && stats.crashesLast7Days >= 3 && (
            <Card className="border-destructive bg-destructive/10">
              <CardContent className="py-4 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium text-destructive">Frequent Crashes Detected</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {stats.crashesLast7Days} crashes in the last 7 days indicates a serious system issue.
                    Consider running memory diagnostics and checking for driver updates.
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

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

          {/* Filter Bar */}
          {!loading && entries.length > 0 && (
            <Card>
              <CardContent className="py-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search stop code, name, or module..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={timeRange} onValueChange={setTimeRange}>
                    <SelectTrigger className="w-full sm:w-[160px]">
                      <Clock className="h-4 w-4 mr-2 text-muted-foreground" />
                      <SelectValue placeholder="Time range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="7d">Last 7 Days</SelectItem>
                      <SelectItem value="30d">Last 30 Days</SelectItem>
                      <SelectItem value="90d">Last 90 Days</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={sortOrder} onValueChange={setSortOrder}>
                    <SelectTrigger className="w-full sm:w-[160px]">
                      <ArrowUpDown className="h-4 w-4 mr-2 text-muted-foreground" />
                      <SelectValue placeholder="Sort order" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Newest First</SelectItem>
                      <SelectItem value="oldest">Oldest First</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Result Count */}
          {!loading && entries.length > 0 && (
            <div className="text-sm text-muted-foreground">
              Showing {filteredEntries.length} of {entries.length} crashes
            </div>
          )}

          {/* Crash List */}
          {!loading && (
            <>
              {entries.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                    <div className="text-lg font-medium">No Crashes Found</div>
                    <div className="text-muted-foreground mt-1">
                      No crash dumps found in C:\Windows\Minidump — system running stably
                    </div>
                  </CardContent>
                </Card>
              ) : filteredEntries.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <div className="text-lg font-medium">No Matching Crashes</div>
                    <div className="text-muted-foreground mt-1">
                      No crashes match your current filters — try adjusting your search or time range
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <AnimatedList className="space-y-2">
                  {filteredEntries.map((entry) => {
                    const category = getStopCodeCategory(entry.stopCodeName);
                    const borderClass = getCategoryBorderClass(category);
                    const isCopied = copiedId === entry.id;

                    return (
                      <AnimatedItem key={entry.id}>
                        <Collapsible
                          open={expandedEntry === entry.id}
                          onOpenChange={() => handleExpand(entry)}
                        >
                          <Card className={borderClass}>
                            <CollapsibleTrigger asChild>
                              <CardContent className="py-4 cursor-pointer hover:bg-muted/50">
                                <div className="flex items-start gap-4">
                                  <Skull className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <Badge variant="destructive">
                                        {entry.stopCodeName || entry.stopCode}
                                      </Badge>
                                      <Badge
                                        variant="outline"
                                        className={getCategoryBadgeClass(category)}
                                      >
                                        {category}
                                      </Badge>
                                      {entry.faultingModule && (
                                        <Badge variant="outline">
                                          <Cpu className="h-3 w-3 mr-1" />
                                          {entry.faultingModule}
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                                      <div className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        <span>{formatCrashTime(entry.crashTime)}</span>
                                        <span>({getDaysSinceCrash(entry.crashTime)})</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <HardDrive className="h-3 w-3" />
                                        <span>{formatDumpSize(entry.fileSizeBytes)}</span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      title="Copy crash report"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        copyCrashReport(entry);
                                      }}
                                    >
                                      {isCopied ? (
                                        <Check className="h-4 w-4 text-green-500" />
                                      ) : (
                                        <Copy className="h-4 w-4" />
                                      )}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:text-destructive"
                                      title="Delete crash dump"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteEntry(entry);
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                    {expandedEntry === entry.id ? (
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
                              <CardContent className="py-4 space-y-4">
                                {loadingDetails ? (
                                  <div className="flex items-center justify-center py-8">
                                    <Loader2 className="h-6 w-6 animate-spin" />
                                  </div>
                                ) : details && details.dumpPath === entry.dumpPath ? (
                                  <>
                                    {/* Crash Info Grid */}
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                                      <div>
                                        <span className="text-xs text-muted-foreground">Stop Code</span>
                                        <div className="font-mono">{details.stopCode}</div>
                                      </div>
                                      <div>
                                        <span className="text-xs text-muted-foreground">Dump Type</span>
                                        <div>{details.dumpType}</div>
                                      </div>
                                      <div>
                                        <span className="text-xs text-muted-foreground">Crash Time</span>
                                        <div>{formatCrashTime(details.crashTime)}</div>
                                      </div>
                                      {details.faultingModule && (
                                        <div className="col-span-2">
                                          <span className="text-xs text-muted-foreground">Faulting Module</span>
                                          <div className="font-mono">{details.faultingModule}</div>
                                        </div>
                                      )}
                                    </div>

                                    {/* Stop Code Description */}
                                    {details.stopCodeDescription && (
                                      <div>
                                        <span className="text-xs text-muted-foreground">Description</span>
                                        <div className="text-sm mt-1 p-3 bg-muted rounded-lg">
                                          {details.stopCodeDescription}
                                        </div>
                                      </div>
                                    )}

                                    {/* Possible Causes */}
                                    {details.possibleCauses.length > 0 && (
                                      <div>
                                        <span className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                                          <AlertCircle className="h-3 w-3" />
                                          Possible Causes
                                        </span>
                                        <ul className="list-disc list-inside space-y-1 text-sm">
                                          {details.possibleCauses.map((cause, idx) => (
                                            <li key={idx}>{cause}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}

                                    {/* Recommendations */}
                                    {details.recommendations.length > 0 && (
                                      <div>
                                        <span className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                                          <Lightbulb className="h-3 w-3" />
                                          Recommendations
                                        </span>
                                        <ul className="list-disc list-inside space-y-1 text-sm">
                                          {details.recommendations.map((rec, idx) => (
                                            <li key={idx}>{rec}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}

                                    {/* Dump Path */}
                                    <div>
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs text-muted-foreground">Dump File Path</span>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 px-2"
                                          onClick={() => copyToClipboard(details.dumpPath)}
                                        >
                                          <Copy className="h-3 w-3 mr-1" />
                                          Copy
                                        </Button>
                                      </div>
                                      <code className="text-xs bg-muted p-2 rounded block overflow-x-auto">
                                        {details.dumpPath}
                                      </code>
                                    </div>
                                  </>
                                ) : (
                                  <div className="text-center text-muted-foreground py-4">
                                    Click to load details
                                  </div>
                                )}
                              </CardContent>
                            </CollapsibleContent>
                          </Card>
                        </Collapsible>
                      </AnimatedItem>
                    );
                  })}
                </AnimatedList>
              )}
            </>
          )}

          {/* Info Card */}
          <Card className="bg-muted/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileWarning className="h-4 w-4" />
                About Crash Dumps
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                Windows creates crash dumps when a BSOD occurs. These files are stored in{' '}
                <code className="bg-muted px-1 rounded">C:\Windows\Minidump</code>.
              </p>
              <p>
                <strong>Minidumps</strong> contain limited information and are typically 256KB-2MB.
              </p>
              <p>
                <strong>Full memory dumps</strong> (MEMORY.DMP) contain all system memory and can be very large.
              </p>
              <p>
                For detailed analysis, use <strong>WinDbg</strong> or upload dumps to the Windows debugger.
              </p>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteEntry !== null} onOpenChange={() => setDeleteEntry(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Crash Dump</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this crash dump file?
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
