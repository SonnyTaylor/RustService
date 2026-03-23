/**
 * Touch / Stylus Test Tab
 *
 * Tests touch and stylus input using the Pointer Events API.
 * Supports multi-touch tracking, pressure sensitivity, and
 * a drawing canvas with per-pointer color coding.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Hand,
  RotateCcw,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export const POINTER_COLORS = ['#ef4444','#3b82f6','#22c55e','#f59e0b','#a855f7','#ec4899','#14b8a6','#f97316'];

export function TouchTestTab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activePointers, setActivePointers] = useState<Map<number, { x: number; y: number; type: string; pressure: number }>>(new Map());
  const [maxPoints, setMaxPoints] = useState(0);
  const [lastType, setLastType] = useState<string>('—');
  const [lastPressure, setLastPressure] = useState(0);
  const activePointersRef = useRef<Map<number, { x: number; y: number; type: string; pressure: number }>>(new Map());

  const getColor = (id: number) => POINTER_COLORS[id % POINTER_COLORS.length];

  const getCanvasPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    canvasRef.current?.setPointerCapture(e.pointerId);
    const pos = getCanvasPos(e);
    const updated = new Map(activePointersRef.current);
    updated.set(e.pointerId, { ...pos, type: e.pointerType, pressure: e.pressure });
    activePointersRef.current = updated;
    setActivePointers(new Map(updated));
    setMaxPoints(prev => Math.max(prev, updated.size));
    setLastType(e.pointerType);
    setLastPressure(e.pressure);

    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = getColor(e.pointerId);
    ctx.fill();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activePointersRef.current.has(e.pointerId)) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const prev = activePointersRef.current.get(e.pointerId)!;
    const pos = getCanvasPos(e);
    const lineWidth = e.pointerType === 'pen' ? Math.max(1, e.pressure * 12) : 2;

    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = getColor(e.pointerId);
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.stroke();

    const updated = new Map(activePointersRef.current);
    updated.set(e.pointerId, { ...pos, type: e.pointerType, pressure: e.pressure });
    activePointersRef.current = updated;
    setLastPressure(e.pressure);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const updated = new Map(activePointersRef.current);
    updated.delete(e.pointerId);
    activePointersRef.current = updated;
    setActivePointers(new Map(updated));
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setMaxPoints(0);
    setLastType('—');
    setLastPressure(0);
  };

  // Resize canvas to match container
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const { width, height } = container.getBoundingClientRect();
      // Preserve drawing on resize by saving/restoring image
      const img = canvas.toDataURL();
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx && img) {
        const image = new Image();
        image.onload = () => ctx.drawImage(image, 0, 0);
        image.src = img;
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        {/* Active points */}
        <Card className="text-center">
          <CardContent className="pt-4 pb-3">
            <div className="text-3xl font-bold">{activePointers.size}</div>
            <div className="text-xs text-muted-foreground mt-1">Active Points</div>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="pt-4 pb-3">
            <div className="text-3xl font-bold">{maxPoints}</div>
            <div className="text-xs text-muted-foreground mt-1">Max Simultaneous</div>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="pt-4 pb-3">
            <div className="text-3xl font-bold capitalize">{lastType}</div>
            <div className="text-xs text-muted-foreground mt-1">Pointer Type</div>
          </CardContent>
        </Card>
        <Card className="text-center">
          <CardContent className="pt-4 pb-3">
            <div className="text-3xl font-bold">{lastPressure.toFixed(2)}</div>
            <div className="text-xs text-muted-foreground mt-1">Pressure</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Hand className="h-5 w-5 text-purple-500" />
              Touch / Stylus Draw Area
            </CardTitle>
            <CardDescription>Draw with your finger, stylus, or mouse</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={clearCanvas}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Clear
          </Button>
        </CardHeader>
        <CardContent>
          <div
            ref={containerRef}
            className="w-full rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/20 overflow-hidden touch-none"
            style={{ height: 320 }}
          >
            <canvas
              ref={canvasRef}
              className="w-full h-full cursor-crosshair"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{ touchAction: 'none' }}
            />
          </div>
          {activePointers.size > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Array.from(activePointers.entries()).map(([id, info]) => (
                <Badge key={id} variant="outline" style={{ borderColor: getColor(id), color: getColor(id) }}>
                  #{id} ({Math.round(info.x)}, {Math.round(info.y)})
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
