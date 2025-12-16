/**
 * Speedtest Bandwidth Test Renderer
 *
 * Custom renderer for Ookla Speedtest results.
 * Shows download/upload speeds, ping, and star rating.
 */

import { Download, Upload, Wifi, Globe, Star, Info, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ServiceRendererProps } from './index';

// =============================================================================
// Types
// =============================================================================

interface SpeedtestData {
  type: 'speedtest_result';
  downloadMbps?: number;
  uploadMbps?: number;
  pingMs?: number;
  jitterMs?: number;
  server: string;
  isp: string;
  score: number;
  rating: number;
  verdict: string;
  resultUrl?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

function getSpeedColor(mbps?: number): string {
  if (mbps === undefined) return 'text-muted-foreground';
  if (mbps >= 100) return 'text-green-500';
  if (mbps >= 50) return 'text-emerald-500';
  if (mbps >= 25) return 'text-yellow-500';
  if (mbps >= 10) return 'text-orange-500';
  return 'text-red-500';
}

function getPingColor(ping?: number): string {
  if (ping === undefined) return 'text-muted-foreground';
  if (ping <= 20) return 'text-green-500';
  if (ping <= 50) return 'text-emerald-500';
  if (ping <= 100) return 'text-yellow-500';
  return 'text-red-500';
}

// =============================================================================
// Findings Variant
// =============================================================================

function FindingsRenderer({ result }: ServiceRendererProps) {
  const finding = result.findings[0];
  const data = finding?.data as SpeedtestData | undefined;

  if (!data || data.type !== 'speedtest_result') {
    return null;
  }

  const { downloadMbps, uploadMbps, pingMs, jitterMs, server, isp, rating, verdict, resultUrl } = data;
  const isGood = rating >= 4;

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden pt-0">
        <CardHeader className={`py-4 bg-gradient-to-r ${isGood ? 'from-green-500/10 to-emerald-500/10' : 'from-yellow-500/10 to-orange-500/10'}`}>
          <CardTitle className="text-base flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isGood ? 'bg-green-500/20' : 'bg-yellow-500/20'}`}>
              <Wifi className={`h-5 w-5 ${isGood ? 'text-green-500' : 'text-yellow-500'}`} />
            </div>
            Network Speed Test
            <span className={`ml-auto px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1 ${isGood ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'}`}>
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={`h-3 w-3 ${i < rating ? 'fill-current' : 'opacity-30'}`}
                />
              ))}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {/* Speed Stats */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* Download */}
            <div className="p-4 rounded-xl bg-muted/50 border text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Download className="h-5 w-5 text-blue-500" />
                <span className="text-sm text-muted-foreground">Download</span>
              </div>
              <div className={`text-3xl font-bold ${getSpeedColor(downloadMbps)}`}>
                {downloadMbps?.toFixed(1) ?? '—'}
              </div>
              <div className="text-xs text-muted-foreground">Mbps</div>
            </div>

            {/* Upload */}
            <div className="p-4 rounded-xl bg-muted/50 border text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Upload className="h-5 w-5 text-purple-500" />
                <span className="text-sm text-muted-foreground">Upload</span>
              </div>
              <div className={`text-3xl font-bold ${getSpeedColor(uploadMbps)}`}>
                {uploadMbps?.toFixed(1) ?? '—'}
              </div>
              <div className="text-xs text-muted-foreground">Mbps</div>
            </div>
          </div>

          {/* Ping & Info */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="p-3 rounded-lg bg-muted/30 border">
              <p className="text-xs text-muted-foreground">Ping</p>
              <p className={`text-lg font-bold ${getPingColor(pingMs)}`}>
                {pingMs?.toFixed(0) ?? '—'} ms
              </p>
            </div>
            {jitterMs !== undefined && (
              <div className="p-3 rounded-lg bg-muted/30 border">
                <p className="text-xs text-muted-foreground">Jitter</p>
                <p className="text-lg font-bold">{jitterMs.toFixed(1)} ms</p>
              </div>
            )}
            <div className="p-3 rounded-lg bg-muted/30 border">
              <p className="text-xs text-muted-foreground">ISP</p>
              <p className="text-sm font-medium truncate">{isp}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border">
              <p className="text-xs text-muted-foreground">Server</p>
              <p className="text-sm font-medium truncate">{server}</p>
            </div>
          </div>

          {/* Verdict */}
          <div className={`mt-4 p-3 rounded-lg flex items-center justify-between ${isGood ? 'bg-green-500/10' : 'bg-yellow-500/10'}`}>
            <div className="flex items-center gap-2">
              <Globe className={`h-5 w-5 ${isGood ? 'text-green-500' : 'text-yellow-500'}`} />
              <span className={`font-medium ${isGood ? 'text-green-500' : 'text-yellow-500'}`}>
                {verdict}
              </span>
            </div>
            {resultUrl && (
              <a
                href={resultUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                View Results <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {/* Recommendation */}
          {finding?.recommendation && (
            <div className="mt-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-start gap-2">
              <Info className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
              <span className="text-sm text-yellow-700 dark:text-yellow-300">
                {finding.recommendation}
              </span>
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
  const finding = result.findings[0];
  const data = finding?.data as SpeedtestData | undefined;

  if (!data || data.type !== 'speedtest_result') {
    return null;
  }

  const { downloadMbps, uploadMbps, pingMs, rating, verdict, isp } = data;
  const isGood = rating >= 4;

  return (
    <div className="p-4 border border-gray-200 rounded-lg bg-white">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${isGood ? 'bg-green-100' : 'bg-yellow-100'}`}>
          <Wifi className={`h-5 w-5 ${isGood ? 'text-green-600' : 'text-yellow-600'}`} />
        </div>
        <div className="flex-1">
          <p className="text-xs text-blue-600 uppercase tracking-wide font-medium">
            Internet Speed
          </p>
          <p className="text-xl font-bold text-gray-900">
            {verdict} ({rating}/5 ★)
          </p>
          <p className="text-sm text-gray-500">
            ↓ {downloadMbps?.toFixed(1)} Mbps / ↑ {uploadMbps?.toFixed(1)} Mbps / {pingMs?.toFixed(0)}ms ping
          </p>
          <p className="text-xs text-gray-400 mt-1">
            ISP: {isp}
          </p>
          {!isGood && finding?.recommendation && (
            <p className="text-sm text-yellow-600 mt-1">
              ⚠ {finding.recommendation}
            </p>
          )}
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

export function SpeedtestRenderer(props: ServiceRendererProps) {
  const { variant } = props;

  if (variant === 'customer') {
    return <CustomerRenderer {...props} />;
  }

  return <FindingsRenderer {...props} />;
}
