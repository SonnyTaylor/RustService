/**
 * Custom Titlebar Component
 * 
 * Windows-style titlebar with minimize, maximize, and close buttons.
 * Replaces default window decorations for a modern look.
 */

import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X } from 'lucide-react';

const appWindow = getCurrentWindow();

/**
 * Custom titlebar with drag region and window controls
 */
export function Titlebar() {
  return (
    <div className="titlebar">
      {/* App title and drag region */}
      <div 
        className="titlebar-drag-region"
        onMouseDown={handleMouseDown}
      >
        <span className="titlebar-title">RustService</span>
      </div>

      {/* Window controls */}
      <div className="titlebar-controls">
        <button 
          className="titlebar-button"
          onClick={() => appWindow.minimize()}
          title="Minimize"
        >
          <Minus className="h-4 w-4" />
        </button>
        
        <button 
          className="titlebar-button"
          onClick={() => appWindow.toggleMaximize()}
          title="Maximize"
        >
          <Square className="h-3.5 w-3.5" />
        </button>
        
        <button 
          className="titlebar-button titlebar-button-close"
          onClick={() => appWindow.close()}
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * Handle mouse down on drag region for window dragging and double-click maximize
 */
function handleMouseDown(e: React.MouseEvent) {
  if (e.buttons === 1) {
    if (e.detail === 2) {
      appWindow.toggleMaximize();
    } else {
      appWindow.startDragging();
    }
  }
}
