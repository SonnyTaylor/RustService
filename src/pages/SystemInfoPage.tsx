/**
 * System Info Page Component
 *
 * Displays comprehensive hardware and OS information using shadcn components.
 * Data is collected via the sysinfo Rust crate on the backend.
 *
 * Designed to be extensible for additional system info sections.
 */

import { useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import {
  Monitor,
  RefreshCw,
  Clock,
  Printer,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

import { useSettings } from '@/components/settings-context';
import { PrintableSystemInfo } from '@/components/printable-system-info';
import { useSystemInfoData } from '@/hooks/useSystemInfoData';
import { useDiskHealth } from '@/hooks/useDiskHealth';
import { useRestorePoints } from '@/hooks/useRestorePoints';

import {
  LoadingSkeleton,
  RefreshOverlay,
} from '@/components/system-info/system-info-helpers';
import { SystemOverview } from '@/components/system-info/SystemOverview';
import { ProcessorMemorySection } from '@/components/system-info/ProcessorMemorySection';
import { MainboardGraphicsSection } from '@/components/system-info/MainboardGraphicsSection';
import { PowerThermalsSection } from '@/components/system-info/PowerThermalsSection';
import { StorageSection } from '@/components/system-info/StorageSection';
import { NetworkSection } from '@/components/system-info/NetworkSection';
import { SystemActivitySection } from '@/components/system-info/SystemActivitySection';
import { RestorePointsSection } from '@/components/system-info/RestorePointsSection';

/**
 * System Info Page - Main component
 */
export function SystemInfoPage() {
  const { settings } = useSettings();
  const printRef = useRef<HTMLDivElement>(null);

  // Data hooks
  const sysInfo = useSystemInfoData();
  const diskHealth = useDiskHealth();
  const restorePoints = useRestorePoints();

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `System_Info_${sysInfo.systemInfo?.os.hostname || 'Device'}`,
  });

  // Loading state
  if (sysInfo.isLoading) {
    return <LoadingSkeleton />;
  }

  // Error state
  if (sysInfo.error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-destructive">
        <Monitor className="h-16 w-16" />
        <h2 className="text-xl font-semibold">Failed to load system info</h2>
        <p className="text-muted-foreground">{sysInfo.error}</p>
        <Button onClick={() => sysInfo.fetchSystemInfo()}>Try Again</Button>
      </div>
    );
  }

  if (!sysInfo.systemInfo) return null;

  const { systemInfo } = sysInfo;

  return (
    <div className="h-full flex flex-col overflow-hidden min-h-0">
      <ScrollArea className="flex-1 min-h-0">
        <div className="relative p-4 space-y-8">
          <RefreshOverlay visible={sysInfo.isRefreshing} />

      {/* Header with controls */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Monitor className="h-6 w-6" />
            System Information
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Hardware and operating system details
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="auto-refresh"
              checked={sysInfo.autoRefresh}
              onCheckedChange={sysInfo.setAutoRefresh}
              disabled={sysInfo.isLoading}
            />
            <Label htmlFor="auto-refresh" className="text-sm text-muted-foreground">
              Auto refresh
            </Label>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            disabled={sysInfo.isLoading || !systemInfo}
          >
            <Printer className="h-4 w-4 mr-2" />
            Print Specs
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={sysInfo.refresh}
            disabled={sysInfo.isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${sysInfo.isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <SystemOverview systemInfo={systemInfo} />
      <ProcessorMemorySection systemInfo={systemInfo} />
      <MainboardGraphicsSection systemInfo={systemInfo} />
      <PowerThermalsSection systemInfo={systemInfo} />
      <StorageSection
        systemInfo={systemInfo}
        diskHealth={diskHealth.diskHealth}
        diskHealthLoading={diskHealth.isLoading}
        onRefreshDiskHealth={diskHealth.refresh}
      />
      <NetworkSection systemInfo={systemInfo} />
      <SystemActivitySection systemInfo={systemInfo} />
      <RestorePointsSection
        restorePoints={restorePoints.restorePoints}
        isLoading={restorePoints.isLoading}
        onRefresh={restorePoints.refresh}
        isCreating={restorePoints.isCreating}
        description={restorePoints.description}
        onDescriptionChange={restorePoints.setDescription}
        dialogOpen={restorePoints.dialogOpen}
        onDialogOpenChange={restorePoints.setDialogOpen}
        createError={restorePoints.createError}
        createSuccess={restorePoints.createSuccess}
        onCreateRestorePoint={restorePoints.createRestorePoint}
      />

      {/* Footer with timestamp */}
          <div className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1 pb-2">
            <Clock className="h-3 w-3" />
            Last updated: {(sysInfo.lastUpdated ?? new Date()).toLocaleTimeString()}
          </div>
        </div>
      </ScrollArea>

      {/* Hidden printable component */}
      <div className="hidden">
        <div ref={printRef}>
          <PrintableSystemInfo
            systemInfo={systemInfo}
            businessSettings={settings.business}
          />
        </div>
      </div>
    </div>
  );
}
