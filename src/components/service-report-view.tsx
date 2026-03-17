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
  AlertTriangle,
  Info,
  FileText,
  Printer,
  Users,
  ChevronRight,
  Bot,
  Heart,
  Sparkles,
  Loader2,
  RefreshCw,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';

import type {
  ServiceReport,
  ServiceDefinition,
  FindingSeverity,
} from '@/types/service';
import type { BusinessSettings } from '@/types/settings';
import { getServiceRenderer, ServiceCardWrapper } from '@/components/service-renderers';
import { getIcon } from '@/components/service/utils';
import { useSettings } from '@/components/settings-context';
import { isAiConfigured, aiSummarizeReport } from '@/lib/ai-features';

// =============================================================================
// Printable Report Component
// =============================================================================

interface PrintableReportProps {
  report: ServiceReport;
  definitions: ServiceDefinition[];
  variant: 'detailed' | 'customer';
  businessSettings?: BusinessSettings;
}

const PrintableReport = ({ report, definitions, variant, businessSettings }: PrintableReportProps) => {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const definitionMap = new Map(definitions.map((d) => [d.id, d]));

  // Load business logo
  useEffect(() => {
    if (businessSettings?.logoPath) {
      invoke<string | null>('get_business_logo', { logoPath: businessSettings.logoPath })
        .then(url => setLogoUrl(url))
        .catch(() => setLogoUrl(null));
    } else {
      setLogoUrl(null);
    }
  }, [businessSettings?.logoPath]);

  const totalDuration = report.totalDurationMs ? (report.totalDurationMs / 1000).toFixed(1) : '?';
  const successCount = report.results.filter((r) => r.success).length;
  const totalCount = report.results.length;

  // Get hostname for customer print
  const hostname = typeof window !== 'undefined' ? 'DESKTOP' : 'DEVICE';

  // Group findings by category
  const findingsByCategory = report.results.reduce((acc, result) => {
    const def = definitionMap.get(result.serviceId);
    const category = def?.category || 'other';
    if (!acc[category]) acc[category] = [];
    acc[category].push({ result, definition: def });
    return acc;
  }, {} as Record<string, { result: typeof report.results[0]; definition: ServiceDefinition | undefined }[]>);

  const categoryLabels: Record<string, string> = {
    diagnostics: 'Diagnostics',
    cleanup: 'Cleanup',
    security: 'Security',
    maintenance: 'Maintenance',
    other: 'Other',
  };

  if (variant === 'customer') {
    const hasBusiness = businessSettings?.enabled && businessSettings?.name;
    const businessName = businessSettings?.name || 'RustService';
    
    return (
      <div className="bg-white text-gray-800 p-8 min-h-[800px]" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        {/* Header with Business Branding */}
        <div className="flex justify-between items-start mb-6">
          <div className="flex items-start gap-4">
            {/* Business Logo */}
            {hasBusiness && (
              <div className="w-16 h-16 rounded-full flex items-center justify-center shrink-0 overflow-hidden">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={businessName}
                    className="w-full h-full object-contain"
                    onError={() => setLogoUrl(null)}
                  />
                ) : (
                  <div className="w-full h-full bg-blue-600 flex items-center justify-center text-white text-2xl font-bold">
                    {businessName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{businessName}</h1>
              {hasBusiness && businessSettings?.address && (
                <p className="text-sm text-gray-600">{businessSettings.address}</p>
              )}
              {hasBusiness && (businessSettings?.phone || businessSettings?.email) && (
                <p className="text-sm text-gray-500">
                  {businessSettings.phone && <span>{businessSettings.phone}</span>}
                  {businessSettings.phone && businessSettings.email && <span> • </span>}
                  {businessSettings.email && <span>{businessSettings.email}</span>}
                </p>
              )}
              {hasBusiness && businessSettings?.website && (
                <p className="text-sm text-blue-600">{businessSettings.website}</p>
              )}
              {hasBusiness && (businessSettings?.abn || businessSettings?.tfn) && (
                <p className="text-xs text-gray-400 mt-1">
                  {businessSettings.abn && <span>ABN: {businessSettings.abn}</span>}
                  {businessSettings.abn && businessSettings.tfn && <span> | </span>}
                  {businessSettings.tfn && <span>TFN: {businessSettings.tfn}</span>}
                </p>
              )}
              {!hasBusiness && (
                <p className="text-sm text-blue-600 tracking-wide uppercase">Customer Service Summary</p>
              )}
            </div>
          </div>
          
          {/* Service Details Box */}
          <div className="text-right p-4 border border-gray-200 rounded-lg bg-gray-50 min-w-[180px]">
            <p className="text-sm font-semibold text-gray-700 mb-2">Service Details</p>
            {report.technicianName && (
              <p className="text-sm text-gray-600">
                <span className="text-gray-400">Technician:</span> {report.technicianName}
              </p>
            )}
            {report.customerName && (
              <p className="text-sm text-gray-600">
                <span className="text-gray-400">Customer:</span> {report.customerName}
              </p>
            )}
            <p className="text-sm text-gray-500">
              <span className="text-gray-400">Device:</span> {hostname}
            </p>
            <p className="text-sm text-gray-500">
              <span className="text-gray-400">Date:</span> {new Date(report.startedAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-gray-200 mb-6" />

        {/* Status Row */}
        <div className="flex items-center justify-between mb-4">
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
            successCount === totalCount 
              ? 'bg-green-50 text-green-700 border border-green-200' 
              : 'bg-yellow-50 text-yellow-700 border border-yellow-200'
          }`}>
            <span>{successCount === totalCount ? '✓' : '⚠'}</span>
            {successCount === totalCount ? 'All Tasks Successful' : 'Attention Required'}
          </div>
          <p className="text-sm text-gray-500">
            {totalCount} tasks • {totalDuration}s
          </p>
        </div>

        {/* Description */}
        <p className="text-gray-500 text-sm mb-6">
          Here's a concise overview of the maintenance and diagnostics completed during your visit.
        </p>

        {/* Results by Category */}
        {Object.entries(findingsByCategory).map(([category, items]) => (
          <div key={category} className="mb-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3">
              {categoryLabels[category] || category}
            </h2>
            <div className="space-y-3">
              {items.map(({ result, definition }) => {
                const CustomRenderer = getServiceRenderer(result.serviceId);

                // Use custom customer renderer if available
                if (CustomRenderer && definition) {
                  return (
                    <CustomRenderer
                      key={result.serviceId}
                      result={result}
                      definition={definition}
                      variant="customer"
                    />
                  );
                }

                // Fallback to generic renderer
                const mainFinding = result.findings[0];
                const Icon = definition ? getIcon(definition.icon) : Wrench;
                
                return (
                  <div 
                    key={result.serviceId} 
                    className="p-4 border border-gray-200 rounded-lg bg-white"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-gray-100 text-gray-500">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-blue-600 uppercase tracking-wide font-medium">
                          {definition?.name || result.serviceId}
                        </p>
                        {mainFinding && (
                          <>
                            <p className="text-xl font-bold text-gray-900">
                              {mainFinding.title}
                            </p>
                            <p className="text-sm text-gray-500">
                              {mainFinding.description}
                            </p>
                          </>
                        )}
                        {result.findings.length > 1 && (
                          <ul className="mt-2 space-y-1">
                            {result.findings.slice(1).map((f, idx) => (
                              <li key={idx} className="text-sm text-gray-600 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                                {f.title}
                              </li>
                            ))}
                          </ul>
                        )}
                        {result.error && (
                          <p className="text-sm text-red-600 mt-1">Error: {result.error}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-gray-200 text-center text-gray-400 text-xs">
          Report generated by RustService
        </div>
      </div>
    );
  }

  // Detailed variant
  return (
    <div className="bg-white text-black p-8 min-h-[800px]" style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* Header */}
      <div className="text-center mb-6 pb-4 border-b-2 border-gray-200">
        <h1 className="text-2xl font-bold text-gray-800">Service Report</h1>
        <p className="text-gray-500 text-sm">{new Date(report.startedAt).toLocaleString()}</p>
      </div>

      {/* Summary Box */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-gray-800">{totalCount}</p>
            <p className="text-xs text-gray-500 uppercase">Services Run</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-600">{successCount}</p>
            <p className="text-xs text-gray-500 uppercase">Successful</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-800">{totalDuration}s</p>
            <p className="text-xs text-gray-500 uppercase">Duration</p>
          </div>
        </div>
      </div>

      {/* Service Results */}
      {report.results.map((result) => {
        const def = definitionMap.get(result.serviceId);
        return (
          <div key={result.serviceId} className="mb-6">
            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-200">
              <span className={result.success ? 'text-green-500' : 'text-red-500'}>
                {result.success ? '✓' : '✗'}
              </span>
              <h3 className="font-bold text-gray-800">{def?.name || result.serviceId}</h3>
              <span className="text-gray-400 text-sm ml-auto">
                {(result.durationMs / 1000).toFixed(1)}s
              </span>
            </div>
            {result.findings.map((finding, idx) => (
              <div key={idx} className="ml-6 mb-2 text-sm">
                <p className="text-gray-700">
                  <span className="font-medium">[{finding.severity.toUpperCase()}]</span>{' '}
                  {finding.title}
                </p>
                <p className="text-gray-500 ml-4">{finding.description}</p>
              </div>
            ))}
            {result.error && (
              <div className="ml-6 text-red-600 text-sm">Error: {result.error}</div>
            )}
          </div>
        );
      })}

      {/* Footer */}
      <div className="mt-8 pt-4 border-t border-gray-200 text-center text-gray-400 text-sm">
        <p>RustService Report • {report.id}</p>
      </div>
    </div>
  );
};

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

      // Update local state
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

  const severityIcons: Record<FindingSeverity, React.ComponentType<{ className?: string }>> = {
    info: Info,
    success: CheckCircle2,
    warning: AlertTriangle,
    error: XCircle,
    critical: XCircle,
  };

  const severityColors: Record<FindingSeverity, string> = {
    info: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
    success: 'text-green-500 bg-green-500/10 border-green-500/20',
    warning: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
    error: 'text-red-500 bg-red-500/10 border-red-500/20',
    critical: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
  };

  const allFindings = localReport.results.flatMap((r) =>
    r.findings.map((f) => ({
      ...f,
      serviceId: r.serviceId,
      serviceName: definitionMap.get(r.serviceId)?.name || r.serviceId,
    }))
  );

  const majorFindings = allFindings.filter(
    (f) => f.severity === 'warning' || f.severity === 'error' || f.severity === 'critical'
  );

  const totalDuration = localReport.totalDurationMs ? (localReport.totalDurationMs / 1000).toFixed(1) : '?';
  const successCount = localReport.results.filter((r) => r.success).length;
  const totalCount = localReport.results.length;

  // Findings tab content
  const FindingsContent = () => (
    <div className="space-y-3">
      {/* Summary Card */}
      <Card className="bg-gradient-to-br from-card to-muted/30 border-2">
        <CardContent className="pt-4">
          <div className={`grid gap-4 text-center ${localReport.healthScore != null ? 'grid-cols-5' : 'grid-cols-4'}`}>
            <div>
              <p className="text-3xl font-bold">{totalCount}</p>
              <p className="text-sm text-muted-foreground">Services</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-green-500">{successCount}</p>
              <p className="text-sm text-muted-foreground">Passed</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-yellow-500">{majorFindings.length}</p>
              <p className="text-sm text-muted-foreground">Attention</p>
            </div>
            <div>
              <p className="text-3xl font-bold">{totalDuration}s</p>
              <p className="text-sm text-muted-foreground">Duration</p>
            </div>
            {localReport.healthScore != null && (
              <div>
                <p className={`text-3xl font-bold ${
                  localReport.healthScore >= 80 ? 'text-green-500' :
                  localReport.healthScore >= 50 ? 'text-yellow-500' : 'text-red-500'
                }`}>
                  {localReport.healthScore}
                </p>
                <p className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                  <Heart className="h-3 w-3" /> Health
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Agent Summary / AI Summary Generator */}
      {localReport.agentSummary ? (
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <div className="p-1.5 rounded-md bg-blue-500/10">
                <Bot className="h-4 w-4 text-blue-500" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-blue-500">AI Analysis Summary</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs gap-1 text-muted-foreground hover:text-blue-500"
                    onClick={handleGenerateAiSummary}
                    disabled={aiSummaryLoading}
                  >
                    {aiSummaryLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Regenerate
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{localReport.agentSummary}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed border-purple-500/30 bg-purple-500/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-md bg-purple-500/10">
                  <Sparkles className="h-4 w-4 text-purple-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-purple-600 dark:text-purple-400">AI Summary</p>
                  <p className="text-xs text-muted-foreground">
                    Generate an AI analysis summary with health score
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                onClick={handleGenerateAiSummary}
                disabled={aiSummaryLoading}
                className="gap-2 bg-purple-600 hover:bg-purple-700"
              >
                {aiSummaryLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {aiSummaryLoading ? 'Analyzing...' : 'Generate Summary'}
              </Button>
            </div>
            {aiSummaryError && (
              <p className="text-xs text-destructive mt-2">{aiSummaryError}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Failure Summary Banner */}
      {(() => {
        const failedResults = localReport.results.filter(r => !r.success);
        if (failedResults.length === 0) return null;
        return (
          <Card className="border-destructive/30 bg-destructive/5 border-l-4 border-l-destructive overflow-hidden">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-3">
                <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-destructive">
                    {failedResults.length} service{failedResults.length > 1 ? 's' : ''} failed
                  </p>
                  <ul className="text-sm text-muted-foreground mt-1.5 space-y-1">
                    {failedResults.map(r => {
                      const def = definitionMap.get(r.serviceId);
                      return (
                        <li key={r.serviceId} className="flex items-start gap-1.5">
                          <span className="text-destructive/60 mt-0.5 shrink-0">&#8226;</span>
                          <span>
                            <span className="font-medium text-foreground">{def?.name ?? r.serviceId}</span>
                            {r.error && <span className="text-destructive"> — {r.error}</span>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Findings by Service - sorted: failed first, then by severity of findings, then successful */}
      {[...localReport.results]
        .sort((a, b) => {
          // Failed services first
          if (!a.success && b.success) return -1;
          if (a.success && !b.success) return 1;
          // Then by worst finding severity
          const severityRank = (findings: typeof a.findings) => {
            let worst = 0;
            for (const f of findings) {
              const rank = f.severity === 'critical' ? 5 : f.severity === 'error' ? 4 : f.severity === 'warning' ? 3 : 1;
              if (rank > worst) worst = rank;
            }
            return worst;
          };
          return severityRank(b.findings) - severityRank(a.findings);
        })
        .map((result) => {
        const def = definitionMap.get(result.serviceId);
        const CustomRenderer = getServiceRenderer(result.serviceId);

        // Use custom renderer if available
        if (CustomRenderer && def) {
          return (
            <CustomRenderer
              key={result.serviceId}
              result={result}
              definition={def}
              variant="findings"
            />
          );
        }

        // Fallback to generic renderer
        // Build a minimal definition for the wrapper if none exists
        const fallbackDef: ServiceDefinition = def ?? {
          id: result.serviceId,
          name: result.serviceId,
          description: '',
          category: 'diagnostics',
          estimatedDurationSecs: 0,
          requiredPrograms: [],
          options: [],
          icon: 'wrench',
          exclusiveResources: [],
          dependencies: [],
        };

        return (
          <ServiceCardWrapper key={result.serviceId} definition={fallbackDef} result={result}>
            <div className="space-y-2">
              {/* Error message for failed services */}
              {!result.success && result.error && (
                <div className="px-3 py-2 rounded-lg border border-destructive/30 bg-destructive/5">
                  <div className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-destructive">{result.error}</p>
                      {result.logs.length > 0 && (
                        <details className="mt-2">
                          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                            Show last {Math.min(5, result.logs.length)} log lines
                          </summary>
                          <div className="mt-1.5 font-mono text-[11px] text-muted-foreground space-y-0.5 max-h-24 overflow-y-auto">
                            {result.logs.slice(-5).map((log, i) => (
                              <div key={i} className="flex gap-2">
                                <span className="text-destructive/40 select-none shrink-0">&#10095;</span>
                                <span>{log}</span>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {result.findings.map((finding, idx) => {
                const SeverityIcon = severityIcons[finding.severity];
                const colorClass = severityColors[finding.severity];
                return (
                  <div key={idx} className={`px-3 py-2 rounded-lg border ${colorClass}`}>
                    <div className="flex items-start gap-2">
                      <SeverityIcon className="h-4 w-4 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <p className="font-medium">{finding.title}</p>
                        <p className="text-sm opacity-80">{finding.description}</p>
                        {finding.recommendation && (
                          <p className="text-sm mt-1.5 opacity-70 flex items-center gap-1">
                            <ChevronRight className="h-3 w-3" />
                            {finding.recommendation}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {result.findings.length === 0 && result.success && (
                <p className="text-sm text-muted-foreground italic py-2">No findings</p>
              )}
              {result.agentAnalysis && (
                <div className="mt-3 px-3 py-2 rounded-lg border border-blue-500/20 bg-blue-500/5">
                  <div className="flex items-start gap-2">
                    <Bot className="h-4 w-4 mt-0.5 text-blue-500 shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-blue-500 mb-0.5">AI Analysis</p>
                      <p className="text-sm text-muted-foreground">{result.agentAnalysis}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ServiceCardWrapper>
        );
      })}
    </div>
  );

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
              <FindingsContent />
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
