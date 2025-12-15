/**
 * Ping Test Service Renderer
 *
 * Custom renderer for the ping-test service results.
 * Shows network latency and packet loss findings with visual indicators.
 */

import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Wifi,
  Signal,
  SignalZero,
  Clock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { ServiceRendererProps } from './index';

// =============================================================================
// Types
// =============================================================================

interface LatencyData {
  avgLatency: number;
  target: string;
  type: 'latency';
}

interface PacketLossData {
  packetLoss: number;
  type: 'packet_loss';
}

// =============================================================================
// Helper Functions
// =============================================================================

function getLatencyColor(latency: number): string {
  if (latency < 50) return 'text-green-500';
  if (latency < 100) return 'text-blue-500';
  if (latency < 200) return 'text-yellow-500';
  return 'text-red-500';
}

function getLatencyBgColor(latency: number): string {
  if (latency < 50) return 'bg-green-500';
  if (latency < 100) return 'bg-blue-500';
  if (latency < 200) return 'bg-yellow-500';
  return 'bg-red-500';
}

function getPacketLossColor(loss: number): string {
  if (loss === 0) return 'text-green-500';
  if (loss < 10) return 'text-yellow-500';
  return 'text-red-500';
}

function getLatencyLabel(latency: number): string {
  if (latency < 50) return 'Excellent';
  if (latency < 100) return 'Good';
  if (latency < 200) return 'Fair';
  return 'Poor';
}

// =============================================================================
// Findings Variant
// =============================================================================

function FindingsRenderer({ result }: ServiceRendererProps) {
  // Extract latency and packet loss data from findings
  const latencyFinding = result.findings.find(
    (f) => (f.data as LatencyData | undefined)?.type === 'latency'
  );
  const packetLossFinding = result.findings.find(
    (f) => (f.data as PacketLossData | undefined)?.type === 'packet_loss'
  );

  const latencyData = latencyFinding?.data as LatencyData | undefined;
  const packetLossData = packetLossFinding?.data as PacketLossData | undefined;

  return (
    <div className="space-y-4">
      {/* Network Status Overview */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-3 bg-gradient-to-r from-blue-500/10 to-cyan-500/10">
          <CardTitle className="text-base flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Wifi className="h-5 w-5 text-blue-500" />
            </div>
            Network Connectivity Test
            <span
              className={`ml-auto px-2 py-0.5 rounded text-xs font-medium ${
                result.success ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
              }`}
            >
              {result.success ? 'PASS' : 'FAIL'}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Latency Card */}
            {latencyData && (
              <div className="p-4 rounded-xl bg-muted/50 border">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                  <Clock className="h-4 w-4" />
                  Latency
                </div>
                <div className={`text-3xl font-bold ${getLatencyColor(latencyData.avgLatency)}`}>
                  {Math.round(latencyData.avgLatency)}
                  <span className="text-lg font-normal">ms</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Target: {latencyData.target}</span>
                  <span className={getLatencyColor(latencyData.avgLatency)}>
                    {getLatencyLabel(latencyData.avgLatency)}
                  </span>
                </div>
                <div className="mt-3">
                  <Progress
                    value={Math.min(100, (latencyData.avgLatency / 200) * 100)}
                    className={`h-2 ${getLatencyBgColor(latencyData.avgLatency)}`}
                  />
                </div>
              </div>
            )}

            {/* Packet Loss Card */}
            {packetLossData && (
              <div className="p-4 rounded-xl bg-muted/50 border">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
                  {packetLossData.packetLoss === 0 ? (
                    <Signal className="h-4 w-4" />
                  ) : (
                    <SignalZero className="h-4 w-4" />
                  )}
                  Packet Loss
                </div>
                <div className={`text-3xl font-bold ${getPacketLossColor(packetLossData.packetLoss)}`}>
                  {packetLossData.packetLoss}
                  <span className="text-lg font-normal">%</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  {packetLossData.packetLoss === 0 ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span className="text-sm text-green-500">No packets lost</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      <span className="text-sm text-yellow-500">Connection unstable</span>
                    </>
                  )}
                </div>
                <div className="mt-3">
                  <Progress
                    value={packetLossData.packetLoss}
                    className={`h-2 ${packetLossData.packetLoss === 0 ? 'bg-green-500' : 'bg-yellow-500'}`}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Error state */}
          {result.error && (
            <div className="mt-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="flex items-center gap-2 text-red-500">
                <XCircle className="h-4 w-4" />
                <span className="font-medium">Error</span>
              </div>
              <p className="mt-1 text-sm text-red-400">{result.error}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Customer Print Variant
// =============================================================================

function CustomerRenderer({ result }: ServiceRendererProps) {
  const latencyFinding = result.findings.find(
    (f) => (f.data as LatencyData | undefined)?.type === 'latency'
  );
  const packetLossFinding = result.findings.find(
    (f) => (f.data as PacketLossData | undefined)?.type === 'packet_loss'
  );

  const latencyData = latencyFinding?.data as LatencyData | undefined;
  const packetLossData = packetLossFinding?.data as PacketLossData | undefined;

  const isHealthy = latencyData
    ? latencyData.avgLatency < 100 && (packetLossData?.packetLoss || 0) === 0
    : false;

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${isHealthy ? 'bg-green-100' : 'bg-yellow-100'}`}>
          <Wifi className={`h-5 w-5 ${isHealthy ? 'text-green-600' : 'text-yellow-600'}`} />
        </div>
        <div className="flex-1">
          <p className="text-xs text-blue-600 uppercase tracking-wide font-medium">
            Internet Connection
          </p>
          <p className="text-xl font-bold text-gray-900">
            {isHealthy ? 'Connection Stable' : 'Connection Issues Detected'}
          </p>
          <p className="text-sm text-gray-500">
            {latencyData
              ? `Response time: ${Math.round(latencyData.avgLatency)}ms`
              : 'Unable to measure connection speed'}
          </p>
          {!isHealthy && latencyFinding?.recommendation && (
            <p className="text-sm text-yellow-600 mt-1">
              ⚠ {latencyFinding.recommendation}
            </p>
          )}
        </div>
        <div className={`text-2xl ${isHealthy ? 'text-green-500' : 'text-yellow-500'}`}>
          {isHealthy ? '✓' : '⚠'}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Renderer
// =============================================================================

export function PingTestRenderer(props: ServiceRendererProps) {
  const { variant } = props;

  if (variant === 'customer') {
    return <CustomerRenderer {...props} />;
  }

  return <FindingsRenderer {...props} />;
}
