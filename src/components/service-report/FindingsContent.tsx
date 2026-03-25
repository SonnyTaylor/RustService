/**
 * FindingsContent Component
 *
 * Displays the findings tab of the service report: summary stats,
 * AI summary, failure banner, and per-service findings cards.
 */

import {
  XCircle,
  ChevronRight,
  Bot,
  Heart,
  Sparkles,
  Loader2,
  RefreshCw,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

import type {
  ServiceReport,
  ServiceDefinition,
} from '@/types/service';
import { getServiceRenderer, ServiceCardWrapper } from '@/components/service-renderers';
import { severityIcons, severityColors } from '@/components/service-report/report-constants';

export interface FindingsContentProps {
  report: ServiceReport;
  definitions: ServiceDefinition[];
  definitionMap: Map<string, ServiceDefinition>;
  aiSummaryLoading: boolean;
  aiSummaryError: string | null;
  onGenerateAiSummary: () => void;
}

export function FindingsContent({
  report,
  definitions,
  definitionMap,
  aiSummaryLoading,
  aiSummaryError,
  onGenerateAiSummary,
}: FindingsContentProps) {
  const allFindings = report.results.flatMap((r) =>
    r.findings.map((f) => ({
      ...f,
      serviceId: r.serviceId,
      serviceName: definitionMap.get(r.serviceId)?.name || r.serviceId,
    }))
  );

  const majorFindings = allFindings.filter(
    (f) => f.severity === 'warning' || f.severity === 'error' || f.severity === 'critical'
  );

  const totalDuration = report.totalDurationMs ? (report.totalDurationMs / 1000).toFixed(1) : '?';
  const successCount = report.results.filter((r) => r.success).length;
  const totalCount = report.results.length;

  return (
    <div className="space-y-3">
      {/* Summary Card */}
      <Card className="bg-gradient-to-br from-card to-muted/30 border-2">
        <CardContent className="pt-4">
          <div className={`grid gap-4 text-center ${report.healthScore != null ? 'grid-cols-5' : 'grid-cols-4'}`}>
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
            {report.healthScore != null && (
              <div>
                <p className={`text-3xl font-bold ${
                  report.healthScore >= 80 ? 'text-green-500' :
                  report.healthScore >= 50 ? 'text-yellow-500' : 'text-red-500'
                }`}>
                  {report.healthScore}
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
      <AiSummaryCard
        report={report}
        aiSummaryLoading={aiSummaryLoading}
        aiSummaryError={aiSummaryError}
        onGenerateAiSummary={onGenerateAiSummary}
      />

      {/* Failure Summary Banner */}
      <FailureBanner report={report} definitionMap={definitionMap} />

      {/* Findings by Service */}
      <ServiceFindings
        report={report}
        definitions={definitions}
        definitionMap={definitionMap}
      />
    </div>
  );
}

// =============================================================================
// AI Summary Card (private sub-component)
// =============================================================================

function AiSummaryCard({
  report,
  aiSummaryLoading,
  aiSummaryError,
  onGenerateAiSummary,
}: {
  report: ServiceReport;
  aiSummaryLoading: boolean;
  aiSummaryError: string | null;
  onGenerateAiSummary: () => void;
}) {
  if (report.agentSummary) {
    return (
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
                  onClick={onGenerateAiSummary}
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
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{report.agentSummary}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
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
            onClick={onGenerateAiSummary}
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
  );
}

// =============================================================================
// Failure Banner (private sub-component)
// =============================================================================

function FailureBanner({
  report,
  definitionMap,
}: {
  report: ServiceReport;
  definitionMap: Map<string, ServiceDefinition>;
}) {
  const failedResults = report.results.filter(r => !r.success);
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
                      {r.error && <span className="text-destructive"> &mdash; {r.error}</span>}
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
}

// =============================================================================
// Service Findings list (private sub-component)
// =============================================================================

function ServiceFindings({
  report,
  definitions,
  definitionMap,
}: {
  report: ServiceReport;
  definitions: ServiceDefinition[];
  definitionMap: Map<string, ServiceDefinition>;
}) {
  const sortedResults = [...report.results].sort((a, b) => {
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
  });

  return (
    <>
      {sortedResults.map((result) => {
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
    </>
  );
}
