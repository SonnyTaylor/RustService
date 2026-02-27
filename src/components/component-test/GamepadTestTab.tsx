/**
 * Gamepad/Controller Test Tab
 *
 * Tests game controllers using the browser Gamepad API.
 * Shows visual controller layout, button states, stick positions,
 * trigger values, deadzone control, and vibration testing.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Gamepad2,
  Vibrate,
  RefreshCw,
  CircleDot,
  AlertCircle,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';

// Standard button labels for Xbox-style controllers
const BUTTON_LABELS = [
  'A', 'B', 'X', 'Y',
  'LB', 'RB', 'LT', 'RT',
  'Back', 'Start',
  'L3', 'R3',
  'Up', 'Down', 'Left', 'Right',
  'Home',
];

// Face button colors (Xbox style)
const FACE_BUTTON_COLORS: Record<string, string> = {
  'A': '#22c55e',  // green
  'B': '#ef4444',  // red
  'X': '#3b82f6',  // blue
  'Y': '#eab308',  // yellow
};

interface GamepadState {
  index: number;
  id: string;
  buttons: { pressed: boolean; value: number }[];
  axes: number[];
  connected: boolean;
  timestamp: number;
}

function applyDeadzone(value: number, deadzone: number): number {
  if (Math.abs(value) < deadzone) return 0;
  const sign = value > 0 ? 1 : -1;
  return sign * ((Math.abs(value) - deadzone) / (1 - deadzone));
}

// ============================================================================
// VISUAL CONTROLLER LAYOUT
// ============================================================================

function ControllerVisual({ state, deadzone }: { state: GamepadState; deadzone: number }) {
  const buttons = state.buttons;
  const axes = state.axes;

  // Left stick: axes 0 (X), 1 (Y)
  const lsX = applyDeadzone(axes[0] ?? 0, deadzone);
  const lsY = applyDeadzone(axes[1] ?? 0, deadzone);
  // Right stick: axes 2 (X), 3 (Y)
  const rsX = applyDeadzone(axes[2] ?? 0, deadzone);
  const rsY = applyDeadzone(axes[3] ?? 0, deadzone);

  return (
    <div className="space-y-4">
      {/* Triggers and Bumpers */}
      <div className="grid grid-cols-2 gap-4">
        <TriggerBar label="LT" value={buttons[6]?.value ?? 0} />
        <TriggerBar label="RT" value={buttons[7]?.value ?? 0} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <BumperIndicator label="LB" pressed={buttons[4]?.pressed ?? false} />
        <BumperIndicator label="RB" pressed={buttons[5]?.pressed ?? false} />
      </div>

      {/* Main controller body */}
      <div className="grid grid-cols-3 gap-4 items-center">
        {/* Left side: Left Stick + D-Pad */}
        <div className="space-y-4">
          <StickVisual
            label="Left Stick"
            x={lsX}
            y={lsY}
            rawX={axes[0] ?? 0}
            rawY={axes[1] ?? 0}
            pressed={buttons[10]?.pressed ?? false}
            deadzone={deadzone}
          />
          <DPad
            up={buttons[12]?.pressed ?? false}
            down={buttons[13]?.pressed ?? false}
            left={buttons[14]?.pressed ?? false}
            right={buttons[15]?.pressed ?? false}
          />
        </div>

        {/* Center: Back, Home, Start */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex gap-3">
            <SmallButton label="Back" pressed={buttons[8]?.pressed ?? false} />
            <SmallButton label="Home" pressed={buttons[16]?.pressed ?? false} />
            <SmallButton label="Start" pressed={buttons[9]?.pressed ?? false} />
          </div>
        </div>

        {/* Right side: Face Buttons + Right Stick */}
        <div className="space-y-4">
          <FaceButtons
            a={buttons[0]?.pressed ?? false}
            b={buttons[1]?.pressed ?? false}
            x={buttons[2]?.pressed ?? false}
            y={buttons[3]?.pressed ?? false}
          />
          <StickVisual
            label="Right Stick"
            x={rsX}
            y={rsY}
            rawX={axes[2] ?? 0}
            rawY={axes[3] ?? 0}
            pressed={buttons[11]?.pressed ?? false}
            deadzone={deadzone}
          />
        </div>
      </div>
    </div>
  );
}

function TriggerBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono">{pct}%</span>
      </div>
      <div className="h-3 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-75"
          style={{
            width: `${pct}%`,
            backgroundColor: value > 0.01 ? '#f97316' : 'transparent',
          }}
        />
      </div>
    </div>
  );
}

function BumperIndicator({ label, pressed }: { label: string; pressed: boolean }) {
  return (
    <div
      className={`text-center py-1.5 rounded-md text-xs font-medium transition-colors duration-75 ${
        pressed
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground'
      }`}
    >
      {label}
    </div>
  );
}

function SmallButton({ label, pressed }: { label: string; pressed: boolean }) {
  return (
    <div
      className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors duration-75 ${
        pressed
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground'
      }`}
    >
      {label}
    </div>
  );
}

function FaceButtons({ a, b, x, y }: { a: boolean; b: boolean; x: boolean; y: boolean }) {
  const buttonData = [
    { label: 'Y', pressed: y, row: 0, col: 1 },
    { label: 'X', pressed: x, row: 1, col: 0 },
    { label: 'B', pressed: b, row: 1, col: 2 },
    { label: 'A', pressed: a, row: 2, col: 1 },
  ];

  return (
    <div className="flex justify-center">
      <div className="grid grid-cols-3 gap-1 w-fit">
        {[0, 1, 2].map(row =>
          [0, 1, 2].map(col => {
            const btn = buttonData.find(b => b.row === row && b.col === col);
            if (!btn) {
              return <div key={`${row}-${col}`} className="w-9 h-9" />;
            }
            const color = FACE_BUTTON_COLORS[btn.label] ?? '#888';
            return (
              <div
                key={`${row}-${col}`}
                className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-75 border-2"
                style={{
                  backgroundColor: btn.pressed ? color : 'transparent',
                  borderColor: color,
                  color: btn.pressed ? '#fff' : color,
                  transform: btn.pressed ? 'scale(0.9)' : 'scale(1)',
                }}
              >
                {btn.label}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function DPad({ up, down, left, right }: { up: boolean; down: boolean; left: boolean; right: boolean }) {
  const active = 'bg-primary text-primary-foreground';
  const inactive = 'bg-muted text-muted-foreground';

  return (
    <div className="flex justify-center">
      <div className="grid grid-cols-3 gap-0.5 w-fit">
        <div className="w-7 h-7" />
        <div className={`w-7 h-7 rounded-t-md flex items-center justify-center text-[10px] transition-colors duration-75 ${up ? active : inactive}`}>
          ▲
        </div>
        <div className="w-7 h-7" />
        <div className={`w-7 h-7 rounded-l-md flex items-center justify-center text-[10px] transition-colors duration-75 ${left ? active : inactive}`}>
          ◄
        </div>
        <div className="w-7 h-7 bg-muted/50 rounded-sm" />
        <div className={`w-7 h-7 rounded-r-md flex items-center justify-center text-[10px] transition-colors duration-75 ${right ? active : inactive}`}>
          ►
        </div>
        <div className="w-7 h-7" />
        <div className={`w-7 h-7 rounded-b-md flex items-center justify-center text-[10px] transition-colors duration-75 ${down ? active : inactive}`}>
          ▼
        </div>
        <div className="w-7 h-7" />
      </div>
    </div>
  );
}

function StickVisual({
  label,
  x,
  y,
  rawX,
  rawY,
  pressed,
  deadzone,
}: {
  label: string;
  x: number;
  y: number;
  rawX: number;
  rawY: number;
  pressed: boolean;
  deadzone: number;
}) {
  const size = 100;
  const center = size / 2;
  const radius = size / 2 - 8;

  // Dot position (clamped)
  const dotX = center + x * radius;
  const dotY = center + y * radius;

  // Raw position (faint)
  const rawDotX = center + rawX * radius;
  const rawDotY = center + rawY * radius;

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={`rounded-full border-2 transition-colors duration-75 ${
          pressed ? 'border-primary bg-primary/10' : 'border-border bg-muted/30'
        }`}
      >
        {/* Deadzone circle */}
        <circle
          cx={center}
          cy={center}
          r={deadzone * radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="3 3"
          className="text-muted-foreground/30"
        />
        {/* Crosshair */}
        <line x1={center} y1={8} x2={center} y2={size - 8} stroke="currentColor" strokeWidth="0.5" className="text-muted-foreground/20" />
        <line x1={8} y1={center} x2={size - 8} y2={center} stroke="currentColor" strokeWidth="0.5" className="text-muted-foreground/20" />
        {/* Raw position (faint) */}
        {deadzone > 0 && (
          <circle cx={rawDotX} cy={rawDotY} r={3} fill="currentColor" className="text-muted-foreground/20" />
        )}
        {/* Active position */}
        <circle
          cx={dotX}
          cy={dotY}
          r={6}
          fill={pressed ? 'hsl(var(--primary))' : 'hsl(var(--foreground))'}
          opacity={0.9}
        />
      </svg>
      <div className="text-[10px] font-mono text-muted-foreground">
        {x.toFixed(2)}, {y.toFixed(2)}
      </div>
    </div>
  );
}

// ============================================================================
// RAW DATA TABLE
// ============================================================================

function RawDataTable({ state }: { state: GamepadState }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Buttons */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Buttons ({state.buttons.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-48">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="text-left py-1 pr-2">#</th>
                  <th className="text-left py-1 pr-2">Label</th>
                  <th className="text-left py-1 pr-2">State</th>
                  <th className="text-right py-1">Value</th>
                </tr>
              </thead>
              <tbody>
                {state.buttons.map((btn, i) => (
                  <tr key={i} className={btn.pressed ? 'bg-primary/10' : ''}>
                    <td className="py-0.5 pr-2 font-mono text-muted-foreground">{i}</td>
                    <td className="py-0.5 pr-2">{BUTTON_LABELS[i] ?? `Btn ${i}`}</td>
                    <td className="py-0.5 pr-2">
                      <Badge variant={btn.pressed ? 'default' : 'outline'} className="text-[10px] px-1.5 py-0">
                        {btn.pressed ? 'ON' : 'OFF'}
                      </Badge>
                    </td>
                    <td className="py-0.5 text-right font-mono">{btn.value.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Axes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Axes ({state.axes.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-48">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th className="text-left py-1 pr-2">#</th>
                  <th className="text-left py-1 pr-2">Name</th>
                  <th className="text-right py-1">Value</th>
                </tr>
              </thead>
              <tbody>
                {state.axes.map((axis, i) => {
                  const names = ['Left X', 'Left Y', 'Right X', 'Right Y'];
                  return (
                    <tr key={i} className={Math.abs(axis) > 0.1 ? 'bg-primary/10' : ''}>
                      <td className="py-0.5 pr-2 font-mono text-muted-foreground">{i}</td>
                      <td className="py-0.5 pr-2">{names[i] ?? `Axis ${i}`}</td>
                      <td className="py-0.5 text-right font-mono">{axis.toFixed(4)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// MAIN GAMEPAD TEST TAB
// ============================================================================

export function GamepadTestTab() {
  const [gamepads, setGamepads] = useState<GamepadState[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [deadzone, setDeadzone] = useState(0.1);
  const [isPolling, setIsPolling] = useState(false);
  const [showRawData, setShowRawData] = useState(false);
  const rafRef = useRef<number | null>(null);

  const readGamepads = useCallback((): GamepadState[] => {
    const raw = navigator.getGamepads();
    const states: GamepadState[] = [];
    for (let i = 0; i < raw.length; i++) {
      const gp = raw[i];
      if (!gp) continue;
      states.push({
        index: gp.index,
        id: gp.id,
        buttons: Array.from(gp.buttons).map(b => ({ pressed: b.pressed, value: b.value })),
        axes: Array.from(gp.axes),
        connected: gp.connected,
        timestamp: gp.timestamp,
      });
    }
    return states;
  }, []);

  const pollLoop = useCallback(() => {
    const states = readGamepads();
    setGamepads(states);
    rafRef.current = requestAnimationFrame(pollLoop);
  }, [readGamepads]);

  // Start/stop polling
  useEffect(() => {
    if (isPolling) {
      rafRef.current = requestAnimationFrame(pollLoop);
    }
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPolling, pollLoop]);

  // Auto-start polling when a gamepad connects
  useEffect(() => {
    const onConnect = () => {
      setIsPolling(true);
    };
    const onDisconnect = () => {
      const remaining = readGamepads();
      if (remaining.length === 0) {
        setIsPolling(false);
      }
    };
    window.addEventListener('gamepadconnected', onConnect);
    window.addEventListener('gamepaddisconnected', onDisconnect);

    // Check if any gamepads are already connected
    if (readGamepads().length > 0) {
      setIsPolling(true);
    }

    return () => {
      window.removeEventListener('gamepadconnected', onConnect);
      window.removeEventListener('gamepaddisconnected', onDisconnect);
    };
  }, [readGamepads]);

  const selectedGamepad = gamepads.find(g => g.index === selectedIndex) ?? gamepads[0] ?? null;

  const handleVibrate = async () => {
    if (!selectedGamepad) return;
    const raw = navigator.getGamepads();
    const gp = raw[selectedGamepad.index];
    if (!gp) return;
    try {
      const actuator = (gp as any).vibrationActuator;
      if (actuator) {
        await actuator.playEffect('dual-rumble', {
          duration: 300,
          strongMagnitude: 1.0,
          weakMagnitude: 0.5,
        });
      }
    } catch {
      // Vibration not supported
    }
  };

  return (
    <div className="space-y-4">
      {/* Connection Status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Gamepad2 className="h-5 w-5 text-purple-500" />
            Controller Status
          </CardTitle>
          <CardDescription>
            Connect a game controller via USB or Bluetooth, then press any button
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {gamepads.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No controller detected. Connect a gamepad and press any button to activate it.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              {/* Controller selector */}
              {gamepads.length > 1 && (
                <div className="flex gap-2">
                  {gamepads.map(gp => (
                    <Button
                      key={gp.index}
                      variant={selectedIndex === gp.index ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setSelectedIndex(gp.index)}
                    >
                      Controller {gp.index + 1}
                    </Button>
                  ))}
                </div>
              )}

              {selectedGamepad && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="bg-green-500/20 text-green-600 border-green-500/30">
                      Connected
                    </Badge>
                    <span className="text-sm text-muted-foreground truncate max-w-md">
                      {selectedGamepad.id}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleVibrate}>
                      <Vibrate className="h-4 w-4 mr-1" />
                      Vibrate
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowRawData(!showRawData)}
                    >
                      <CircleDot className="h-4 w-4 mr-1" />
                      {showRawData ? 'Visual' : 'Raw Data'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deadzone Control */}
      {selectedGamepad && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              Stick Deadzone
              <span className="font-mono text-muted-foreground">{deadzone.toFixed(2)}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Slider
              value={[deadzone]}
              onValueChange={([v]) => setDeadzone(v)}
              min={0}
              max={0.5}
              step={0.01}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>0 (none)</span>
              <span>0.5 (max)</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Controller Visual or Raw Data */}
      {selectedGamepad && (
        showRawData ? (
          <RawDataTable state={selectedGamepad} />
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Controller Input</CardTitle>
            </CardHeader>
            <CardContent>
              <ControllerVisual state={selectedGamepad} deadzone={deadzone} />
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}
