/**
 * Keyboard Test Tab
 *
 * Visual keyboard layout that highlights keys as they are pressed.
 * Tracks tested vs untested keys with progress indicator.
 * Supports Full (104), TKL (87), and Compact (60%) layouts.
 */

import { useState, useEffect } from 'react';
import {
  Keyboard,
  RotateCcw,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';

// Keyboard layouts
export const KEYBOARD_LAYOUTS = {
  full: {
    name: 'Full (104 keys)',
    rows: [
      ['Escape', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'PrintScreen', 'ScrollLock', 'Pause'],
      ['Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal', 'Backspace', 'Insert', 'Home', 'PageUp', 'NumLock', 'NumpadDivide', 'NumpadMultiply', 'NumpadSubtract'],
      ['Tab', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight', 'Backslash', 'Delete', 'End', 'PageDown', 'Numpad7', 'Numpad8', 'Numpad9', 'NumpadAdd'],
      ['CapsLock', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote', 'Enter', 'Numpad4', 'Numpad5', 'Numpad6'],
      ['ShiftLeft', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash', 'ShiftRight', 'ArrowUp', 'Numpad1', 'Numpad2', 'Numpad3', 'NumpadEnter'],
      ['ControlLeft', 'MetaLeft', 'AltLeft', 'Space', 'AltRight', 'MetaRight', 'ContextMenu', 'ControlRight', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'Numpad0', 'NumpadDecimal'],
    ],
  },
  tkl: {
    name: 'TKL (87 keys)',
    rows: [
      ['Escape', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'PrintScreen', 'ScrollLock', 'Pause'],
      ['Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal', 'Backspace', 'Insert', 'Home', 'PageUp'],
      ['Tab', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight', 'Backslash', 'Delete', 'End', 'PageDown'],
      ['CapsLock', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote', 'Enter'],
      ['ShiftLeft', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash', 'ShiftRight', 'ArrowUp'],
      ['ControlLeft', 'MetaLeft', 'AltLeft', 'Space', 'AltRight', 'MetaRight', 'ContextMenu', 'ControlRight', 'ArrowLeft', 'ArrowDown', 'ArrowRight'],
    ],
  },
  compact: {
    name: 'Compact (60%)',
    rows: [
      ['Escape', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal', 'Backspace'],
      ['Tab', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight', 'Backslash'],
      ['CapsLock', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote', 'Enter'],
      ['ShiftLeft', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash', 'ShiftRight'],
      ['ControlLeft', 'MetaLeft', 'AltLeft', 'Space', 'AltRight', 'MetaRight', 'ContextMenu', 'ControlRight'],
    ],
  },
};

export const KEY_LABELS: Record<string, string> = {
  Escape: 'Esc', Backspace: '⌫', Tab: 'Tab', CapsLock: 'Caps', Enter: '↵',
  ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl',
  AltLeft: 'Alt', AltRight: 'Alt', MetaLeft: '⊞', MetaRight: '⊞',
  Space: ' ', Backquote: '`', Minus: '-', Equal: '=',
  BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  ContextMenu: '☰', PrintScreen: 'PrtSc', ScrollLock: 'ScrLk', Pause: 'Pause',
  Insert: 'Ins', Delete: 'Del', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  NumLock: 'Num', NumpadDivide: '/', NumpadMultiply: '*', NumpadSubtract: '-', NumpadAdd: '+',
  NumpadEnter: '↵', NumpadDecimal: '.', Numpad0: '0', Numpad1: '1', Numpad2: '2', Numpad3: '3',
  Numpad4: '4', Numpad5: '5', Numpad6: '6', Numpad7: '7', Numpad8: '8', Numpad9: '9',
};

type KeyboardLayoutId = keyof typeof KEYBOARD_LAYOUTS;

export function KeyboardTestTab() {
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());
  const [testedKeys, setTestedKeys] = useState<Set<string>>(new Set());
  const [lastKey, setLastKey] = useState<{ code: string; key: string } | null>(null);
  const [layout, setLayout] = useState<KeyboardLayoutId>('tkl');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      setPressedKeys(prev => new Set([...prev, e.code]));
      setTestedKeys(prev => new Set([...prev, e.code]));
      setLastKey({ code: e.code, key: e.key });
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      setPressedKeys(prev => {
        const newSet = new Set(prev);
        newSet.delete(e.code);
        return newSet;
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const currentLayout = KEYBOARD_LAYOUTS[layout];
  const allKeys = currentLayout.rows.flat();
  const totalKeys = allKeys.length;
  const testedCount = allKeys.filter(k => testedKeys.has(k)).length;
  const percentage = Math.round((testedCount / totalKeys) * 100);

  const reset = () => {
    setTestedKeys(new Set());
    setLastKey(null);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Keyboard className="h-5 w-5 text-purple-500" />
                Keyboard Test
              </CardTitle>
              <CardDescription>Press keys to test - tested keys turn green</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <select
                className="px-3 py-1.5 rounded-md border bg-background text-sm"
                value={layout}
                onChange={(e) => setLayout(e.target.value as KeyboardLayoutId)}
              >
                {Object.entries(KEYBOARD_LAYOUTS).map(([id, l]) => (
                  <option key={id} value={id}>{l.name}</option>
                ))}
              </select>
              <Button variant="outline" size="sm" onClick={reset}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Keys Tested</span>
              <span className="font-medium">{testedCount} / {totalKeys} ({percentage}%)</span>
            </div>
            <Progress value={percentage} className="h-2" />
          </div>

          {/* Last key pressed */}
          {lastKey && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Last key:</span>
              <Badge>{lastKey.key}</Badge>
              <span className="text-xs text-muted-foreground font-mono">({lastKey.code})</span>
            </div>
          )}

          {/* Keyboard Layout */}
          <ScrollArea className="w-full">
            <div className="space-y-1 min-w-[700px] pb-2">
              {currentLayout.rows.map((row, rowIndex) => (
                <div key={rowIndex} className="flex gap-1 justify-center">
                  {row.map((keyCode) => {
                    const isPressed = pressedKeys.has(keyCode);
                    const isTested = testedKeys.has(keyCode);
                    const label = KEY_LABELS[keyCode] || keyCode.replace('Key', '').replace('Digit', '');

                    let width = 'w-9';
                    if (keyCode === 'Space') width = 'w-48';
                    else if (keyCode === 'Backspace' || keyCode === 'Tab' || keyCode === 'CapsLock') width = 'w-14';
                    else if (keyCode === 'Enter' || keyCode.includes('Shift')) width = 'w-16';
                    else if (keyCode.includes('Control') || keyCode.includes('Alt') || keyCode.includes('Meta')) width = 'w-12';

                    return (
                      <div
                        key={keyCode}
                        className={`
                          ${width} h-9 rounded border flex items-center justify-center text-xs font-medium
                          transition-all duration-100 select-none
                          ${isPressed
                            ? 'bg-primary text-primary-foreground scale-95 shadow-inner'
                            : isTested
                              ? 'bg-green-500/20 border-green-500 text-green-600 dark:text-green-400'
                              : 'bg-muted/50 hover:bg-muted'}
                        `}
                      >
                        {label}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
