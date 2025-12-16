/**
 * DISM Health Check Renderer
 *
 * Custom renderer for DISM component store health check results.
 * Shows health status, repair attempts, and step-by-step results.
 */

import { Package, CheckCircle2, AlertTriangle, XCircle, Shield } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

function getHealthBadge(state: string | null) {
  switch (state) {
    case 'healthy':
      return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Healthy</Badge>;
    case 'repaired':
      return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Repaired</Badge>;
    case 'repairable':
      return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Repairable</Badge>;
    case 'corrupted':
      return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Corrupted</Badge>;
    default:
      return <Badge variant="outline">Unknown</Badge>;
  }
}

// =============================================================================
// Findings Variant
// =============================================================================

function FindingsRenderer({ result }: ServiceRendererProps) {
  const finding = result.findings[0];
  const data = finding?.data as DismData | undefined;

  if (!data || data.type !== 'dism_result') {
    return null;
  }

  const lastStep = data.steps[data.steps.length - 1];
  const overallHealthy = !data.corruption_detected || data.corruption_repaired;

  return (
    <Card className="overflow-hidden border-0 shadow-lg">
      <CardHeader className={`pb-3 bg-gradient-to-r ${overallHealthy ? 'from-green-500/10 to-emerald-500/10 dark:from-green-500/20 dark:to-emerald-500/20' : 'from-yellow-500/10 to-orange-500/10 dark:from-yellow-500/20 dark:to-orange-500/20'}`}>
        <CardTitle className="flex items-center gap-2 text-lg">
          <div className={`p-2 rounded-lg ${overallHealthy ? 'bg-green-500/20' : 'bg-yellow-500/20'}`}>
            <Shield className={`h-5 w-5 ${overallHealthy ? 'text-green-500' : 'text-yellow-500'}`} />
          </div>
          Component Store Health
          {lastStep?.health_state && (
            <span className="ml-auto">{getHealthBadge(lastStep.health_state)}</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
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
      </CardContent>
    </Card>
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
