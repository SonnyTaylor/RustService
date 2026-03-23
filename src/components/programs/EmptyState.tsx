/**
 * Empty State Component
 *
 * Shown when no programs have been added yet.
 */

import {
  AppWindow,
  Plus,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

// =============================================================================
// Empty State Component
// =============================================================================

export function EmptyState({ onAddClick }: { onAddClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center py-12">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
        <AppWindow className="h-8 w-8 text-muted-foreground" />
      </div>
      <div>
        <h3 className="text-lg font-semibold">No Programs Yet</h3>
        <p className="text-muted-foreground text-sm max-w-sm mt-1">
          Add portable programs to quickly launch them from here.
          Drop executables in your data folder and add them to get started.
        </p>
      </div>
      <Button onClick={onAddClick}>
        <Plus className="h-4 w-4 mr-2" />
        Add Your First Program
      </Button>
    </div>
  );
}
