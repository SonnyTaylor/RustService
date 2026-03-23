/**
 * Import Legacy Dialog Component
 *
 * Dialog for importing programs from an autoservice JSON file.
 */

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import * as dialog from '@tauri-apps/plugin-dialog';
import {
  AlertCircle,
  Loader2,
  Upload,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// =============================================================================
// Import Legacy Dialog Component
// =============================================================================

export interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
}

export function ImportDialog({ open, onOpenChange, onImportComplete }: ImportDialogProps) {
  const [isImporting, setIsImporting] = useState(false);
  const [resetLaunchCount, setResetLaunchCount] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setResult(null);
      setResetLaunchCount(false);
    }
  }, [open]);

  const handleImport = async () => {
    try {
      // Open file picker for JSON
      const selected = await dialog.open({
        multiple: false,
        filters: [{ name: 'JSON Files', extensions: ['json'] }],
      });

      if (!selected) return;

      setIsImporting(true);
      setResult(null);

      // Call backend import command with file path (backend reads the file)
      const importedCount = await invoke<number>('import_legacy_programs', {
        filePath: selected,
        resetLaunchCount,
      });

      setResult({
        success: true,
        message: `Successfully imported ${importedCount} program${importedCount !== 1 ? 's' : ''}`,
      });

      onImportComplete();
    } catch (e) {
      setResult({
        success: false,
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Import Legacy Programs</DialogTitle>
          <DialogDescription>
            Import programs from an autoservice JSON file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Reset Launch Count Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="reset-count" className="cursor-pointer">Reset launch counts</Label>
              <p className="text-xs text-muted-foreground">
                Start all programs at 0 launches
              </p>
            </div>
            <Switch
              id="reset-count"
              checked={resetLaunchCount}
              onCheckedChange={setResetLaunchCount}
            />
          </div>

          {/* Result Message */}
          {result && (
            <div className={`flex items-center gap-2 text-sm ${result.success ? 'text-green-600' : 'text-destructive'}`}>
              <AlertCircle className="h-4 w-4" />
              {result.message}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {result?.success ? 'Done' : 'Cancel'}
          </Button>
          <Button onClick={handleImport} disabled={isImporting}>
            {isImporting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Upload className="h-4 w-4 mr-2" />
            Select JSON File
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
