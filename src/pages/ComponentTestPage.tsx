/**
 * Component Test Page
 *
 * Hardware testing tools for technicians - camera, audio, keyboard,
 * mouse, network, and display diagnostics.
 */

import {
  Camera,
  Volume2,
  Keyboard,
  Mouse,
  Wifi,
  Monitor,
  MoreHorizontal,
  CheckCircle2,
  Gamepad2,
  Hand,
} from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';

import {
  CameraTestTab,
  AudioTestTab,
  KeyboardTestTab,
  MouseTestTab,
  GamepadTestTab,
  TouchTestTab,
  NetworkTestTab,
  DisplayTestTab,
  MoreTestsTab,
} from '@/components/component-test';

// ============================================================================
// MAIN COMPONENT TEST PAGE
// ============================================================================

const TEST_TABS = [
  { id: 'camera', label: 'Camera', icon: Camera, component: CameraTestTab },
  { id: 'audio', label: 'Audio', icon: Volume2, component: AudioTestTab },
  { id: 'keyboard', label: 'Keyboard', icon: Keyboard, component: KeyboardTestTab },
  { id: 'mouse', label: 'Mouse', icon: Mouse, component: MouseTestTab },
  { id: 'gamepad', label: 'Gamepad', icon: Gamepad2, component: GamepadTestTab },
  { id: 'touch', label: 'Touch', icon: Hand, component: TouchTestTab },
  { id: 'network', label: 'Network', icon: Wifi, component: NetworkTestTab },
  { id: 'display', label: 'Display', icon: Monitor, component: DisplayTestTab },
  { id: 'more', label: 'More', icon: MoreHorizontal, component: MoreTestsTab },
] as const;

export function ComponentTestPage() {
  return (
  <div className="h-full flex flex-col overflow-hidden min-h-0">
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-6">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6" />
              Component Testing
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              Test hardware components - camera, audio, keyboard, mouse, gamepad, network, and display
            </p>
          </div>

          <Tabs defaultValue="camera" className="w-full">
            <TabsList className="grid w-full grid-cols-9 h-auto">
              {TEST_TABS.map(({ id, label, icon: Icon }) => (
                <TabsTrigger
                  key={id}
                  value={id}
                  className="flex flex-col items-center gap-1 py-2 text-xs"
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{label}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            {TEST_TABS.map(({ id, component: Component }) => (
              <TabsContent key={id} value={id} className="mt-4">
                <Component />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}
