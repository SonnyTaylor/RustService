/**
 * SFC System File Checker Renderer
 *
 * Custom renderer for SFC scan results.
 * Shows integrity status, repair outcome, and any pending actions.
 */

import { FileSearch, CheckCircle2, AlertTriangle, XCircle, RotateCcw } from 'lucide-react';
import { ServiceCardWrapper } from './ServiceCardWrapper';
import type { StatusBadge } from './ServiceCardWrapper';
import type { ServiceRendererProps } from './index';

// =============================================================================
// Types
// =============================================================================

interface SfcData {
  type: 'sfc_result';
  integrity_violations: boolean | null;
  repairs_attempted: boolean;
  repairs_successful: boolean | null;
  verification_complete: boolean;
  pending_reboot: boolean;
  winsxs_repair_pending: boolean;
  access_denied: boolean;
  exit_code: number;
}

// =============================================================================
// Findings Variant
// =============================================================================

function FindingsRenderer({ result, definition }: ServiceRendererProps) {
  const finding = result.findings[0];
  const data = finding?.data as SfcData | undefined;

  if (!data || data.type !== 'sfc_result') {
    return null;
  }

  const isHealthy = data.integrity_violations === false;
  const isRepaired = data.repairs_successful === true;
  const hasPending = data.pending_reboot || data.winsxs_repair_pending;

  const getStatusBadge = (): StatusBadge => {
    if (isHealthy) return { label: 'Healthy', color: 'green' };
    if (isRepaired) return { label: 'Repaired', color: 'green' };
    if (data.repairs_successful === false) return { label: 'Issues Found', color: 'yellow' };
    if (data.access_denied) return { label: 'Access Denied', color: 'red' };
    if (hasPending) return { label: 'Pending', color: 'yellow' };
    return { label: result.success ? 'PASS' : 'FAIL', color: result.success ? 'green' : 'red' };
  };

  return (
    <ServiceCardWrapper
      definition={definition}
      result={result}
      statusBadge={getStatusBadge()}
    >
      {/* Summary */}
      <div className={`p-4 rounded-lg border mb-4 ${isHealthy || isRepaired ? 'bg-green-500/10 border-green-500/30' : hasPending ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-muted/50'}`}>
        <div className="flex items-center gap-2">
          {isHealthy || isRepaired ? (
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          ) : hasPending ? (
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
          ) : data.access_denied ? (
            <XCircle className="h-5 w-5 text-red-500" />
          ) : (
            <FileSearch className="h-5 w-5 text-blue-500" />
          )}
          <div>
            <p className="font-medium">{finding?.title}</p>
            <p className="text-sm text-muted-foreground">{finding?.description}</p>
          </div>
        </div>
      </div>

      {/* Status Details */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-muted/30 border">
          <p className="text-xs text-muted-foreground">Integrity Check</p>
          <p className="font-medium flex items-center gap-2">
            {data.integrity_violations === false ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-500" /> No Violations
              </>
            ) : data.integrity_violations === true ? (
              <>
                <AlertTriangle className="h-4 w-4 text-yellow-500" /> Violations Found
              </>
            ) : (
              <>
                <FileSearch className="h-4 w-4 text-muted-foreground" /> Unknown
              </>
            )}
          </p>
        </div>
        <div className="p-3 rounded-lg bg-muted/30 border">
          <p className="text-xs text-muted-foreground">Repairs</p>
          <p className="font-medium flex items-center gap-2">
            {!data.repairs_attempted ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" /> Not Needed
              </>
            ) : data.repairs_successful === true ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-500" /> Successful
              </>
            ) : data.repairs_successful === false ? (
              <>
                <AlertTriangle className="h-4 w-4 text-yellow-500" /> Incomplete
              </>
            ) : (
              <>
                <RotateCcw className="h-4 w-4 text-blue-500" /> In Progress
              </>
            )}
          </p>
        </div>
      </div>

      {/* Pending Actions */}
      {(data.pending_reboot || data.winsxs_repair_pending) && (
        <div className="mt-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
          <p className="text-sm font-medium text-yellow-600 dark:text-yellow-500">
            {data.pending_reboot && '⚠ Reboot required to complete repairs'}
            {data.winsxs_repair_pending && '⚠ Run DISM RestoreHealth before SFC'}
          </p>
        </div>
      )}
    </ServiceCardWrapper>
  );
}

// =============================================================================
// Customer Print Variant
// =============================================================================

function CustomerRenderer({ result }: ServiceRendererProps) {
  const finding = result.findings[0];
  const data = finding?.data as SfcData | undefined;

  if (!data || data.type !== 'sfc_result') {
    return null;
  }

  const isGood = data.integrity_violations === false || data.repairs_successful === true;

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${isGood ? 'bg-green-100' : 'bg-yellow-100'}`}>
          <FileSearch className={`h-5 w-5 ${isGood ? 'text-green-600' : 'text-yellow-600'}`} />
        </div>
        <div className="flex-1">
          <p className="font-bold text-gray-800">
            {isGood ? '✓ System Files Healthy' : '⚠ System File Issues'}
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

export function SfcRenderer(props: ServiceRendererProps) {
  if (props.variant === 'customer') {
    return <CustomerRenderer {...props} />;
  }
  return <FindingsRenderer {...props} />;
}
