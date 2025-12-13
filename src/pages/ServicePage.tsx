/**
 * Service Page Component
 * 
 * Service automation tab - Queue and run maintenance tasks
 * like BleachBit, SFC, DISM, AdwCleaner, smartctl, etc.
 */

import { Wrench } from 'lucide-react';

export function ServicePage() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
      <Wrench className="h-16 w-16" />
      <h2 className="text-2xl font-semibold text-foreground">Service Automation</h2>
      <p className="text-center max-w-md">
        Queue and run maintenance tasks with minimal clicks. 
        Cleanup, security scanning, and system maintenance tools.
      </p>
    </div>
  );
}
