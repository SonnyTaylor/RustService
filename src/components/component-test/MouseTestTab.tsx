/**
 * Mouse Test Tab
 *
 * Tests mouse/trackpad functionality including left/right/middle clicks,
 * scroll up/down, drag detection, double-click target, and position tracking.
 */

import { useState, useRef } from 'react';
import {
  Mouse,
  RotateCcw,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import type { MouseTestState } from '@/types';

export function MouseTestTab() {
  const [state, setState] = useState<MouseTestState>({
    position: { x: 0, y: 0 },
    leftClicks: 0,
    rightClicks: 0,
    middleClicks: 0,
    scrollUp: 0,
    scrollDown: 0,
    lastEvent: 'None',
  });
  const testAreaRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragComplete, setDragComplete] = useState(false);

  const reset = () => {
    setState({
      position: { x: 0, y: 0 },
      leftClicks: 0,
      rightClicks: 0,
      middleClicks: 0,
      scrollUp: 0,
      scrollDown: 0,
      lastEvent: 'None',
    });
    setDragComplete(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Mouse className="h-5 w-5 text-orange-500" />
                Mouse / Trackpad Test
              </CardTitle>
              <CardDescription>Test clicks, scrolling, and movement</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={reset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {[
              { label: 'Left Click', value: state.leftClicks, color: 'text-blue-500' },
              { label: 'Right Click', value: state.rightClicks, color: 'text-red-500' },
              { label: 'Middle Click', value: state.middleClicks, color: 'text-green-500' },
              { label: 'Scroll Up', value: state.scrollUp, color: 'text-purple-500' },
              { label: 'Scroll Down', value: state.scrollDown, color: 'text-orange-500' },
              { label: 'Drag Test', value: dragComplete ? '✓' : '—', color: dragComplete ? 'text-green-500' : 'text-muted-foreground' },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center p-2 rounded-md bg-muted/50">
                <div className={`text-xl font-bold ${color}`}>{value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>

          {/* Test Area */}
          <div
            ref={testAreaRef}
            className={`
              relative h-64 rounded-lg border-2 border-dashed cursor-crosshair
              transition-colors overflow-hidden
              ${isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-muted-foreground/50'}
            `}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setState(prev => ({
                ...prev,
                position: {
                  x: Math.round(e.clientX - rect.left),
                  y: Math.round(e.clientY - rect.top)
                },
                lastEvent: 'Mouse Move',
              }));
            }}
            onClick={(e) => {
              if (e.button === 0) {
                setState(prev => ({
                  ...prev,
                  leftClicks: prev.leftClicks + 1,
                  lastEvent: 'Left Click',
                }));
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setState(prev => ({
                ...prev,
                rightClicks: prev.rightClicks + 1,
                lastEvent: 'Right Click',
              }));
            }}
            onAuxClick={(e) => {
              if (e.button === 1) {
                setState(prev => ({
                  ...prev,
                  middleClicks: prev.middleClicks + 1,
                  lastEvent: 'Middle Click',
                }));
              }
            }}
            onWheel={(e) => {
              if (e.deltaY < 0) {
                setState(prev => ({
                  ...prev,
                  scrollUp: prev.scrollUp + 1,
                  lastEvent: 'Scroll Up',
                }));
              } else {
                setState(prev => ({
                  ...prev,
                  scrollDown: prev.scrollDown + 1,
                  lastEvent: 'Scroll Down',
                }));
              }
            }}
            onMouseDown={() => setIsDragging(true)}
            onMouseUp={() => {
              if (isDragging) {
                setIsDragging(false);
                setDragComplete(true);
              }
            }}
            onMouseLeave={() => setIsDragging(false)}
          >
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/30 text-lg pointer-events-none">
              Click, scroll, and drag here
            </div>

            {/* Position Display */}
            <div className="absolute top-2 left-2 text-xs font-mono bg-background/80 px-2 py-1 rounded">
              X: {state.position.x}, Y: {state.position.y}
            </div>

            {/* Last Event */}
            <div className="absolute top-2 right-2">
              <Badge variant="outline">{state.lastEvent}</Badge>
            </div>

            {/* Double-click Target */}
            <div
              className="absolute bottom-4 right-4 w-16 h-16 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center text-xs text-center"
              onDoubleClick={() => {
                setState(prev => ({ ...prev, lastEvent: 'Double Click!' }));
              }}
            >
              Double<br/>Click
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
