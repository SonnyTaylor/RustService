/**
 * Service Report View Component
 *
 * Shared component for displaying service report results.
 * Used by both ServicePage (after service completion) and ReportsPage (viewing saved reports).
 * Includes findings view, technician printout, and customer printout tabs.
 */

import { useRef, useState, useEffect } from 'react';
import { useReactToPrint } from 'react-to-print';
import { invoke } from '@tauri-apps/api/core';
import {
  Wrench,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  FileText,
  Printer,
  Users,
  Bot,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';

import type {
  ServiceReport,
  ServiceDefinition,
} from '@/types/service';
import { useSettings } from '@/components/settings-context';
import { isAiConfigured, aiSummarizeReport } from '@/lib/ai-features';
import { PrintableReport } from '@/components/service-report/PrintableReport';
import { FindingsContent } from '@/components/service-report/FindingsContent';

// =============================================================================
// Main Service Report View Component
// =============================================================================

export interface ServiceReportViewProps {
  report: ServiceReport;
  definitions: ServiceDefinition[];
  onBack: () => void;
  /** Optional: Show "New Service" button with this callback */
  onNewService?: () => void;
  /** Optional: Custom header title (defaults to "Service Complete") */
  headerTitle?: string;
  /** Optional: Custom back button label (defaults to "Back to Presets") */
  backButtonLabel?: string;
  /** Optional: Additional action buttons for the header */
  headerActions?: React.ReactNode;
}

export function ServiceReportView({
  report,
  definitions,
  onBack,
  onNewService,
  headerTitle = 'Service Complete',
  backButtonLabel = 'Back to Presets',
  headerActions,
}: ServiceReportViewProps) {
  const { settings } = useSettings();
  const definitionMap = new Map(definitions.map((d) => [d.id, d]));
  const printDetailedRef = useRef<HTMLDivElement>(null);
  const printCustomerRef = useRef<HTMLDivElement>(null);

  // AI Summary state
  const [localReport, setLocalReport] = useState(report);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiSummaryError, setAiSummaryError] = useState<string | null>(null);

  // Keep localReport in sync with prop changes
  useEffect(() => {
    setLocalReport(report);
  }, [report]);

  const handleGenerateAiSummary = async () => {
    if (!isAiConfigured(settings.agent)) {
      setAiSummaryError('AI not configured. Set up a provider in Settings \u2192 AI Agent.');
      return;
    }
    setAiSummaryLoading(true);
    setAiSummaryError(null);

    try {
      const result = await aiSummarizeReport(localReport, definitions, settings.agent);

      // Persist to backend
      await invoke('set_report_summary', { report_id: localReport.id, summary: result.summary });
      await invoke('set_report_health_score', { report_id: localReport.id, score: result.healthScore });

      // Update local state (immutable)
      setLocalReport((prev) => ({
        ...prev,
        agentSummary: result.summary,
        healthScore: result.healthScore,
      }));
    } catch (e) {
      setAiSummaryError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiSummaryLoading(false);
    }
  };

  const handlePrintDetailed = useReactToPrint({
    contentRef: printDetailedRef,
    documentTitle: `Service Report - ${new Date(localReport.startedAt).toLocaleDateString()}`,
  });

  const handlePrintCustomer = useReactToPrint({
    contentRef: printCustomerRef,
    documentTitle: `System Health Report - ${new Date(localReport.startedAt).toLocaleDateString()}`,
  });

  const totalDuration = localReport.totalDurationMs ? (localReport.totalDurationMs / 1000).toFixed(1) : '?';
  const successCount = localReport.results.filter((r) => r.success).length;
  const totalCount = localReport.results.length;

  return (
    <div className="h-full flex flex-col">
      {/* Compact Header with Inline Tabs */}
      <Tabs defaultValue="findings" className="flex-1 flex flex-col min-h-0">
        <div className="px-4 py-2 flex items-center gap-3 border-b">
          <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0 h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            {localReport.status === 'completed' ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-red-500" />
            )}
            <span className="font-semibold">{headerTitle}</span>
            {localReport.agentInitiated && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-500 flex items-center gap-1">
                <Bot className="h-3 w-3" /> Agent
              </span>
            )}
            {localReport.parallelMode && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400">
                Parallel
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {successCount}/{totalCount} in {totalDuration}s
            </span>
          </div>

          <TabsList className="ml-4 h-8">
            <TabsTrigger value="findings" className="gap-1.5 text-xs h-7 px-2.5">
              <FileText className="h-3.5 w-3.5" />
              Findings
            </TabsTrigger>
            <TabsTrigger value="printout" className="gap-1.5 text-xs h-7 px-2.5">
              <Printer className="h-3.5 w-3.5" />
              Printout
            </TabsTrigger>
            <TabsTrigger value="customer" className="gap-1.5 text-xs h-7 px-2.5">
              <Users className="h-3.5 w-3.5" />
              Customer Print
            </TabsTrigger>
          </TabsList>

          <div className="ml-auto flex items-center gap-2">
            {headerActions}
            {onNewService && (
              <Button size="sm" onClick={onNewService} className="gap-1.5 h-8">
                <Wrench className="h-3.5 w-3.5" />
                New Service
              </Button>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0">
          <TabsContent value="findings" className="h-full mt-0 data-[state=active]:flex flex-col">
              <ScrollArea className="flex-1 min-h-0 px-4 py-4">
              <FindingsContent
                report={localReport}
                definitions={definitions}
                definitionMap={definitionMap}
                aiSummaryLoading={aiSummaryLoading}
                aiSummaryError={aiSummaryError}
                onGenerateAiSummary={handleGenerateAiSummary}
              />
            </ScrollArea>
          </TabsContent>

          <TabsContent value="printout" className="h-full mt-0 data-[state=active]:flex flex-col overflow-hidden">
            <div className="px-6 py-4 flex items-center justify-between border-b flex-shrink-0">
              <p className="text-muted-foreground text-sm">
                Technical report with all details. Print or save as PDF.
              </p>
              <Button onClick={() => handlePrintDetailed()} className="gap-2">
                <Printer className="h-4 w-4" />
                Print Report
              </Button>
            </div>
            <div className="flex-1 overflow-auto bg-[repeating-linear-gradient(45deg,var(--muted)_0,var(--muted)_1px,transparent_0,transparent_50%)] bg-[length:10px_10px] bg-muted/30">
              <div className="flex justify-center p-8 min-h-full">
                <div
                  ref={printDetailedRef}
                  data-print-content
                  className="bg-white shadow-[0_4px_60px_rgba(0,0,0,0.3)] w-[550px] flex-shrink-0"
                >
                  <PrintableReport report={localReport} definitions={definitions} variant="detailed" />
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="customer" className="h-full mt-0 data-[state=active]:flex flex-col overflow-hidden">
            <div className="px-6 py-4 flex items-center justify-between border-b flex-shrink-0">
              <p className="text-muted-foreground text-sm">
                Simplified report for customers. Easy to understand with key findings only.
              </p>
              <Button onClick={() => handlePrintCustomer()} className="gap-2">
                <Printer className="h-4 w-4" />
                Print for Customer
              </Button>
            </div>
            <div className="flex-1 overflow-auto bg-[repeating-linear-gradient(45deg,var(--muted)_0,var(--muted)_1px,transparent_0,transparent_50%)] bg-[length:10px_10px] bg-muted/30">
              <div className="flex justify-center p-8 min-h-full">
                <div
                  ref={printCustomerRef}
                  data-print-content
                  className="bg-white shadow-[0_4px_60px_rgba(0,0,0,0.3)] w-[550px] flex-shrink-0"
                >
                  <PrintableReport
                    report={localReport}
                    definitions={definitions}
                    variant="customer"
                    businessSettings={settings.business}
                  />
                </div>
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>

      {/* Bottom Action Bar */}
      <div className="px-4 py-2 border-t bg-muted/30">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          {backButtonLabel}
        </Button>
      </div>
    </div>
  );
}
