/**
 * Program Dialog Component
 *
 * Dialog for adding or editing a program entry.
 */

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import * as dialog from '@tauri-apps/plugin-dialog';
import {
  AppWindow,
  Image,
  AlertCircle,
  Loader2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

import type { Program } from '@/types/programs';

// =============================================================================
// Program Dialog Component
// =============================================================================

export interface ProgramDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  program?: Program | null;
  onSave: (data: {
    name: string;
    description: string;
    version: string;
    exePath: string;
    isCli: boolean;
    iconPath: string | null;
  }) => Promise<void>;
}

export function ProgramDialog({ open, onOpenChange, program, onSave }: ProgramDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [version, setVersion] = useState('');
  const [exePath, setExePath] = useState('');
  const [isCli, setIsCli] = useState(false);
  const [iconPath, setIconPath] = useState<string | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog opens/closes or program changes
  useEffect(() => {
    if (open) {
      if (program) {
        setName(program.name);
        setDescription(program.description);
        setVersion(program.version);
        setExePath(program.exePath);
        setIsCli(program.isCli);
        setIconPath(program.iconPath);
        setIconPreview(program.iconPath ? `icon://${program.iconPath}` : null);
      } else {
        setName('');
        setDescription('');
        setVersion('');
        setExePath('');
        setIsCli(false);
        setIconPath(null);
        setIconPreview(null);
      }
      setError(null);
    }
  }, [open, program]);

  // Load icon preview
  useEffect(() => {
    async function loadIconPreview() {
      if (iconPath) {
        try {
          // Use backend command for secure local file access
          const url = await invoke<string | null>('get_program_icon', { iconPath });
          setIconPreview(url);
        } catch {
          setIconPreview(null);
        }
      }
    }
    loadIconPreview();
  }, [iconPath]);

  const handleBrowseExe = async () => {
    try {
      const selected = await dialog.open({
        multiple: false,
        filters: [{ name: 'Executables', extensions: ['exe'] }],
      });

      if (selected) {
        setExePath(selected);
        setError(null);

        // Auto-extract icon
        setIsExtracting(true);
        try {
          const extractedPath = await invoke<string>('extract_program_icon', {
            exePath: selected
          });
          setIconPath(extractedPath);
        } catch (e) {
          console.warn('Could not extract icon:', e);
          // Not a fatal error, continue without icon
        } finally {
          setIsExtracting(false);
        }

        // Try to auto-fill name from filename
        if (!name) {
          const filename = selected.split(/[/\\]/).pop()?.replace('.exe', '') || '';
          setName(filename.charAt(0).toUpperCase() + filename.slice(1));
        }
      }
    } catch (e) {
      console.error('Failed to open file dialog:', e);
    }
  };

  const handleBrowseIcon = async () => {
    try {
      const selected = await dialog.open({
        multiple: false,
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'ico', 'bmp'] }],
      });

      if (selected) {
        setIconPath(selected);
        // Custom icons will preview after save - just show placeholder
        setIconPreview(null);
      }
    } catch (e) {
      console.error('Failed to open file dialog:', e);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!exePath.trim()) {
      setError('Executable path is required');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        version: version.trim(),
        exePath: exePath.trim(),
        isCli,
        iconPath,
      });
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{program ? 'Edit Program' : 'Add Program'}</DialogTitle>
          <DialogDescription>
            {program ? 'Update program details' : 'Add a portable program to your launcher'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Executable Path */}
          <div className="space-y-2">
            <Label htmlFor="exe-path">Executable</Label>
            <div className="flex gap-2">
              <Input
                id="exe-path"
                value={exePath}
                onChange={(e) => setExePath(e.target.value)}
                placeholder="C:\path\to\program.exe"
                className="flex-1"
              />
              <Button type="button" variant="outline" onClick={handleBrowseExe}>
                Browse
              </Button>
            </div>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Program Name"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this program do?"
            />
          </div>

          {/* Version */}
          <div className="space-y-2">
            <Label htmlFor="version">Version</Label>
            <Input
              id="version"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="1.0.0"
            />
          </div>

          {/* Icon */}
          <div className="space-y-2">
            <Label>Icon</Label>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg border bg-muted flex items-center justify-center overflow-hidden">
                {isExtracting ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : iconPreview ? (
                  <img
                    src={iconPreview}
                    alt="Icon preview"
                    className="w-full h-full object-cover"
                    onError={() => setIconPreview(null)}
                  />
                ) : (
                  <AppWindow className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={handleBrowseIcon}>
                <Image className="h-4 w-4 mr-2" />
                Custom Icon
              </Button>
            </div>
          </div>

          {/* CLI Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="is-cli" className="cursor-pointer">CLI Tool</Label>
              <p className="text-xs text-muted-foreground">
                Cannot be launched from the GUI
              </p>
            </div>
            <Switch
              id="is-cli"
              checked={isCli}
              onCheckedChange={setIsCli}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {program ? 'Save Changes' : 'Add Program'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
