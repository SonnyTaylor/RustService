/**
 * DISM Health Check Renderer
 *
 * Custom renderer for DISM component store health check results.
 * Shows health status, repair attempts, and step-by-step results.
 */

import { Package, CheckCircle2, AlertTriangle, XCircle, Shield } from 'lucide-react';
import { ServiceCardWrapper } from './ServiceCardWrapper';
import type { StatusBadge } from './ServiceCardWrapper';
import type { ServiceRendererProps } from './index';

// =============================================================================
// Types
// =============================================================================

interface DismStepResult {
  action: string;
  exit_code: number;
  health_state: string | null;
  corruption_detected: boolean;
  repair_attempted: boolean;
  repair_success: boolean | null;
  access_denied: boolean;
}

interface DismData {
  type: 'dism_result';
  scan_only: boolean;
  corruption_detected: boolean;
  corruption_repaired: boolean;
  steps: DismStepResult[];
}

// =============================================================================
// Helper Functions
// =============================================================================

function getHealthIcon(state: string | null) {
  switch (state) {
    case 'healthy':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'repaired':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case 'repairable':
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    case 'corrupted':
      return <XCircle className="h-4 w-4 text-red-500" />;
    default:
      return <Package className="h-4 w-4 text-muted-foreground" />;
  }
}

// =============================================================================
// Findings Variant
// =============================================================================

function FindingsRenderer({ result, definition }: ServiceRendererProps) {
  const finding = result.findings[0];
  const data = finding?.data as DismData | undefined;

  if (!data || data.type !== 'dism_result') {
    return null;
  }

  const lastStep = data.steps[data.steps.length - 1];
  const overallHealthy = !data.corruption_detected || data.corruption_repaired;

  const getStatusBadge = (): StatusBadge => {
    switch (lastStep?.health_state) {
      case 'healthy': return { label: 'Healthy', color: 'green' };
      case 'repaired': return { label: 'Repaired', color: 'green' };
      case 'repairable': return { label: 'Repairable', color: 'yellow' };
      case 'corrupted': return { label: 'Corrupted', color: 'red' };
      default: return { label: overallHealthy ? 'PASS' : 'FAIL', color: overallHealthy ? 'green' : 'red' };
    }
  };

  return (
    <ServiceCardWrapper
      definition={definition}
      result={result}
      statusBadge={getStatusBadge()}
    >
      {/* Summary */}
      <div className={`p-4 rounded-lg border mb-4 ${overallHealthy ? 'bg-green-500/10 border-green-500/30' : 'bg-yellow-500/10 border-yellow-500/30'}`}>
        <div className="flex items-center gap-2">
          {overallHealthy ? (
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
          )}
          <div>
            <p className="font-medium">{finding?.title}</p>
            <p className="text-sm text-muted-foreground">{finding?.description}</p>
          </div>
        </div>
      </div>

      {/* Step Results */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground mb-2">DISM Operations</p>
        {data.steps.map((step, index) => (
          <div key={index} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30 border">
            {getHealthIcon(step.health_state)}
            <span className="font-mono text-sm">{step.action}</span>
            <span className={`ml-auto text-xs ${step.exit_code === 0 ? 'text-green-500' : 'text-red-500'}`}>
              Exit: {step.exit_code}
            </span>
          </div>
        ))}
      </div>
    </ServiceCardWrapper>
  );
}

// =============================================================================
// Customer Print Variant
// =============================================================================

function CustomerRenderer({ result }: ServiceRendererProps) {
  const finding = result.findings[0];
  const data = finding?.data as DismData | undefined;

  if (!data || data.type !== 'dism_result') {
    return null;
  }

  const isGood = !data.corruption_detected || data.corruption_repaired;

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${isGood ? 'bg-green-100' : 'bg-yellow-100'}`}>
          <Shield className={`h-5 w-5 ${isGood ? 'text-green-600' : 'text-yellow-600'}`} />
        </div>
        <div className="flex-1">
          <p className="font-bold text-gray-800">
            {isGood ? '✓ Component Store Healthy' : '⚠ Component Store Issues'}
          </p>
          <p className="text-sm text-gray-500">
            {finding?.description}
          </p>
          {finding?.recommendation && (
            <p className="text-sm text-yellow-600 mt-1">
              ⚠ {finding.recommendation}
            </p>
          )}
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

export function DismRenderer(props: ServiceRendererProps) {
  if (props.variant === 'customer') {
    return <CustomerRenderer {...props} />;
  }
  return <FindingsRenderer {...props} />;
}
