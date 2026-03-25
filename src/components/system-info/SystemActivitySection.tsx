/**
 * SystemActivitySection Component
 *
 * Displays top processes, load averages, and system users.
 */

import {
  Activity,
  Users,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { SystemInfo } from '@/types';
import { formatBytes } from '@/types';
import { SectionHeader } from '@/components/system-info/system-info-helpers';

interface SystemActivitySectionProps {
  systemInfo: SystemInfo;
}

export function SystemActivitySection({ systemInfo }: SystemActivitySectionProps) {
  return (
    <div className="space-y-4">
      <SectionHeader icon={Activity} title="System Activity" iconColor="text-cyan-500" />
      <div className="grid gap-6 md:grid-cols-2">
        {/* Top Processes Card */}
        {systemInfo.topProcesses.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Activity className="h-5 w-5 text-cyan-500" />
                Top Processes
              </CardTitle>
              <CardDescription>Highest CPU usage right now</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-52">
                <div className="space-y-2.5 pr-2">
                  {systemInfo.topProcesses.slice(0, 10).map((p) => (
                    <div key={p.pid} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{p.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">PID {p.pid}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{formatBytes(p.memoryBytes)}</span>
                        <Badge variant={p.cpuUsage > 80 ? 'destructive' : 'secondary'}>
                          {p.cpuUsage.toFixed(1)}%
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* Load Average Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-5 w-5 text-cyan-500" />
              System Load
            </CardTitle>
            <CardDescription>CPU load averages</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center py-2">
              <span className="text-muted-foreground text-sm">1 minute</span>
              <Badge variant={systemInfo.loadAvg.one > 1.0 ? 'destructive' : 'secondary'}>
                {systemInfo.loadAvg.one.toFixed(2)}
              </Badge>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-muted-foreground text-sm">5 minutes</span>
              <Badge variant={systemInfo.loadAvg.five > 1.0 ? 'destructive' : 'secondary'}>
                {systemInfo.loadAvg.five.toFixed(2)}
              </Badge>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-muted-foreground text-sm">15 minutes</span>
              <Badge variant={systemInfo.loadAvg.fifteen > 1.0 ? 'destructive' : 'secondary'}>
                {systemInfo.loadAvg.fifteen.toFixed(2)}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Users Card */}
        {systemInfo.users.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5 text-indigo-500" />
                System Users
              </CardTitle>
              <CardDescription>{systemInfo.users.length} user(s) on this system</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {systemInfo.users.map((user, index) => (
                <div key={`user-${index}`} className="py-1.5">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-sm">{user.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {user.groups.length} group(s)
                    </Badge>
                  </div>
                  {user.groups.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {user.groups.slice(0, 5).map((group, gi) => (
                        <Badge key={gi} variant="secondary" className="text-xs">
                          {group}
                        </Badge>
                      ))}
                      {user.groups.length > 5 && (
                        <span className="text-xs text-muted-foreground">
                          +{user.groups.length - 5} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
