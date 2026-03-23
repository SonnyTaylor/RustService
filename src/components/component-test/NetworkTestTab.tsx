/**
 * Network Test Tab
 *
 * Tests network connectivity and measures latency to common servers
 * (Google, Cloudflare, Microsoft) via the Tauri backend.
 */

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Wifi,
  RefreshCw,
  XCircle,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface NetworkTestResult {
  isOnline: boolean;
  latencyMs: number | null;
  error: string | null;
}

export function NetworkTestTab() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<NetworkTestResult | null>(null);

  // Online status listener
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Network test using Tauri backend
  const runTest = async () => {
    setTesting(true);
    setResult(null);

    try {
      const testResult = await invoke<NetworkTestResult>('test_network_latency');
      setResult(testResult);
    } catch (err) {
      setResult({
        isOnline: false,
        latencyMs: null,
        error: String(err),
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Wifi className="h-5 w-5 text-cyan-500" />
            Network Status
          </CardTitle>
          <CardDescription>Check connectivity and measure latency</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Connection Status */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
            <div className="flex items-center gap-3">
              <div className={`h-4 w-4 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
              <span className="font-medium">{isOnline ? 'Connected' : 'Disconnected'}</span>
            </div>
            <Badge variant={isOnline ? 'default' : 'destructive'}>
              {isOnline ? 'Online' : 'Offline'}
            </Badge>
          </div>

          {/* Test Button */}
          <Button
            onClick={runTest}
            disabled={!isOnline || testing}
            className="w-full"
          >
            {testing ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Run Latency Test
              </>
            )}
          </Button>

          {/* Results */}
          {result && (
            <div className="p-4 rounded-lg bg-muted/50 text-center">
              {result.error ? (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertTitle>Test Failed</AlertTitle>
                  <AlertDescription>{result.error}</AlertDescription>
                </Alert>
              ) : (
                <>
                  <div className="text-3xl font-bold">
                    {result.latencyMs} ms
                  </div>
                  <div className="text-sm text-muted-foreground mb-2">Average Latency</div>
                  <Badge variant={result.latencyMs! < 50 ? 'default' : result.latencyMs! < 150 ? 'secondary' : 'destructive'}>
                    {result.latencyMs! < 50 ? 'Excellent' : result.latencyMs! < 150 ? 'Good' : 'Poor'}
                  </Badge>
                </>
              )}
            </div>
          )}

          <Alert>
            <Wifi className="h-4 w-4" />
            <AlertTitle>Note</AlertTitle>
            <AlertDescription className="text-xs">
              Tests connectivity to Google, Cloudflare, and Microsoft servers. Average latency is calculated from successful responses.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
