/**
 * Restore Point Service Renderer
 *
 * Custom renderer for the restore-point service results.
 * Shows whether a system restore point was successfully created.
 */

import { ShieldCheck, ShieldAlert, AlertTriangle } from 'lucide-react';
import { ServiceCardWrapper } from './ServiceCardWrapper';
import type { ServiceRendererProps } from './index';

// =============================================================================
// Types
// =============================================================================

interface RestorePointData {
  type: 'restore_point_result';
  description?: string;
  success: boolean;
}

// =============================================================================
// Findings Variant
// =============================================================================

function FindingsRenderer({ result, definition }: ServiceRendererProps) {
  const finding = result.findings[0];
  const data = finding?.data as RestorePointData | undefined;
  const description = data?.description ?? 'System Restore Point';

  return (
    <ServiceCardWrapper
      definition={definition}
      result={result}
      statusBadge={{
        label: result.success ? 'CREATED' : 'FAILED',
        color: result.success ? 'green' : 'red',
      }}
    >
      {result.success ? (
        <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-green-500" />
            <div>
              <p className="font-medium text-green-500">Restore Point Created</p>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
          <div className="flex items-start gap-3">
            {finding?.severity === 'warning' ? (
              <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-medium text-red-500">{finding?.title ?? 'Failed to Create Restore Point'}</p>
              <p className="text-sm text-muted-foreground">{finding?.description ?? result.error}</p>
              {finding?.recommendation && (
                <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-2">
                  {finding.recommendation}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </ServiceCardWrapper>
  );
}

// =============================================================================
// Customer Print Variant
// =============================================================================

function CustomerRenderer({ result }: ServiceRendererProps) {
  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${result.success ? 'bg-green-100' : 'bg-red-100'}`}>
          {result.success ? (
            <ShieldCheck className="h-5 w-5 text-green-600" />
          ) : (
            <ShieldAlert className="h-5 w-5 text-red-600" />
          )}
        </div>
        <div className="flex-1">
          <p className="text-xs text-blue-600 uppercase tracking-wide font-medium">
            System Restore Point
          </p>
          <p className="text-xl font-bold text-gray-900">
            {result.success ? 'Restore Point Created' : 'Restore Point Failed'}
          </p>
          <p className="text-sm text-gray-500">
            {result.success
              ? 'A safety restore point was created before maintenance'
              : result.error ?? 'Could not create restore point'}
          </p>
        </div>
        <div className={`text-2xl ${result.success ? 'text-green-500' : 'text-red-500'}`}>
          {result.success ? '✓' : '✗'}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Renderer
// =============================================================================

export function RestorePointRenderer(props: ServiceRendererProps) {
  if (props.variant === 'customer') {
    return <CustomerRenderer {...props} />;
  }
  return <FindingsRenderer {...props} />;
}
