/**
 * useServiceSupervision Hook
 *
 * Manages service run supervision: listens for Tauri service events
 * (state changes, completion) and injects updates into the agent loop queue.
 */

import { useState, useEffect, useRef } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { CoreMessage } from 'ai';
import type { AgentLoopQueue } from '@/lib/agent-loop-queue';
import type { ServiceReport, ServiceRunState as ServiceRunStateType, ServiceResult } from '@/types/service';

export interface ActiveServiceRun {
  reportId: string;
  startedAt: string;
  lastResultCount: number;
  assistantMsgId: string | null;
}

/** Format a service result into a concise text summary for the agent */
function formatServiceResultForAgent(result: ServiceResult): string {
  const lines: string[] = [];
  lines.push(`Status: ${result.success ? 'SUCCESS' : 'FAILED'}`);
  if (result.error) lines.push(`Error: ${result.error}`);
  lines.push(`Duration: ${(result.durationMs / 1000).toFixed(1)}s`);
  lines.push(`Findings (${result.findings.length}):`);
  for (const f of result.findings.slice(0, 10)) {
    lines.push(`  [${f.severity.toUpperCase()}] ${f.title}: ${f.description}`);
    if (f.recommendation) lines.push(`    → ${f.recommendation}`);
  }
  if (result.findings.length > 10) {
    lines.push(`  ... and ${result.findings.length - 10} more findings`);
  }
  return lines.join('\n');
}

interface UseServiceSupervisionParams {
  /** Ref to the CoreMessage history for the agent loop. */
  agentHistoryRef: React.MutableRefObject<CoreMessage[]>;
  /** Ref to the agent loop queue for enqueuing follow-up requests. */
  loopQueueRef: React.MutableRefObject<AgentLoopQueue>;
}

export function useServiceSupervision({
  agentHistoryRef,
  loopQueueRef,
}: UseServiceSupervisionParams) {
  const [activeServiceRun, setActiveServiceRun] = useState<ActiveServiceRun | null>(null);
  const activeServiceRunRef = useRef(activeServiceRun);
  activeServiceRunRef.current = activeServiceRun;

  // Listen for service events and inject updates via queue
  useEffect(() => {
    if (!activeServiceRun) return;

    const unlisteners: Promise<UnlistenFn>[] = [];

    // Listen for state changes (service completed, progress updates)
    unlisteners.push(
      listen<ServiceRunStateType>('service-state-changed', (event) => {
        try {
          const run = activeServiceRunRef.current;
          if (!run) return;

          const state = event.payload;
          const report = state.currentReport;
          if (!report?.results) return;

          // Check if new results have appeared since last check
          const newResultCount = report.results.length;
          if (newResultCount > run.lastResultCount) {
            const newResults = report.results.slice(run.lastResultCount);
            setActiveServiceRun(prev => prev ? { ...prev, lastResultCount: newResultCount } : null);

            // Combine ALL new results into a single update message
            const combinedContent = newResults
              .map(r => `${r.serviceId} completed:\n${formatServiceResultForAgent(r)}`)
              .join('\n\n---\n\n');

            const updateMsg: CoreMessage = {
              role: 'user',
              content: `[SERVICE UPDATE — ${newResults.length} service(s) completed]\n\n${combinedContent}`,
            };
            const history = [...agentHistoryRef.current, updateMsg];
            agentHistoryRef.current = history;

            // Route through queue instead of calling runAgentLoop directly
            loopQueueRef.current.enqueue({
              history,
              options: {
                reuseMessageId: run.assistantMsgId,
              },
              serviceUpdate: { content: combinedContent },
            });
          }
        } catch (err) {
          console.error('[AgentPage] Error in service-state-changed handler:', err);
        }
      })
    );

    // Listen for run completion
    unlisteners.push(
      listen<ServiceReport>('service-completed', (event) => {
        try {
          const run = activeServiceRunRef.current;
          if (!run) return;

          const report = event.payload;
          const resultCount = report?.results?.length ?? 0;
          const summaryContent = `Report ID: ${report.id}\nStatus: ${report.status}\nServices run: ${resultCount}\nDuration: ${report.totalDurationMs ? (report.totalDurationMs / 1000).toFixed(1) + 's' : 'unknown'}\n\nAll services have finished. Please review the results using get_service_report and get_report_statistics, then write analysis and generate the PDF report.`;
          const summaryMsg: CoreMessage = {
            role: 'user',
            content: `[SERVICE RUN COMPLETE] ${summaryContent}`,
          };
          const history = [...agentHistoryRef.current, summaryMsg];
          agentHistoryRef.current = history;
          setActiveServiceRun(null);

          // Route through queue for post-run review
          loopQueueRef.current.enqueue({
            history,
          });
        } catch (err) {
          console.error('[AgentPage] Error in service-completed handler:', err);
          setActiveServiceRun(null);
        }
      })
    );

    return () => {
      unlisteners.forEach(p => p.then(fn => fn()));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeServiceRun?.reportId]);

  return { activeServiceRun, setActiveServiceRun };
}
