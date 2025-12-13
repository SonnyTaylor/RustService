/**
 * Programs Page Component
 * 
 * Portable programs launcher - Manage and launch tools from data folder
 */

import { AppWindow } from 'lucide-react';

export function ProgramsPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
      <AppWindow className="h-16 w-16" />
      <h2 className="text-2xl font-semibold text-foreground">Programs</h2>
      <p className="text-center max-w-md">
        Manage and launch portable tools from the data folder.
        Add your favorite utilities for quick access.
      </p>
    </div>
  );
}
