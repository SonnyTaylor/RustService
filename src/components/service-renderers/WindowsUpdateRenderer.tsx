/**
 * Windows Update Renderer
 *
 * Custom renderer for Windows Update service results.
 * Shows available, installed, and failed updates with reboot status.
 */

import { CloudDownload, CheckCircle2, XCircle, RotateCcw, Package } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ServiceRendererProps } from './index';

// =============================================================================
// Types
// =============================================================================

interface UpdateItem {
  Title: string;
  KB: string;
  Size?: number;
  IsDriver?: boolean;
}

interface WindowsUpdateData {
  type: 'windows_update_result';
  mode: string;
  include_drivers: boolean;
  available_count: number;
  installed_count: number;
  failed_count: number;
  remaining_count: number;
  reboot_required: boolean;
  updates: UpdateItem[];
}

// =============================================================================
// Findings Variant
// =============================================================================

function FindingsRenderer({ result }: ServiceRendererProps) {
  const finding = result.findings[0];
  const data = finding?.data as WindowsUpdateData | undefined;

  if (!data || data.type !== 'windows_update_result') {
    return null;
  }

  const isUpToDate = data.available_count === 0 && data.failed_count === 0;
  const hasInstalled = data.installed_count > 0;
  const hasFailed = data.failed_count > 0;

  const getStatusColor = () => {
    if (hasFailed) return 'from-yellow-500/10 to-orange-500/10 dark:from-yellow-500/20 dark:to-orange-500/20';
    if (hasInstalled || isUpToDate) return 'from-green-500/10 to-emerald-500/10 dark:from-green-500/20 dark:to-emerald-500/20';
    return 'from-blue-500/10 to-cyan-500/10 dark:from-blue-500/20 dark:to-cyan-500/20';
  };

  return (
    <Card className="overflow-hidden border-0 shadow-lg">
      <CardHeader className={`pb-3 bg-gradient-to-r ${getStatusColor()}`}>
        <CardTitle className="flex items-center gap-2 text-lg">
          <div className={`p-2 rounded-lg ${hasFailed ? 'bg-yellow-500/20' : 'bg-green-500/20'}`}>
            <CloudDownload className={`h-5 w-5 ${hasFailed ? 'text-yellow-500' : 'text-green-500'}`} />
          </div>
          Windows Update
          {isUpToDate && <Badge className="ml-auto bg-green-500/10 text-green-500 border-green-500/20">Up to Date</Badge>}
          {hasInstalled && !hasFailed && <Badge className="ml-auto bg-green-500/10 text-green-500 border-green-500/20">{data.installed_count} Installed</Badge>}
          {hasFailed && <Badge className="ml-auto bg-yellow-500/10 text-yellow-500 border-yellow-500/20">{data.failed_count} Failed</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="p-3 rounded-lg bg-muted/50 border text-center">
            <Package className="h-4 w-4 mx-auto mb-1 text-blue-500" />
            <p className="text-xl font-bold">{data.available_count}</p>
            <p className="text-xs text-muted-foreground">Available</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50 border text-center">
            <CheckCircle2 className="h-4 w-4 mx-auto mb-1 text-green-500" />
            <p className="text-xl font-bold">{data.installed_count}</p>
            <p className="text-xs text-muted-foreground">Installed</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50 border text-center">
            <XCircle className={`h-4 w-4 mx-auto mb-1 ${hasFailed ? 'text-red-500' : 'text-muted-foreground'}`} />
            <p className="text-xl font-bold">{data.failed_count}</p>
            <p className="text-xs text-muted-foreground">Failed</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50 border text-center">
            <RotateCcw className={`h-4 w-4 mx-auto mb-1 ${data.reboot_required ? 'text-yellow-500' : 'text-muted-foreground'}`} />
            <p className="text-xl font-bold">{data.reboot_required ? 'Yes' : 'No'}</p>
            <p className="text-xs text-muted-foreground">Reboot</p>
          </div>
        </div>

        {/* Update List */}
        {data.updates && data.updates.length > 0 && (
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Available Updates</p>
            <ScrollArea className="h-[150px]">
              <div className="space-y-2">
                {data.updates.slice(0, 10).map((update, index) => (
                  <div key={index} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 border">
                    <Package className="h-4 w-4 text-blue-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{update.Title}</p>
                      <p className="text-xs text-muted-foreground">
                        {update.KB && `KB${update.KB}`}
                        {update.IsDriver && ' • Driver'}
                      </p>
                    </div>
                  </div>
                ))}
                {data.updates.length > 10 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    +{data.updates.length - 10} more updates
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Reboot Warning */}
        {data.reboot_required && (
          <div className="mt-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
            <div className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-yellow-500" />
              <p className="text-sm font-medium text-yellow-600 dark:text-yellow-500">
                Restart required to complete update installation
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Customer Print Variant
// =============================================================================

function CustomerRenderer({ result }: ServiceRendererProps) {
  const finding = result.findings[0];
  const data = finding?.data as WindowsUpdateData | undefined;

  if (!data || data.type !== 'windows_update_result') {
    return null;
  }

  const isGood = data.failed_count === 0;
  const isUpToDate = data.available_count === 0 && data.installed_count === 0;

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${isGood ? 'bg-green-100' : 'bg-yellow-100'}`}>
          <CloudDownload className={`h-5 w-5 ${isGood ? 'text-green-600' : 'text-yellow-600'}`} />
        </div>
        <div className="flex-1">
          <p className="font-bold text-gray-800">
            {isUpToDate
              ? '✓ Windows Up to Date'
              : isGood
                ? `✓ ${data.installed_count} Update(s) Installed`
                : `⚠ Update Issues`}
          </p>
          <p className="text-sm text-gray-500">
            {finding?.description}
          </p>
          {data.reboot_required && (
            <p className="text-sm text-yellow-600 mt-1">
              ⚠ Restart required to complete updates
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

export function WindowsUpdateRenderer(props: ServiceRendererProps) {
  if (props.variant === 'customer') {
    return <CustomerRenderer {...props} />;
  }
  return <FindingsRenderer {...props} />;
}
