/**
 * Display Test Tab
 *
 * Tests for dead pixels and color accuracy using fullscreen color patterns.
 * Supports solid colors, gradients, checkerboard, grid, SMPTE bars,
 * crosshatch, dot matrix, and stripe patterns.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Monitor,
  Maximize,
  Minimize,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import type { DisplayPattern } from '@/types';

export function DisplayTestTab() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activePattern, setActivePattern] = useState<DisplayPattern | null>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);

  const patterns: { id: DisplayPattern; label: string; style: string }[] = [
    { id: 'red', label: 'Red', style: 'bg-red-500' },
    { id: 'green', label: 'Green', style: 'bg-green-500' },
    { id: 'blue', label: 'Blue', style: 'bg-blue-500' },
    { id: 'white', label: 'White', style: 'bg-white' },
    { id: 'black', label: 'Black', style: 'bg-black' },
    { id: 'gradient', label: 'Gradient', style: 'bg-gradient-to-r from-red-500 via-green-500 to-blue-500' },
    { id: 'checkerboard', label: 'Checker', style: '' },
    { id: 'grid', label: 'Grid', style: '' },
    { id: 'smpte', label: 'SMPTE', style: '' },
    { id: 'crosshatch', label: 'Crosshatch', style: '' },
    { id: 'dot-matrix', label: 'Dots', style: '' },
    { id: 'stripes-h', label: 'H-Stripes', style: '' },
    { id: 'stripes-v', label: 'V-Stripes', style: '' },
  ];

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await fullscreenRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const exitFullscreen = async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
    setIsFullscreen(false);
    setActivePattern(null);
  };

  // Listen for escape key
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Compute inline style for custom patterns (shared between thumbnail and fullscreen)
  const getPatternStyle = (id: DisplayPattern | null): React.CSSProperties | undefined => {
    switch (id) {
      case 'checkerboard':
        return {
          backgroundImage: 'repeating-linear-gradient(45deg, #000 25%, transparent 25%, transparent 75%, #000 75%), repeating-linear-gradient(45deg, #000 25%, #fff 25%, #fff 75%, #000 75%)',
          backgroundSize: '40px 40px',
          backgroundPosition: '0 0, 20px 20px',
        };
      case 'grid':
        return {
          backgroundColor: '#fff',
          backgroundImage: 'linear-gradient(to right, #ccc 1px, transparent 1px), linear-gradient(to bottom, #ccc 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        };
      case 'smpte':
        return {
          background: 'linear-gradient(to right, #c0c0c0 14.28%, #c0c000 14.28% 28.56%, #00c0c0 28.56% 42.84%, #00c000 42.84% 57.12%, #c000c0 57.12% 71.4%, #c00000 71.4% 85.68%, #0000c0 85.68%)',
        };
      case 'crosshatch':
        return {
          backgroundColor: '#fff',
          backgroundImage: 'linear-gradient(to right, #999 1px, transparent 1px), linear-gradient(to bottom, #999 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        };
      case 'dot-matrix':
        return {
          backgroundColor: '#fff',
          backgroundImage: 'radial-gradient(circle, #333 1.5px, transparent 1.5px)',
          backgroundSize: '16px 16px',
        };
      case 'stripes-h':
        return {
          backgroundImage: 'repeating-linear-gradient(to bottom, #000 0px, #000 10px, #fff 10px, #fff 20px)',
        };
      case 'stripes-v':
        return {
          backgroundImage: 'repeating-linear-gradient(to right, #000 0px, #000 10px, #fff 10px, #fff 20px)',
        };
      default:
        return undefined;
    }
  };

  // Render pattern
  const renderPattern = () => {
    const style = getPatternStyle(activePattern);
    if (style) return <div className="w-full h-full" style={style} />;
    const pattern = patterns.find(p => p.id === activePattern);
    return <div className={`w-full h-full ${pattern?.style || 'bg-muted'}`} />;
  };

  return (
    <div className="space-y-4">
      {/* Fullscreen Test Element */}
      <div
        ref={fullscreenRef}
        className={`${isFullscreen ? 'fixed inset-0 z-50' : 'hidden'}`}
        onClick={exitFullscreen}
      >
        {renderPattern()}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white bg-black/50 px-4 py-2 rounded-full text-sm">
          Click anywhere or press ESC to exit
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Monitor className="h-5 w-5 text-indigo-500" />
            Display Test
          </CardTitle>
          <CardDescription>Test for dead pixels and color accuracy</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Monitor className="h-4 w-4" />
            <AlertTitle>Dead Pixel Test</AlertTitle>
            <AlertDescription className="text-xs">
              Click a color pattern, then enter fullscreen mode. Look for pixels that don't match the expected color.
            </AlertDescription>
          </Alert>

          {/* Pattern Selection */}
          <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
            {patterns.map(({ id, label, style }) => (
              <button
                key={id}
                onClick={() => setActivePattern(id)}
                className={`
                  p-2 rounded-lg border-2 transition-all text-center
                  ${activePattern === id ? 'border-primary ring-2 ring-primary/20' : 'border-muted hover:border-muted-foreground/50'}
                `}
              >
                <div
                  className={`w-full aspect-square rounded mb-1 ${style || 'bg-muted'}`}
                  style={getPatternStyle(id)}
                />
                <span className="text-xs">{label}</span>
              </button>
            ))}
          </div>

          {/* Preview & Fullscreen */}
          <div className="flex gap-4 items-center">
            <div
              className={`w-32 h-20 rounded-lg border overflow-hidden ${patterns.find(p => p.id === activePattern)?.style || 'bg-muted'}`}
              style={getPatternStyle(activePattern)}
            />
            <Button
              onClick={toggleFullscreen}
              disabled={!activePattern}
              className="flex-1"
            >
              {isFullscreen ? (
                <>
                  <Minimize className="h-4 w-4 mr-2" />
                  Exit Fullscreen
                </>
              ) : (
                <>
                  <Maximize className="h-4 w-4 mr-2" />
                  Enter Fullscreen
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
