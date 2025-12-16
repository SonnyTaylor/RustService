/**
 * WhyNotWin11 Compatibility Check Renderer
 *
 * Custom renderer for Windows 11 compatibility results.
 * Shows pass/fail checks with recommendations.
 */

import { MonitorCheck, CircleCheck, CircleX, Info, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ServiceRendererProps } from './index';

// =============================================================================
// Types
// =============================================================================

interface WhyNotWin11Data {
  type: 'whynotwin11_result';
  ready: boolean;
  hostname?: string;
  checks: Record<string, boolean>;
  failingChecks: string[];
  passingChecks: string[];
}

// =============================================================================
// Findings Variant
// =============================================================================

function FindingsRenderer({ result }: ServiceRendererProps) {
  const finding = result.findings[0];
  const data = finding?.data as WhyNotWin11Data | undefined;

  if (!data || data.type !== 'whynotwin11_result') {
    return null;
  }

  const { ready, checks, failingChecks } = data;
  const sortedChecks = Object.entries(checks).sort(([, a], [, b]) => {
    if (a === b) return 0;
    return a ? 1 : -1; // Failed checks first
  });

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden pt-0">
        <CardHeader className={`py-4 bg-gradient-to-r ${ready ? 'from-green-500/10 to-emerald-500/10' : 'from-yellow-500/10 to-orange-500/10'}`}>
          <CardTitle className="text-base flex items-center gap-3">
            <div className={`p-2 rounded-lg ${ready ? 'bg-green-500/20' : 'bg-yellow-500/20'}`}>
              <MonitorCheck className={`h-5 w-5 ${ready ? 'text-green-500' : 'text-yellow-500'}`} />
            </div>
            Windows 11 Compatibility
            <span className={`ml-auto px-2 py-0.5 rounded text-xs font-medium ${ready ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'}`}>
              {ready ? 'COMPATIBLE' : 'NOT COMPATIBLE'}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {/* Summary */}
          <div className={`p-3 rounded-lg mb-4 flex items-center gap-3 ${ready ? 'bg-green-500/10' : 'bg-yellow-500/10'}`}>
            {ready ? (
              <>
                <CircleCheck className="h-5 w-5 text-green-500" />
                <span className="text-sm font-medium">This PC meets all Windows 11 requirements</span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                <span className="text-sm font-medium">
                  This PC does not meet {failingChecks.length} Windows 11 requirement(s)
                </span>
              </>
            )}
          </div>

          {/* Checks Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {sortedChecks.map(([name, passed]) => (
              <div
                key={name}
                className={`p-2 rounded-lg border flex items-center gap-2 ${
                  passed ? 'bg-muted/30 border-muted' : 'bg-red-500/10 border-red-500/30'
                }`}
              >
                {passed ? (
                  <CircleCheck className="h-4 w-4 text-green-500 shrink-0" />
                ) : (
                  <CircleX className="h-4 w-4 text-red-500 shrink-0" />
                )}
                <span className={`text-sm truncate ${passed ? 'text-muted-foreground' : 'text-red-500 font-medium'}`}>
                  {name}
                </span>
              </div>
            ))}
          </div>

          {/* Recommendation */}
          {finding?.recommendation && (
            <div className="mt-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-start gap-2">
              <Info className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-700 dark:text-yellow-300 whitespace-pre-line">
                {finding.recommendation}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Customer Print Variant
// =============================================================================

function CustomerRenderer({ result }: ServiceRendererProps) {
  const finding = result.findings[0];
  const data = finding?.data as WhyNotWin11Data | undefined;

  if (!data || data.type !== 'whynotwin11_result') {
    return null;
  }

  const { ready, failingChecks, passingChecks } = data;

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${ready ? 'bg-green-100' : 'bg-yellow-100'}`}>
          <MonitorCheck className={`h-5 w-5 ${ready ? 'text-green-600' : 'text-yellow-600'}`} />
        </div>
        <div className="flex-1">
          <p className="text-xs text-blue-600 uppercase tracking-wide font-medium">
            Windows 11 Compatibility
          </p>
          <p className="text-xl font-bold text-gray-900">
            {ready ? 'Compatible' : 'Not Compatible'}
          </p>
          <p className="text-sm text-gray-500">
            {ready
              ? `All ${passingChecks.length} requirements passed`
              : `${failingChecks.length} requirement(s) not met: ${failingChecks.join(', ')}`}
          </p>
          {!ready && (
            <p className="text-sm text-yellow-600 mt-1">
              ⚠ Hardware upgrade may be required for Windows 11
            </p>
          )}
        </div>
        <div className={`text-2xl ${ready ? 'text-green-500' : 'text-yellow-500'}`}>
          {ready ? '✓' : '⚠'}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Renderer
// =============================================================================

export function WhyNotWin11Renderer(props: ServiceRendererProps) {
  const { variant } = props;

  if (variant === 'customer') {
    return <CustomerRenderer {...props} />;
  }

  return <FindingsRenderer {...props} />;
}
