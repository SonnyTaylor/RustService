/**
 * AI Script Dialog Component
 *
 * Dialog for generating scripts via AI.
 */

import { useState, useEffect } from 'react';
import {
  AlertCircle,
  Loader2,
  Sparkles,
  Terminal,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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

import type { ScriptType } from '@/types/scripts';
import { SCRIPT_TYPE_OPTIONS } from '@/types/scripts';
import { useSettings } from '@/components/settings-context';
import { aiGenerateScript } from '@/lib/ai-features';

export interface AIScriptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerated: (data: {
    name: string;
    description: string;
    scriptType: ScriptType;
    content: string;
    runAsAdmin: boolean;
  }) => void;
}

export function AIScriptDialog({
  open,
  onOpenChange,
  onGenerated,
}: AIScriptDialogProps) {
  const { settings } = useSettings();
  const [prompt, setPrompt] = useState('');
  const [scriptType, setScriptType] = useState<ScriptType>('powershell');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);

  useEffect(() => {
    if (open) {
      setPrompt('');
      setError(null);
      setIsGenerating(false);
    } else {
      abortController?.abort();
    }
  }, [open]);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please describe what the script should do');
      return;
    }
    setIsGenerating(true);
    setError(null);

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const result = await aiGenerateScript(
        prompt.trim(),
        scriptType,
        settings.agent,
        controller.signal
      );
      onOpenChange(false);
      onGenerated({
        name: result.name,
        description: result.description,
        scriptType,
        content: result.content,
        runAsAdmin: result.runAsAdmin,
      });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setIsGenerating(false);
      setAbortController(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            Generate Script with AI
          </DialogTitle>
          <DialogDescription>
            Describe what you want the script to do and AI will generate it for
            you. You can review and edit before saving.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
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

          {/* Prompt */}
          <div className="space-y-2">
            <Label htmlFor="ai-prompt">What should the script do?</Label>
            <Textarea
              id="ai-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  handleGenerate();
                }
              }}
              placeholder="e.g. Clean temporary files and browser caches to free up disk space"
              className="h-28 resize-none"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Press Ctrl+Enter to generate
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isGenerating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !prompt.trim()}
            className="gap-2 bg-purple-600 hover:bg-purple-700"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {isGenerating ? 'Generating...' : 'Generate Script'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
