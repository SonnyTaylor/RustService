/**
 * Reports Page Component
 *
 * View, search, sort, and manage saved service reports.
 * Reports are automatically saved when services complete.
 * Uses the shared ServiceReportView component for consistent styling.
 */

import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  FileText,
  Search,
  ArrowUpDown,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Trash2,
  Eye,
  Filter,
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import type { ServiceReport, ServiceRunStatus, ServiceDefinition } from '@/types/service';
import { ServiceReportView } from '@/components/service-report-view';

// =============================================================================
// Types
// =============================================================================

type ReportSortOption = 'newest' | 'oldest' | 'duration-desc' | 'duration-asc';
type ReportFilterStatus = 'all' | 'completed' | 'failed' | 'cancelled';

const SORT_OPTIONS: { value: ReportSortOption; label: string }[] = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'duration-desc', label: 'Longest Duration' },
  { value: 'duration-asc', label: 'Shortest Duration' },
];

// =============================================================================
// Helper Functions
// =============================================================================

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(ms?: number): string {
  if (!ms) return '—';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function getStatusInfo(status: ServiceRunStatus): { 
  label: string; 
  color: string; 
  icon: typeof CheckCircle2;
  bgColor: string;
} {
  switch (status) {
    case 'completed':
      return { 
        label: 'Completed', 
        color: 'text-green-500', 
        icon: CheckCircle2,
        bgColor: 'bg-green-500/10 border-green-500/20',
      };
    case 'failed':
      return { 
        label: 'Failed', 
        color: 'text-red-500', 
        icon: XCircle,
        bgColor: 'bg-red-500/10 border-red-500/20',
      };
    case 'cancelled':
      return { 
        label: 'Cancelled', 
        color: 'text-yellow-500', 
        icon: AlertCircle,
        bgColor: 'bg-yellow-500/10 border-yellow-500/20',
      };
    default:
      return { 
        label: 'Unknown', 
        color: 'text-muted-foreground', 
        icon: AlertCircle,
        bgColor: 'bg-muted/50',
      };
  }
}

function sortReports(reports: ServiceReport[], sortBy: ReportSortOption): ServiceReport[] {
  const sorted = [...reports];
  
  switch (sortBy) {
    case 'newest':
      return sorted.sort((a, b) => 
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      );
    case 'oldest':
      return sorted.sort((a, b) => 
        new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
      );
    case 'duration-desc':
      return sorted.sort((a, b) => 
        (b.totalDurationMs || 0) - (a.totalDurationMs || 0)
      );
    case 'duration-asc':
      return sorted.sort((a, b) => 
        (a.totalDurationMs || 0) - (b.totalDurationMs || 0)
      );
    default:
      return sorted;
  }
}

// =============================================================================
// Report Card Component
// =============================================================================

interface ReportCardProps {
  report: ServiceReport;
  onView: (report: ServiceReport) => void;
  onDelete: (reportId: string) => void;
}

function ReportCard({ report, onView, onDelete }: ReportCardProps) {
  const statusInfo = getStatusInfo(report.status);
  const StatusIcon = statusInfo.icon;
  const successCount = report.results.filter(r => r.success).length;
  const totalCount = report.results.length;

  return (
    <Card className="group hover:shadow-md transition-all duration-200 hover:border-primary/50">
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* Status Icon */}
          <div className={`p-3 rounded-xl border ${statusInfo.bgColor}`}>
            <StatusIcon className={`h-5 w-5 ${statusInfo.color}`} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold truncate">Service Report</h3>
              <Badge variant="outline" className={statusInfo.color}>
                {statusInfo.label}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(report.startedAt)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {formatTime(report.startedAt)}
              </span>
              <span className="flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" />
                {successCount}/{totalCount} passed
              </span>
              <span className="flex items-center gap-1">
                Duration: {formatDuration(report.totalDurationMs)}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onView(report)}
              className="gap-1"
            >
              <Eye className="h-4 w-4" />
              View
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(report.id)}
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Empty State Component
// =============================================================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-12">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
        <FileText className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <h3 className="text-lg font-semibold">No Reports Yet</h3>
        <p className="text-muted-foreground text-sm max-w-sm mt-1">
          Reports will appear here after you run services.
          Complete a service to generate your first report.
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function ReportsPage() {
  const [reports, setReports] = useState<ServiceReport[]>([]);
  const [definitions, setDefinitions] = useState<ServiceDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<ReportSortOption>('newest');
  const [filterStatus, setFilterStatus] = useState<ReportFilterStatus>('all');
  const [selectedReport, setSelectedReport] = useState<ServiceReport | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<string | null>(null);

  // Load reports and definitions
  useEffect(() => {
    async function loadData() {
      try {
        const [reportsList, defsList] = await Promise.all([
          invoke<ServiceReport[]>('list_service_reports'),
          invoke<ServiceDefinition[]>('get_service_definitions'),
        ]);
        setReports(reportsList);
        setDefinitions(defsList);
      } catch (e) {
        console.error('Failed to load data:', e);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  // Filter and sort reports
  const filteredReports = useMemo(() => {
    let result = reports;

    // Filter by status
    if (filterStatus !== 'all') {
      result = result.filter(r => r.status === filterStatus);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(r => 
        r.id.toLowerCase().includes(query) ||
        formatDate(r.startedAt).toLowerCase().includes(query) ||
        r.status.toLowerCase().includes(query)
      );
    }

    return sortReports(result, sortBy);
  }, [reports, searchQuery, sortBy, filterStatus]);

  // Handlers
  const handleViewReport = (report: ServiceReport) => {
    setSelectedReport(report);
  };

  const handleDeleteClick = (reportId: string) => {
    setReportToDelete(reportId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!reportToDelete) return;

    try {
      await invoke('delete_report', { reportId: reportToDelete });
      setReports(prev => prev.filter(r => r.id !== reportToDelete));
      if (selectedReport?.id === reportToDelete) {
        setSelectedReport(null);
      }
    } catch (e) {
      console.error('Failed to delete report:', e);
    } finally {
      setDeleteDialogOpen(false);
      setReportToDelete(null);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-muted-foreground">Loading reports...</span>
      </div>
    );
  }

  // Detail view - uses the shared ServiceReportView for 100% consistency
  if (selectedReport) {
    return (
      <>
        <ServiceReportView
          report={selectedReport}
          definitions={definitions}
          onBack={() => setSelectedReport(null)}
          headerTitle="Saved Report"
          backButtonLabel="Back to Reports"
          headerActions={
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleDeleteClick(selectedReport.id)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          }
        />
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Report?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this report. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b flex items-center gap-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Reports</h2>
          <Badge variant="secondary" className="ml-1">
            {reports.length}
          </Badge>
        </div>

        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search reports..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as ReportSortOption)}>
            <SelectTrigger className="w-44">
              <ArrowUpDown className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-4 py-2 border-b">
        <Tabs value={filterStatus} onValueChange={(v) => setFilterStatus(v as ReportFilterStatus)}>
          <TabsList>
            <TabsTrigger value="all" className="gap-1">
              <Filter className="h-3.5 w-3.5" />
              All
            </TabsTrigger>
            <TabsTrigger value="completed" className="gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Completed
            </TabsTrigger>
            <TabsTrigger value="failed" className="gap-1">
              <XCircle className="h-3.5 w-3.5" />
              Failed
            </TabsTrigger>
            <TabsTrigger value="cancelled" className="gap-1">
              <AlertCircle className="h-3.5 w-3.5" />
              Cancelled
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        {reports.length === 0 ? (
          <EmptyState />
        ) : filteredReports.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <Search className="h-8 w-8 mb-2" />
            <p>No reports match your search</p>
          </div>
        ) : (
          <div className="p-4 flex flex-col gap-3">
            {filteredReports.map(report => (
              <ReportCard
                key={report.id}
                report={report}
                onView={handleViewReport}
                onDelete={handleDeleteClick}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Report?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this report. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
