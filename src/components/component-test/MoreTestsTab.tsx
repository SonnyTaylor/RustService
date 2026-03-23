/**
 * More Tests Tab
 *
 * Additional hardware tests for Bluetooth and USB device detection
 * using the Web Bluetooth and WebUSB APIs.
 */

import { useState, useEffect } from 'react';
import {
  Bluetooth,
  Usb,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function MoreTestsTab() {
  const [bluetoothSupported, setBluetoothSupported] = useState<boolean | null>(null);

  useEffect(() => {
    // Bluetooth API
    setBluetoothSupported('bluetooth' in navigator);
  }, []);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Bluetooth */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bluetooth className="h-5 w-5 text-blue-500" />
            Bluetooth
          </CardTitle>
          <CardDescription>Bluetooth availability</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
            <span className="text-muted-foreground">Web Bluetooth API</span>
            <Badge variant={bluetoothSupported ? 'default' : 'secondary'}>
              {bluetoothSupported ? 'Supported' : 'Not Supported'}
            </Badge>
          </div>
          {bluetoothSupported && (
            <Button
              variant="outline"
              className="w-full"
              onClick={async () => {
                try {
                  await (navigator as any).bluetooth.requestDevice({
                    acceptAllDevices: true
                  });
                } catch (err) {
                  // User cancelled or error
                }
              }}
            >
              <Bluetooth className="h-4 w-4 mr-2" />
              Scan for Devices
            </Button>
          )}
        </CardContent>
      </Card>

      {/* USB */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Usb className="h-5 w-5 text-gray-500" />
            USB Devices
          </CardTitle>
          <CardDescription>Connected USB devices</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
            <span className="text-muted-foreground">WebUSB API</span>
            <Badge variant={'usb' in navigator ? 'default' : 'secondary'}>
              {'usb' in navigator ? 'Supported' : 'Not Supported'}
            </Badge>
          </div>
          {'usb' in navigator && (
            <Button
              variant="outline"
              className="w-full mt-4"
              onClick={async () => {
                try {
                  await (navigator as any).usb.requestDevice({ filters: [] });
                } catch (err) {
                  // User cancelled
                }
              }}
            >
              <Usb className="h-4 w-4 mr-2" />
              Request USB Device
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
