/**
 * Shortcuts Page Component
 * 
 * Quick access shortcuts to commonly used Windows features and tools
 */

import { Zap } from 'lucide-react';

export function ShortcutsPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
      <Zap className="h-16 w-16" />
      <h2 className="text-2xl font-semibold text-foreground">Shortcuts</h2>
      <p className="text-center max-w-md">
        Quick access to commonly used Windows features, 
        Control Panel applets, and system tools.
      </p>
    </div>
  );
}
