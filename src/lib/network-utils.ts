/**
 * Network diagnostics formatting utilities
 *
 * Pure functions for formatting ping, traceroute, and DNS results as text.
 */

import type { PingResult, TracerouteResult, DnsLookupResult } from '@/types';

export function formatPingResults(pingResult: PingResult): string {
  const lines = [
    `Ping Results: ${pingResult.host}`,
    pingResult.resolvedIp ? `Resolved IP: ${pingResult.resolvedIp}` : '',
    '',
    `Packets: ${pingResult.packetsReceived}/${pingResult.packetsSent} received`,
    `Packet Loss: ${pingResult.packetLossPercent}%`,
    `Min: ${pingResult.minMs?.toFixed(1) ?? '-'} ms`,
    `Avg: ${pingResult.avgMs?.toFixed(1) ?? '-'} ms`,
    `Max: ${pingResult.maxMs?.toFixed(1) ?? '-'} ms`,
    '',
    'Replies:',
    ...pingResult.replies.map((r) =>
      r.status === 'Success'
        ? `  #${r.seq}: ${r.timeMs?.toFixed(1) ?? '<1'} ms (TTL=${r.ttl})`
        : `  #${r.seq}: ${r.status}`
    ),
  ];
  return lines.filter((l) => l !== undefined).join('\n');
}

export function formatTracerouteResults(
  traceResult: TracerouteResult
): string {
  const lines = [
    `Traceroute to ${traceResult.host}`,
    traceResult.resolvedIp
      ? `Resolved IP: ${traceResult.resolvedIp}`
      : '',
    traceResult.completed ? 'Status: Complete' : 'Status: Incomplete',
    '',
    'Hops:',
    ...traceResult.hops.map((hop) =>
      hop.timedOut
        ? `  ${hop.hopNumber}  * Request timed out`
        : `  ${hop.hopNumber}  ${hop.ipAddress || 'Unknown'}  ${hop.rtt1Ms?.toFixed(0) ?? '*'}ms  ${hop.rtt2Ms?.toFixed(0) ?? '*'}ms  ${hop.rtt3Ms?.toFixed(0) ?? '*'}ms`
    ),
  ];
  return lines.filter((l) => l !== undefined).join('\n');
}

export function formatDnsResults(dnsResult: DnsLookupResult): string {
  const lines = [
    `DNS Lookup: ${dnsResult.query} (${dnsResult.queryType})`,
    `Response Time: ${dnsResult.responseTimeMs} ms`,
    dnsResult.serverUsed ? `Server: ${dnsResult.serverUsed}` : '',
    '',
  ];
  if (dnsResult.error) {
    lines.push(`Error: ${dnsResult.error}`);
  } else {
    lines.push('Answers:');
    dnsResult.answers.forEach((record) => {
      lines.push(
        `  ${record.recordType}  ${record.value}${record.ttl ? `  TTL: ${record.ttl}` : ''}`
      );
    });
    if (dnsResult.answers.length === 0) {
      lines.push('  No records found');
    }
  }
  return lines.filter((l) => l !== undefined).join('\n');
}
