/**
 * RestorePointsSection Component
 *
 * Displays system restore points list with create/refresh controls and dialog.
 */

import {
  History,
  Plus,
  AlertCircle,
  Loader2,
  RefreshCw,
  Shield,
  Clock,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { RestorePointsResponse } from '@/components/system-info/types';
import { SectionHeader } from '@/components/system-info/system-info-helpers';
import { formatRestorePointDate } from '@/components/system-info/DiskHealthCard';

interface RestorePointsSectionProps {
  restorePoints: RestorePointsResponse | null;
  isLoading: boolean;
  onRefresh: () => void;
  /** Whether a create operation is in progress */
  isCreating: boolean;
  /** Description text for the create dialog input */
  description: string;
  onDescriptionChange: (value: string) => void;
  /** Whether the create dialog is open */
  dialogOpen: boolean;
  onDialogOpenChange: (value: boolean) => void;
  /** Error from the last create attempt */
  createError: string | null;
  /** Success message from the last create */
  createSuccess: string | null;
  /** Create a restore point */
  onCreateRestorePoint: () => void;
}

export function RestorePointsSection({
  restorePoints,
  isLoading,
  onRefresh,
  isCreating,
  description,
  onDescriptionChange,
  dialogOpen,
  onDialogOpenChange,
  createError,
  createSuccess,
  onCreateRestorePoint,
}: RestorePointsSectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionHeader icon={History} title="System Restore Points" iconColor="text-slate-500" />
        <div className="flex items-center gap-2">
          <Dialog open={dialogOpen} onOpenChange={onDialogOpenChange}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Create
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Restore Point</DialogTitle>
                <DialogDescription>
                  Create a Windows System Restore point. This may require administrator privileges.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <input
                  type="text"
                  placeholder="Description (e.g., Before driver update)"
                  value={description}
                  onChange={(e) => onDescriptionChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border bg-background text-sm"
                  maxLength={256}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && description.trim()) {
                      onCreateRestorePoint();
                    }
                  }}
                />
                {createError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">{createError}</AlertDescription>
                  </Alert>
                )}
              </div>
              <DialogFooter>
                <Button
                  onClick={onCreateRestorePoint}
                  disabled={!description.trim() || isCreating}
                >
                  {isCreating && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Create Restore Point
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {createSuccess && (
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription>{createSuccess}</AlertDescription>
        </Alert>
      )}

      {isLoading && !restorePoints && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            Loading restore points...
          </CardContent>
        </Card>
      )}

      {restorePoints && restorePoints.error && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{restorePoints.error}</AlertDescription>
        </Alert>
      )}

      {restorePoints && !restorePoints.error && restorePoints.restorePoints.length === 0 && (
        <Card>
          <CardContent className="py-6 text-center text-muted-foreground text-sm">
            No restore points found on this system.
          </CardContent>
        </Card>
      )}

      {restorePoints && restorePoints.restorePoints.length > 0 && (
        <div className="grid gap-3">
          {[...restorePoints.restorePoints]
            .sort((a, b) => b.sequenceNumber - a.sequenceNumber)
            .map((rp) => (
              <Card key={rp.sequenceNumber} className="overflow-hidden">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">{rp.description}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatRestorePointDate(rp.creationTime)}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {rp.restoreType}
                        </Badge>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-xs ml-2">
                      #{rp.sequenceNumber}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      )}
    </div>
  );
}
