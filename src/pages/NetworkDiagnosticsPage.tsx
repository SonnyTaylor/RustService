/**
 * Network Diagnostics Page
 * 
 * Advanced network diagnostic tools including ping, traceroute,
 * DNS lookup, and WiFi signal information.
 */

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Wifi,
  Network,
  Globe,
  Search,
  Play,
  RefreshCw,
  Router,
  Signal,
  ArrowRight,
  Clock,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import type {
  NetworkInterfaceDetails,
  PingResult,
  TracerouteResult,
  DnsLookupResult,
  WifiInfo,
} from '@/types';

/**
 * Network Diagnostics Page - Main component
 */
export function NetworkDiagnosticsPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [interfaces, setInterfaces] = useState<NetworkInterfaceDetails[]>([]);
  const [wifiInfo, setWifiInfo] = useState<WifiInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // Ping state
  const [pingHost, setPingHost] = useState('google.com');
  const [pingCount, setPingCount] = useState('4');
  const [pingResult, setPingResult] = useState<PingResult | null>(null);
  const [pinging, setPinging] = useState(false);

  // Traceroute state
  const [traceHost, setTraceHost] = useState('google.com');
  const [traceResult, setTraceResult] = useState<TracerouteResult | null>(null);
  const [tracing, setTracing] = useState(false);

  // DNS state
  const [dnsQuery, setDnsQuery] = useState('google.com');
  const [dnsType, setDnsType] = useState('A');
  const [dnsResult, setDnsResult] = useState<DnsLookupResult | null>(null);
  const [resolving, setResolving] = useState(false);

  // Load network info on mount
  useEffect(() => {
    loadNetworkInfo();
  }, []);

  const loadNetworkInfo = async () => {
    setLoading(true);
    try {
      const [ifaces, wifi] = await Promise.all([
        invoke<NetworkInterfaceDetails[]>('get_detailed_network_info'),
        invoke<WifiInfo>('get_wifi_info'),
      ]);
      setInterfaces(ifaces);
      setWifiInfo(wifi);
    } catch (error) {
      console.error('Failed to load network info:', error);
    } finally {
      setLoading(false);
    }
  };

  const runPing = async () => {
    setPinging(true);
    setPingResult(null);
    try {
      const result = await invoke<PingResult>('ping_host', {
        host: pingHost,
        count: parseInt(pingCount) || 4,
      });
      setPingResult(result);
    } catch (error) {
      console.error('Ping failed:', error);
    } finally {
      setPinging(false);
    }
  };

  const runTraceroute = async () => {
    setTracing(true);
    setTraceResult(null);
    try {
      const result = await invoke<TracerouteResult>('trace_route', {
        host: traceHost,
      });
      setTraceResult(result);
    } catch (error) {
      console.error('Traceroute failed:', error);
    } finally {
      setTracing(false);
    }
  };

  const runDnsLookup = async () => {
    setResolving(true);
    setDnsResult(null);
    try {
      const result = await invoke<DnsLookupResult>('dns_lookup', {
        domain: dnsQuery,
        recordType: dnsType,
      });
      setDnsResult(result);
    } catch (error) {
      console.error('DNS lookup failed:', error);
    } finally {
      setResolving(false);
    }
  };

  const getSignalIcon = (percent: number | null) => {
    if (percent === null) return <Signal className="h-5 w-5 text-muted-foreground" />;
    if (percent >= 70) return <Signal className="h-5 w-5 text-green-500" />;
    if (percent >= 40) return <Signal className="h-5 w-5 text-yellow-500" />;
    return <Signal className="h-5 w-5 text-red-500" />;
  };

  return (
    <div className="h-full flex flex-col overflow-hidden min-h-0">
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Network className="h-6 w-6" />
                Network Diagnostics
              </h2>
              <p className="text-muted-foreground text-sm mt-1">
                Advanced network testing and troubleshooting tools
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={loadNetworkInfo} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="overview" className="gap-2">
                <Network className="h-4 w-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="ping" className="gap-2">
                <Globe className="h-4 w-4" />
                Ping
              </TabsTrigger>
              <TabsTrigger value="traceroute" className="gap-2">
                <Router className="h-4 w-4" />
                Traceroute
              </TabsTrigger>
              <TabsTrigger value="dns" className="gap-2">
                <Search className="h-4 w-4" />
                DNS Lookup
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6 mt-4">
              {/* WiFi Info Card */}
              {wifiInfo && wifiInfo.connected && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Wifi className="h-5 w-5 text-blue-500" />
                      WiFi Connection
                    </CardTitle>
                    <CardDescription>
                      Connected to {wifiInfo.ssid || 'Unknown Network'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Signal Strength</span>
                        <div className="flex items-center gap-2">
                          {getSignalIcon(wifiInfo.signalPercent)}
                          <span className="font-medium">{wifiInfo.signalPercent ?? 'N/A'}%</span>
                        </div>
                        {wifiInfo.signalPercent && (
                          <Progress value={wifiInfo.signalPercent} className="h-1.5" />
                        )}
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Channel</span>
                        <div className="font-medium">{wifiInfo.channel ?? 'N/A'}</div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Frequency</span>
                        <div className="font-medium">
                          {wifiInfo.frequencyMhz ? `${wifiInfo.frequencyMhz} MHz` : 'N/A'}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Radio Type</span>
                        <div className="font-medium">{wifiInfo.radioType ?? 'N/A'}</div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Authentication</span>
                        <div className="font-medium">{wifiInfo.authentication ?? 'N/A'}</div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Receive Rate</span>
                        <div className="font-medium">
                          {wifiInfo.receiveRateMbps ? `${wifiInfo.receiveRateMbps} Mbps` : 'N/A'}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">Transmit Rate</span>
                        <div className="font-medium">
                          {wifiInfo.transmitRateMbps ? `${wifiInfo.transmitRateMbps} Mbps` : 'N/A'}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs text-muted-foreground">BSSID</span>
                        <div className="font-mono text-xs">{wifiInfo.bssid ?? 'N/A'}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Network Interfaces */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Network Interfaces</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {interfaces.map((iface, index) => (
                    <Card key={index}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base font-medium">{iface.name}</CardTitle>
                          <Badge variant={iface.status === 'Up' ? 'default' : 'secondary'}>
                            {iface.status}
                          </Badge>
                        </div>
                        <CardDescription className="text-xs">
                          {iface.description}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {iface.ipv4Addresses.length > 0 && (
                          <div>
                            <span className="text-xs text-muted-foreground">IPv4</span>
                            <div className="font-mono text-sm">
                              {iface.ipv4Addresses.join(', ')}
                            </div>
                          </div>
                        )}
                        {iface.gateway && (
                          <div>
                            <span className="text-xs text-muted-foreground">Gateway</span>
                            <div className="font-mono text-sm">{iface.gateway}</div>
                          </div>
                        )}
                        {iface.dnsServers.length > 0 && (
                          <div>
                            <span className="text-xs text-muted-foreground">DNS Servers</span>
                            <div className="font-mono text-sm">
                              {iface.dnsServers.slice(0, 2).join(', ')}
                            </div>
                          </div>
                        )}
                        <Separator />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>MAC: {iface.macAddress || 'N/A'}</span>
                          <span>{iface.speedMbps ? `${iface.speedMbps} Mbps` : ''}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Ping Tab */}
            <TabsContent value="ping" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Ping Test</CardTitle>
                  <CardDescription>
                    Test connectivity and measure latency to a host
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Host or IP address"
                      value={pingHost}
                      onChange={(e) => setPingHost(e.target.value)}
                      className="flex-1"
                    />
                    <Select value={pingCount} onValueChange={setPingCount}>
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="4">4 pings</SelectItem>
                        <SelectItem value="8">8 pings</SelectItem>
                        <SelectItem value="16">16 pings</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button onClick={runPing} disabled={pinging || !pingHost}>
                      {pinging ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  {/* Ping Results */}
                  {pingResult && (
                    <div className="space-y-4">
                      <Separator />
                      <div className="flex items-center gap-4">
                        <div>
                          <span className="text-sm text-muted-foreground">Host</span>
                          <div className="font-medium">
                            {pingResult.host}
                            {pingResult.resolvedIp && (
                              <span className="text-muted-foreground ml-2">
                                [{pingResult.resolvedIp}]
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Stats Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div className="text-center p-3 bg-muted rounded-lg">
                          <div className="text-2xl font-bold">
                            {pingResult.packetsReceived}/{pingResult.packetsSent}
                          </div>
                          <div className="text-xs text-muted-foreground">Packets</div>
                        </div>
                        <div className="text-center p-3 bg-muted rounded-lg">
                          <div className={`text-2xl font-bold ${
                            pingResult.packetLossPercent > 0 ? 'text-destructive' : 'text-green-500'
                          }`}>
                            {pingResult.packetLossPercent}%
                          </div>
                          <div className="text-xs text-muted-foreground">Packet Loss</div>
                        </div>
                        <div className="text-center p-3 bg-muted rounded-lg">
                          <div className="text-2xl font-bold">
                            {pingResult.minMs?.toFixed(0) ?? '-'}
                          </div>
                          <div className="text-xs text-muted-foreground">Min (ms)</div>
                        </div>
                        <div className="text-center p-3 bg-muted rounded-lg">
                          <div className="text-2xl font-bold text-primary">
                            {pingResult.avgMs?.toFixed(0) ?? '-'}
                          </div>
                          <div className="text-xs text-muted-foreground">Avg (ms)</div>
                        </div>
                        <div className="text-center p-3 bg-muted rounded-lg">
                          <div className="text-2xl font-bold">
                            {pingResult.maxMs?.toFixed(0) ?? '-'}
                          </div>
                          <div className="text-xs text-muted-foreground">Max (ms)</div>
                        </div>
                      </div>

                      {/* Individual Replies */}
                      <div className="space-y-1">
                        {pingResult.replies.map((reply, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-3 p-2 rounded text-sm"
                          >
                            {reply.status === 'Success' ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-destructive" />
                            )}
                            <span className="text-muted-foreground">#{reply.seq}</span>
                            {reply.status === 'Success' ? (
                              <>
                                <span>{reply.timeMs?.toFixed(1) ?? '<1'} ms</span>
                                <span className="text-muted-foreground">TTL={reply.ttl}</span>
                              </>
                            ) : (
                              <span className="text-destructive">{reply.status}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Traceroute Tab */}
            <TabsContent value="traceroute" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Traceroute</CardTitle>
                  <CardDescription>
                    Trace the network path to a destination
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Host or IP address"
                      value={traceHost}
                      onChange={(e) => setTraceHost(e.target.value)}
                      className="flex-1"
                    />
                    <Button onClick={runTraceroute} disabled={tracing || !traceHost}>
                      {tracing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  {tracing && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Running traceroute... This may take a while.</span>
                    </div>
                  )}

                  {/* Traceroute Results */}
                  {traceResult && (
                    <div className="space-y-4">
                      <Separator />
                      <div className="flex items-center gap-2">
                        <span className="text-sm">Tracing route to</span>
                        <Badge variant="outline">{traceResult.host}</Badge>
                        {traceResult.resolvedIp && (
                          <span className="text-muted-foreground font-mono text-sm">
                            [{traceResult.resolvedIp}]
                          </span>
                        )}
                        {traceResult.completed && (
                          <Badge variant="default" className="ml-auto">Complete</Badge>
                        )}
                      </div>

                      {/* Hops */}
                      <div className="space-y-1">
                        {traceResult.hops.map((hop, idx) => (
                          <div
                            key={idx}
                            className={`flex items-center gap-3 p-2 rounded text-sm ${
                              hop.timedOut ? 'text-muted-foreground' : ''
                            }`}
                          >
                            <span className="w-8 text-right font-mono">{hop.hopNumber}</span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground" />
                            {hop.timedOut ? (
                              <span className="text-muted-foreground">* Request timed out *</span>
                            ) : (
                              <>
                                <span className="font-mono min-w-32">
                                  {hop.ipAddress || 'Unknown'}
                                </span>
                                <div className="flex gap-2 text-xs">
                                  <Badge variant="secondary">
                                    {hop.rtt1Ms?.toFixed(0) ?? '*'} ms
                                  </Badge>
                                  <Badge variant="secondary">
                                    {hop.rtt2Ms?.toFixed(0) ?? '*'} ms
                                  </Badge>
                                  <Badge variant="secondary">
                                    {hop.rtt3Ms?.toFixed(0) ?? '*'} ms
                                  </Badge>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* DNS Tab */}
            <TabsContent value="dns" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">DNS Lookup</CardTitle>
                  <CardDescription>
                    Resolve domain names to IP addresses
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Domain name (e.g., google.com)"
                      value={dnsQuery}
                      onChange={(e) => setDnsQuery(e.target.value)}
                      className="flex-1"
                    />
                    <Select value={dnsType} onValueChange={setDnsType}>
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A">A</SelectItem>
                        <SelectItem value="AAAA">AAAA</SelectItem>
                        <SelectItem value="MX">MX</SelectItem>
                        <SelectItem value="NS">NS</SelectItem>
                        <SelectItem value="TXT">TXT</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button onClick={runDnsLookup} disabled={resolving || !dnsQuery}>
                      {resolving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  {/* DNS Results */}
                  {dnsResult && (
                    <div className="space-y-4">
                      <Separator />
                      <div className="flex items-center gap-4">
                        <div>
                          <span className="text-sm text-muted-foreground">Query</span>
                          <div className="font-medium">{dnsResult.query}</div>
                        </div>
                        <div>
                          <span className="text-sm text-muted-foreground">Type</span>
                          <div className="font-medium">{dnsResult.queryType}</div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm">{dnsResult.responseTimeMs} ms</span>
                        </div>
                        {dnsResult.serverUsed && (
                          <div className="text-sm text-muted-foreground">
                            Server: {dnsResult.serverUsed}
                          </div>
                        )}
                      </div>

                      {dnsResult.error ? (
                        <div className="flex items-center gap-2 text-destructive">
                          <AlertCircle className="h-4 w-4" />
                          {dnsResult.error}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {dnsResult.answers.map((record, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-3 p-3 bg-muted rounded-lg"
                            >
                              <Badge variant="outline">{record.recordType}</Badge>
                              <span className="font-mono">{record.value}</span>
                              {record.ttl && (
                                <span className="text-xs text-muted-foreground ml-auto">
                                  TTL: {record.ttl}
                                </span>
                              )}
                            </div>
                          ))}
                          {dnsResult.answers.length === 0 && (
                            <div className="text-muted-foreground">No records found</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}
