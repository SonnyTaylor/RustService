/**
 * StorageSection Component
 *
 * Displays storage devices, disk usage, and S.M.A.R.T. health data.
 */

import {
  HardDrive,
  Shield,
  RefreshCw,
  Loader2,
  AlertCircle,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { SystemInfo } from '@/types';
import type { DiskHealthResponse } from '@/components/system-info/types';
import { SectionHeader, UsageBar } from '@/components/system-info/system-info-helpers';
import { DiskHealthCard } from '@/components/system-info/DiskHealthCard';

interface StorageSectionProps {
  systemInfo: SystemInfo;
  diskHealth: DiskHealthResponse | null;
  diskHealthLoading: boolean;
  onRefreshDiskHealth: () => void;
}

export function StorageSection({
  systemInfo,
  diskHealth,
  diskHealthLoading,
  onRefreshDiskHealth,
}: StorageSectionProps) {
  return (
    <div className="space-y-4">
      <SectionHeader icon={HardDrive} title="Storage" iconColor="text-slate-500" />

      {/* Storage Devices */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {systemInfo.disks.map((disk, index) => (
          <Card key={index} className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-medium">
                  {disk.mountPoint}
                </CardTitle>
                <Badge variant="outline" className="text-xs">
                  {disk.diskType}
                </Badge>
              </div>
              <CardDescription className="text-xs">
                {disk.name || 'Local Disk'} • {disk.fileSystem}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UsageBar
                label="Used"
                used={disk.totalSpace - disk.availableSpace}
                total={disk.totalSpace}
              />
              {disk.isRemovable && (
                <Badge variant="secondary" className="mt-2 text-xs">
                  Removable
                </Badge>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Disk Health (S.M.A.R.T.) */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <h4 className="text-base font-medium flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Disk Health (S.M.A.R.T.)
          </h4>
          <Button variant="outline" size="sm" onClick={onRefreshDiskHealth} disabled={diskHealthLoading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${diskHealthLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {diskHealthLoading && !diskHealth && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              Scanning disk health...
            </CardContent>
          </Card>
        )}

        {diskHealth && !diskHealth.smartctlFound && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              smartctl not found. Install <span className="font-medium">smartmontools</span> or add smartctl.exe to your programs folder for S.M.A.R.T. health data.
            </AlertDescription>
          </Alert>
        )}

        {diskHealth && diskHealth.smartctlFound && diskHealth.disks.length === 0 && (
          <Card>
            <CardContent className="py-6 text-center text-muted-foreground text-sm">
              No S.M.A.R.T. data available. Drives may not support S.M.A.R.T. or may require administrator privileges.
            </CardContent>
          </Card>
        )}

        {diskHealth && diskHealth.disks.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {diskHealth.disks.map((disk, index) => (
              <DiskHealthCard key={`health-${index}`} disk={disk} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
