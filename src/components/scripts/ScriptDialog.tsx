/**
 * Script Dialog Component
 *
 * Dialog for creating and editing scripts.
 */

import { useState, useEffect } from 'react';
import {
  AlertCircle,
  Loader2,
  Terminal,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import type { Script, ScriptType } from '@/types/scripts';
import { SCRIPT_TYPE_OPTIONS } from '@/types/scripts';

export interface ScriptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  script?: Script | null;
  onSave: (data: {
    name: string;
    description: string;
    scriptType: ScriptType;
    content: string;
    runAsAdmin: boolean;
  }) => Promise<void>;
}

export function ScriptDialog({
  open,
  onOpenChange,
  script,
  onSave,
}: ScriptDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scriptType, setScriptType] = useState<ScriptType>('powershell');
  const [content, setContent] = useState('');
  const [runAsAdmin, setRunAsAdmin] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog opens/closes or script changes
  useEffect(() => {
    if (open) {
      if (script) {
        setName(script.name);
        setDescription(script.description);
        setScriptType(script.scriptType);
        setContent(script.content);
        setRunAsAdmin(script.runAsAdmin);
      } else {
        setName('');
        setDescription('');
        setScriptType('powershell');
        setContent('');
        setRunAsAdmin(false);
      }
      setError(null);
    }
  }, [open, script]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!content.trim()) {
      setError('Script content is required');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        scriptType,
        content: content.trim(),
        runAsAdmin,
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{script ? 'Edit Script' : 'Add Script'}</DialogTitle>
          <DialogDescription>
            {script
              ? 'Update script details'
              : 'Create a new PowerShell or CMD script'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Script Name"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this script do?"
            />
          </div>

          {/* Script Type */}
          <div className="space-y-2">
            <Label>Script Type</Label>
            <Select
              value={scriptType}
              onValueChange={(v) => setScriptType(v as ScriptType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCRIPT_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex items-center gap-2">
                      <Terminal className="h-4 w-4" />
                      {opt.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Script Content */}
          <div className="space-y-2">
            <Label htmlFor="content">Script Content</Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={
                scriptType === 'powershell'
                  ? 'Write-Host "Hello, World!"'
                  : 'echo Hello, World!'
              }
              className="font-mono text-sm h-40 resize-none"
            />
          </div>

          {/* Run as Admin Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="run-as-admin" className="cursor-pointer">
                Run as Administrator
              </Label>
              <p className="text-xs text-muted-foreground">
                Execute with elevated privileges (UAC prompt)
              </p>
            </div>
            <Switch
              id="run-as-admin"
              checked={runAsAdmin}
              onCheckedChange={setRunAsAdmin}
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
            {script ? 'Save Changes' : 'Add Script'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
