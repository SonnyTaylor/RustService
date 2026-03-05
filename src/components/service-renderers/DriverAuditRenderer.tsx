/**
 * Driver Audit Renderer
 *
 * Custom renderer for driverquery results.
 * Shows driver inventory with filterable table and problem highlights.
 */

import { useState } from 'react';
import { Cpu, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import type { ServiceRendererProps } from './index';

// =============================================================================
// Types
// =============================================================================

interface DriverEntry {
  moduleName: string;
  displayName: string;
  driverType: string;
  startMode: string;
  state: string;
  status: string;
  linkDate: string;
  path: string;
}

interface DriverData {
  type: 'driver_audit';
  totalDrivers: number;
  runningDrivers: number;
  stoppedDrivers: number;
  problemDrivers: number;
  drivers: DriverEntry[];
  showAll: boolean;
  error?: boolean;
}

// =============================================================================
// Findings Variant
// =============================================================================

function FindingsRenderer({ result }: ServiceRendererProps) {
  const finding = result.findings[0];
  const data = finding?.data as DriverData | undefined;
  const [search, setSearch] = useState('');

  if (!data || data.type !== 'driver_audit') return null;
  if (data.error) return null;

  const hasProblems = data.problemDrivers > 0;

  const getStatusColor = () => {
    if (hasProblems) return 'from-yellow-500/10 to-orange-500/10 dark:from-yellow-500/20 dark:to-orange-500/20';
    return 'from-green-500/10 to-emerald-500/10 dark:from-green-500/20 dark:to-emerald-500/20';
  };

  const filteredDrivers = data.drivers.filter(d =>
    d.displayName.toLowerCase().includes(search.toLowerCase()) ||
    d.moduleName.toLowerCase().includes(search.toLowerCase()) ||
    d.path.toLowerCase().includes(search.toLowerCase())
  );

  const getStateBadge = (state: string, status: string) => {
    if (status !== 'OK') {
      return <Badge className="bg-red-500/10 text-red-500 border-red-500/20 text-xs">{status}</Badge>;
    }
    if (state === 'Running') {
      return <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-xs">Running</Badge>;
    }
    if (state === 'Stopped') {
      return <Badge className="bg-muted text-muted-foreground border text-xs">Stopped</Badge>;
    }
    return <Badge variant="outline" className="text-xs">{state}</Badge>;
  };

  return (
    <Card className="overflow-hidden border-0 shadow-lg">
      <CardHeader className={`px-4 py-2 bg-gradient-to-r ${getStatusColor()}`}>
        <CardTitle className="flex items-center gap-2 text-sm">
          <div className={`p-2 rounded-lg ${hasProblems ? 'bg-yellow-500/20 text-yellow-500' : 'bg-green-500/20 text-green-500'}`}>
            <Cpu className="h-5 w-5" />
          </div>
          Driver Audit
          <Badge className={`ml-auto ${hasProblems ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' : 'bg-green-500/10 text-green-500 border-green-500/20'}`}>
            {data.totalDrivers} Drivers
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-3 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-muted/30 border text-center">
            <p className="text-2xl font-bold">{data.totalDrivers}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
            <p className="text-2xl font-bold text-green-500">{data.runningDrivers}</p>
            <p className="text-xs text-muted-foreground">Running</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/30 border text-center">
            <p className="text-2xl font-bold">{data.stoppedDrivers}</p>
            <p className="text-xs text-muted-foreground">Stopped</p>
          </div>
          <div className={`p-3 rounded-lg border text-center ${data.problemDrivers > 0 ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-muted/30'}`}>
            <p className={`text-2xl font-bold ${data.problemDrivers > 0 ? 'text-yellow-500' : ''}`}>{data.problemDrivers}</p>
            <p className="text-xs text-muted-foreground">Issues</p>
          </div>
        </div>

        {/* Search */}
        {data.drivers.length > 5 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search drivers..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        )}

        {/* Driver List */}
        <div className="max-h-80 overflow-y-auto space-y-1.5">
          {filteredDrivers.map((driver, i) => (
            <div
              key={i}
              className={`p-2.5 rounded-lg border text-sm ${
                driver.status !== 'OK'
                  ? 'bg-yellow-500/10 border-yellow-500/20'
                  : 'bg-muted/20'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{driver.displayName}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {driver.moduleName} · {driver.driverType} · {driver.startMode}
                  </p>
                </div>
                {getStateBadge(driver.state, driver.status)}
              </div>
            </div>
          ))}
          {filteredDrivers.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              {search ? 'No matching drivers' : 'No drivers to display'}
            </p>
          )}
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
  const data = finding?.data as DriverData | undefined;

  if (!data || data.type !== 'driver_audit') return null;

  const isGood = data.problemDrivers === 0;

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${isGood ? 'bg-green-100' : 'bg-yellow-100'}`}>
          <Cpu className={`h-5 w-5 ${isGood ? 'text-green-600' : 'text-yellow-600'}`} />
        </div>
        <div className="flex-1">
          <p className="font-bold text-gray-800">
            {isGood ? '✓ All Drivers Healthy' : `⚠ ${data.problemDrivers} Driver Issue(s)`}
          </p>
          <p className="text-sm text-gray-500">
            {data.totalDrivers} drivers installed: {data.runningDrivers} running, {data.stoppedDrivers} stopped
          </p>
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

export function DriverAuditRenderer(props: ServiceRendererProps) {
  if (props.variant === 'customer') return <CustomerRenderer {...props} />;
  return <FindingsRenderer {...props} />;
}
