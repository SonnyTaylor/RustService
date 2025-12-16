/**
 * Network Diagnostics Types
 * 
 * TypeScript interfaces for network diagnostic tools.
 */

/** Detailed network interface information */
export interface NetworkInterfaceDetails {
  name: string;
  description: string;
  macAddress: string | null;
  ipv4Addresses: string[];
  ipv6Addresses: string[];
  gateway: string | null;
  dnsServers: string[];
  status: string;
  speedMbps: number | null;
  interfaceType: string;
}

/** Ping result for a single host */
export interface PingResult {
  host: string;
  resolvedIp: string | null;
  packetsSent: number;
  packetsReceived: number;
  packetLossPercent: number;
  minMs: number | null;
  maxMs: number | null;
  avgMs: number | null;
  replies: PingReply[];
  error: string | null;
}

/** Individual ping reply */
export interface PingReply {
  seq: number;
  ttl: number | null;
  timeMs: number | null;
  status: string;
}

/** Traceroute result */
export interface TracerouteResult {
  host: string;
  resolvedIp: string | null;
  hops: TracerouteHop[];
  completed: boolean;
  error: string | null;
}

/** Single hop in a traceroute */
export interface TracerouteHop {
  hopNumber: number;
  hostname: string | null;
  ipAddress: string | null;
  rtt1Ms: number | null;
  rtt2Ms: number | null;
  rtt3Ms: number | null;
  timedOut: boolean;
}

/** DNS lookup result */
export interface DnsLookupResult {
  query: string;
  queryType: string;
  answers: DnsRecord[];
  responseTimeMs: number;
  serverUsed: string | null;
  error: string | null;
}

/** DNS record */
export interface DnsRecord {
  recordType: string;
  value: string;
  ttl: number | null;
}

/** WiFi information */
export interface WifiInfo {
  connected: boolean;
  ssid: string | null;
  bssid: string | null;
  signalPercent: number | null;
  channel: number | null;
  frequencyMhz: number | null;
  radioType: string | null;
  authentication: string | null;
  receiveRateMbps: number | null;
  transmitRateMbps: number | null;
  error: string | null;
}

/** Get signal strength color based on percentage */
export function getSignalColor(percent: number | null): string {
  if (percent === null) return 'gray';
  if (percent >= 70) return 'green';
  if (percent >= 40) return 'yellow';
  return 'red';
}

/** Get signal strength label based on percentage */
export function getSignalLabel(percent: number | null): string {
  if (percent === null) return 'Unknown';
  if (percent >= 70) return 'Excellent';
  if (percent >= 50) return 'Good';
  if (percent >= 30) return 'Fair';
  return 'Poor';
}
