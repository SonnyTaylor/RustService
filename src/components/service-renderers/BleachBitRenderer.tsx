/**
 * BleachBit Cleanup Renderer
 *
 * Custom renderer for BleachBit system cleanup results.
 * Shows space recovered, files deleted, and any errors.
 */

import { Trash2, HardDrive, FileX, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ServiceRendererProps } from './index';

// =============================================================================
// Types
// =============================================================================

interface BleachBitData {
  type: 'bleachbit_summary';
  space_recovered_bytes: number;
  space_recovered_formatted: string;
  files_deleted: number;
  special_operations: number;
  errors: number;
}

// =============================================================================
// Findings Variant
// =============================================================================

function FindingsRenderer({ result }: ServiceRendererProps) {
  const finding = result.findings[0];
  const data = finding?.data as BleachBitData | undefined;

  if (!data || data.type !== 'bleachbit_summary') {
    return null;
  }

  const hasErrors = data.errors > 0;
  const hasCleanup = data.space_recovered_bytes > 0 || data.files_deleted > 0;

  return (
    <Card className="overflow-hidden border-0 shadow-lg">
      <CardHeader className="pb-3 bg-gradient-to-r from-green-500/10 to-emerald-500/10 dark:from-green-500/20 dark:to-emerald-500/20">
        <CardTitle className="flex items-center gap-2 text-lg">
          <div className="p-2 rounded-lg bg-green-500/20">
            <Trash2 className="h-5 w-5 text-green-500" />
          </div>
          System Cleanup Results
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="p-4 rounded-lg bg-muted/50 border text-center">
            <HardDrive className="h-5 w-5 mx-auto mb-2 text-blue-500" />
            <p className="text-2xl font-bold">{data.space_recovered_formatted}</p>
            <p className="text-xs text-muted-foreground">Space Recovered</p>
          </div>
          <div className="p-4 rounded-lg bg-muted/50 border text-center">
            <FileX className="h-5 w-5 mx-auto mb-2 text-orange-500" />
            <p className="text-2xl font-bold">{data.files_deleted}</p>
            <p className="text-xs text-muted-foreground">Files Deleted</p>
          </div>
          <div className="p-4 rounded-lg bg-muted/50 border text-center">
            <AlertTriangle className={`h-5 w-5 mx-auto mb-2 ${hasErrors ? 'text-red-500' : 'text-green-500'}`} />
            <p className="text-2xl font-bold">{data.errors}</p>
            <p className="text-xs text-muted-foreground">Errors</p>
          </div>
        </div>

        {/* Status Message */}
        <div className={`p-3 rounded-lg border ${hasErrors ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-green-500/10 border-green-500/30'}`}>
          <div className="flex items-center gap-2">
            {hasErrors ? (
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            )}
            <span className="text-sm">
              {hasErrors
                ? `Cleanup completed with ${data.errors} error(s). Some items could not be removed.`
                : hasCleanup
                  ? 'Cleanup completed successfully.'
                  : 'No items needed cleaning.'}
            </span>
          </div>
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
  const data = finding?.data as BleachBitData | undefined;

  if (!data || data.type !== 'bleachbit_summary') {
    return null;
  }

  const isGood = data.errors === 0;

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${isGood ? 'bg-green-100' : 'bg-yellow-100'}`}>
          <Trash2 className={`h-5 w-5 ${isGood ? 'text-green-600' : 'text-yellow-600'}`} />
        </div>
        <div className="flex-1">
          <p className="font-bold text-gray-800">
            {isGood ? '✓ System Cleaned' : '⚠ Cleanup Completed with Errors'}
          </p>
          <p className="text-sm text-gray-500">
            Recovered {data.space_recovered_formatted}, deleted {data.files_deleted} files
          </p>
          {data.errors > 0 && (
            <p className="text-sm text-yellow-600 mt-1">
              ⚠ {data.errors} item(s) could not be removed
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

export function BleachBitRenderer(props: ServiceRendererProps) {
  if (props.variant === 'customer') {
    return <CustomerRenderer {...props} />;
  }
  return <FindingsRenderer {...props} />;
}
