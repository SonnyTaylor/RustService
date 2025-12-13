/**
 * System Info Page Component
 * 
 * System diagnostics tab - Comprehensive hardware/OS information collection
 */

import { Monitor } from 'lucide-react';

export function SystemInfoPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
      <Monitor className="h-16 w-16" />
      <h2 className="text-2xl font-semibold text-foreground">System Information</h2>
      <p className="text-center max-w-md">
        Comprehensive hardware and OS information collection.
        CPU, RAM, storage, network, and more.
      </p>
    </div>
  );
}
