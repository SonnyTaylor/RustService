/**
 * Scripts Page Component
 * 
 * Script catalog - Store and execute frequently used PowerShell/CMD scripts
 */

import { ScrollText } from 'lucide-react';

export function ScriptsPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
      <ScrollText className="h-16 w-16" />
      <h2 className="text-2xl font-semibold text-foreground">Scripts</h2>
      <p className="text-center max-w-md">
        Store and execute frequently used PowerShell and CMD scripts.
        Build your library of automation scripts.
      </p>
    </div>
  );
}
