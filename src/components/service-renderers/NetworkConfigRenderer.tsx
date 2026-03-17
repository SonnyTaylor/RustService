/**
 * Network Configuration Renderer
 *
 * Custom renderer for network config analysis results.
 * Shows adapter details, DNS analysis, and connectivity status.
 */

import { Globe, Wifi, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ServiceCardWrapper } from './ServiceCardWrapper';
import type { ServiceRendererProps } from './index';

// =============================================================================
// Types
// =============================================================================

interface AdapterEntry {
  name: string;
  description: string;
  type: string;
  status: string;
  ipv4: string;
  ipv6: string;
  subnetMask: string;
  defaultGateway: string;
  dnsServers: string[];
  dhcpEnabled: boolean;
  dhcpServer: string;
  macAddress: string;
  adminState: string;
}

interface DnsEntry {
  server: string;
  provider: string;
  adapter: string;
}

interface NetworkData {
  type: 'network_config';
  totalAdapters: number;
  connectedAdapters: number;
  ipv6Adapters: number;
  adapters: AdapterEntry[];
  dnsAnalysis: DnsEntry[];
  includeDisabled: boolean;
}

// =============================================================================
// Findings Variant
// =============================================================================

function FindingsRenderer({ definition, result }: ServiceRendererProps) {
  const finding = result.findings[0];
  const data = finding?.data as NetworkData | undefined;

  if (!data || data.type !== 'network_config') return null;

  const hasConnection = data.connectedAdapters > 0;

  const getAdapterStatusIcon = (status: string) => {
    if (status === 'Connected') return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (status === 'Disconnected') return <XCircle className="h-4 w-4 text-muted-foreground" />;
    return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
  };

  const getAdapterStatusColor = (status: string) => {
    if (status === 'Connected') return 'border-green-500/20 bg-green-500/5';
    if (status === 'Disconnected') return 'border-muted bg-muted/20';
    return 'border-yellow-500/20 bg-yellow-500/5';
  };

  return (
    <ServiceCardWrapper
      definition={definition}
      result={result}
      statusBadge={hasConnection
        ? { label: `${data.connectedAdapters} Connected`, color: 'green' }
        : { label: 'No Connection', color: 'red' }}
    >
      <div className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-muted/30 border text-center">
            <p className="text-2xl font-bold">{data.totalAdapters}</p>
            <p className="text-xs text-muted-foreground">Adapters</p>
          </div>
          <div className={`p-3 rounded-lg border text-center ${hasConnection ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
            <p className={`text-2xl font-bold ${hasConnection ? 'text-green-500' : 'text-red-500'}`}>{data.connectedAdapters}</p>
            <p className="text-xs text-muted-foreground">Connected</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/30 border text-center">
            <p className="text-2xl font-bold">{data.ipv6Adapters}</p>
            <p className="text-xs text-muted-foreground">IPv6</p>
          </div>
        </div>

        {/* Adapter Cards */}
        <div className="space-y-3">
          {data.adapters.map((adapter, i) => (
            <div key={i} className={`p-3 rounded-lg border ${getAdapterStatusColor(adapter.status)}`}>
              <div className="flex items-center gap-2 mb-2">
                {getAdapterStatusIcon(adapter.status)}
                <p className="font-medium text-sm flex-1">{adapter.name}</p>
                <Badge variant="outline" className="text-xs">{adapter.status}</Badge>
              </div>
              {adapter.description && (
                <p className="text-xs text-muted-foreground mb-2">{adapter.description}</p>
              )}
              {adapter.status === 'Connected' && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {adapter.ipv4 && (
                    <>
                      <span className="text-muted-foreground">IPv4</span>
                      <span className="font-mono">{adapter.ipv4}</span>
                    </>
                  )}
                  {adapter.subnetMask && (
                    <>
                      <span className="text-muted-foreground">Subnet</span>
                      <span className="font-mono">{adapter.subnetMask}</span>
                    </>
                  )}
                  {adapter.defaultGateway && (
                    <>
                      <span className="text-muted-foreground">Gateway</span>
                      <span className="font-mono">{adapter.defaultGateway}</span>
                    </>
                  )}
                  {adapter.dnsServers.length > 0 && (
                    <>
                      <span className="text-muted-foreground">DNS</span>
                      <span className="font-mono">{adapter.dnsServers.join(', ')}</span>
                    </>
                  )}
                  <span className="text-muted-foreground">DHCP</span>
                  <span>{adapter.dhcpEnabled ? 'Enabled' : 'Static'}</span>
                  {adapter.macAddress && (
                    <>
                      <span className="text-muted-foreground">MAC</span>
                      <span className="font-mono">{adapter.macAddress}</span>
                    </>
                  )}
                  {adapter.ipv6 && (
                    <>
                      <span className="text-muted-foreground">IPv6</span>
                      <span className="font-mono text-xs break-all">{adapter.ipv6}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* DNS Analysis */}
        {data.dnsAnalysis.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">DNS Servers</p>
            <div className="space-y-1.5">
              {data.dnsAnalysis.map((dns, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 border text-sm">
                  <Wifi className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-mono">{dns.server}</span>
                  <Badge variant="outline" className="text-xs ml-auto">{dns.provider}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ServiceCardWrapper>
  );
}

// =============================================================================
// Customer Print Variant
// =============================================================================

function CustomerRenderer({ result }: ServiceRendererProps) {
  const finding = result.findings[0];
  const data = finding?.data as NetworkData | undefined;

  if (!data || data.type !== 'network_config') return null;

  const hasConnection = data.connectedAdapters > 0;
  const connectedAdapters = data.adapters.filter(a => a.status === 'Connected');

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${hasConnection ? 'bg-green-100' : 'bg-red-100'}`}>
          <Globe className={`h-5 w-5 ${hasConnection ? 'text-green-600' : 'text-red-600'}`} />
        </div>
        <div className="flex-1">
          <p className="font-bold text-gray-800">
            {hasConnection ? '✓ Network Connected' : '✗ No Network Connection'}
          </p>
          <p className="text-sm text-gray-500">
            {connectedAdapters.map(a => `${a.name}: ${a.ipv4}`).join(' | ') || 'No connected adapters'}
          </p>
        </div>
        <div className={`text-2xl ${hasConnection ? 'text-green-500' : 'text-red-500'}`}>
          {hasConnection ? '✓' : '✗'}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Renderer
// =============================================================================

export function NetworkConfigRenderer(props: ServiceRendererProps) {
  if (props.variant === 'customer') return <CustomerRenderer {...props} />;
  return <FindingsRenderer {...props} />;
}
