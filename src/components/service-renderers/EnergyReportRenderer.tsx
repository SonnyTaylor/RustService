/**
 * Energy Report Renderer
 *
 * Custom renderer for powercfg /energy results.
 * Shows errors, warnings, and informational power items.
 */

import { Zap, AlertTriangle, Info, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ServiceCardWrapper } from './ServiceCardWrapper';
import type { ServiceRendererProps } from './index';

// =============================================================================
// Types
// =============================================================================

interface EnergyItem {
  severity: 'error' | 'warning' | 'info';
  category: string;
  title: string;
  description: string;
}

interface EnergyData {
  type: 'energy_report';
  errorCount: number;
  warningCount: number;
  infoCount: number;
  items: EnergyItem[];
  duration: number;
  error?: boolean;
}

// =============================================================================
// Findings Variant
// =============================================================================

function FindingsRenderer({ definition, result }: ServiceRendererProps) {
  const finding = result.findings[0];
  const data = finding?.data as EnergyData | undefined;

  if (!data || data.type !== 'energy_report') return null;
  if (data.error) return null;

  const hasErrors = data.errorCount > 0;
  const hasWarnings = data.warningCount > 0;

  const errors = data.items.filter(i => i.severity === 'error');
  const warnings = data.items.filter(i => i.severity === 'warning');
  const infos = data.items.filter(i => i.severity === 'info');

  const statusBadge = hasErrors
    ? { label: `${data.errorCount} Error${data.errorCount !== 1 ? 's' : ''}`, color: 'red' as const }
    : hasWarnings
      ? { label: `${data.warningCount} Warning${data.warningCount !== 1 ? 's' : ''}`, color: 'yellow' as const }
      : { label: 'No Issues', color: 'green' as const };

  return (
    <ServiceCardWrapper definition={definition} result={result} statusBadge={statusBadge}>
      <div className="space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-xs text-muted-foreground">Errors</p>
            <p className="text-2xl font-bold text-red-500">{data.errorCount}</p>
          </div>
          <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <p className="text-xs text-muted-foreground">Warnings</p>
            <p className="text-2xl font-bold text-yellow-500">{data.warningCount}</p>
          </div>
          <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <p className="text-xs text-muted-foreground">Info</p>
            <p className="text-2xl font-bold text-blue-500">{data.infoCount}</p>
          </div>
        </div>

        {/* Error Items */}
        {errors.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-red-500 flex items-center gap-1">
              <XCircle className="h-4 w-4" /> Errors
            </p>
            {errors.map((item, i) => (
              <div key={i} className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="text-sm font-medium">{item.title}</p>
                {item.description && (
                  <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                )}
                {item.category && (
                  <Badge variant="outline" className="mt-1 text-xs">{item.category}</Badge>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Warning Items */}
        {warnings.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-yellow-500 flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" /> Warnings
            </p>
            {warnings.map((item, i) => (
              <div key={i} className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <p className="text-sm font-medium">{item.title}</p>
                {item.description && (
                  <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                )}
                {item.category && (
                  <Badge variant="outline" className="mt-1 text-xs">{item.category}</Badge>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Info Items */}
        {infos.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-blue-500 flex items-center gap-1">
              <Info className="h-4 w-4" /> Informational
            </p>
            {infos.map((item, i) => (
              <div key={i} className="p-3 rounded-lg bg-muted/30 border">
                <p className="text-sm font-medium">{item.title}</p>
                {item.description && (
                  <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground text-right">
          Trace duration: {data.duration}s
        </p>
      </div>
    </ServiceCardWrapper>
  );
}

// =============================================================================
// Customer Print Variant
// =============================================================================

function CustomerRenderer({ result }: ServiceRendererProps) {
  const finding = result.findings[0];
  const data = finding?.data as EnergyData | undefined;

  if (!data || data.type !== 'energy_report') return null;

  const isGood = data.errorCount === 0 && data.warningCount === 0;

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${isGood ? 'bg-green-100' : 'bg-yellow-100'}`}>
          <Zap className={`h-5 w-5 ${isGood ? 'text-green-600' : 'text-yellow-600'}`} />
        </div>
        <div className="flex-1">
          <p className="font-bold text-gray-800">
            {isGood ? '✓ Power Efficiency: Good' : `⚠ ${data.errorCount} Power Issue(s) Found`}
          </p>
          <p className="text-sm text-gray-500">
            {data.errorCount} error(s), {data.warningCount} warning(s) detected during power analysis.
          </p>
        </div>
        <div className={`text-2xl ${isGood ? 'text-green-500' : 'text-yellow-500'}`}>
          {isGood ? '✓' : '⚠'}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Renderer
// =============================================================================

export function EnergyReportRenderer(props: ServiceRendererProps) {
  if (props.variant === 'customer') return <CustomerRenderer {...props} />;
  return <FindingsRenderer {...props} />;
}
