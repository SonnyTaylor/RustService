/**
 * NetworkSection Component
 *
 * Displays network interface details including traffic and error counts.
 */

import { Network } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { SystemInfo } from '@/types';
import { formatBytes } from '@/types';
import { SectionHeader } from '@/components/system-info/system-info-helpers';

interface NetworkSectionProps {
  systemInfo: SystemInfo;
}

export function NetworkSection({ systemInfo }: NetworkSectionProps) {
  if (systemInfo.networks.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <SectionHeader icon={Network} title="Network Interfaces" iconColor="text-sky-500" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {systemInfo.networks.map((net, index) => (
          <Card key={`net-${index}`} className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-medium truncate">
                  {net.name}
                </CardTitle>
              </div>
              <CardDescription className="text-xs font-mono">
                {net.macAddress}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground block text-xs mb-0.5">Received</span>
                  <span className="font-medium">{formatBytes(net.totalReceived)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs mb-0.5">Transmitted</span>
                  <span className="font-medium">{formatBytes(net.totalTransmitted)}</span>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>Packets In: {net.packetsReceived.toLocaleString()}</div>
                <div>Packets Out: {net.packetsTransmitted.toLocaleString()}</div>
                {(net.errorsReceived > 0 || net.errorsTransmitted > 0) && (
                  <>
                    <div className="text-destructive">RX Errors: {net.errorsReceived}</div>
                    <div className="text-destructive">TX Errors: {net.errorsTransmitted}</div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
