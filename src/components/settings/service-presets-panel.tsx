/**
 * Service Presets Panel Component
 *
 * Create, edit, and manage service preset configurations.
 */

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Loader2,
  Layers,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import type { ServicePreset } from '@/types/service';

// =============================================================================
// Service Presets Panel
// =============================================================================

export function ServicePresetsPanel() {
  const [presets, setPresets] = useState<ServicePreset[]>([]);
  const [builtinIds, setBuiltinIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingPreset, setEditingPreset] = useState<ServicePreset | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form state for editing
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formIcon, setFormIcon] = useState('layers');
  const [formColor, setFormColor] = useState('blue');

  const loadPresets = async () => {
    try {
      const [presetsData, builtinData] = await Promise.all([
        invoke<ServicePreset[]>('get_service_presets'),
        invoke<string[]>('get_builtin_preset_ids'),
      ]);
      setPresets(presetsData);
      setBuiltinIds(builtinData);
    } catch (e) {
      console.error('Failed to load presets:', e);
    }
  };

  useEffect(() => {
    async function init() {
      setIsLoading(true);
      await loadPresets();
      setIsLoading(false);
    }
    init();
  }, []);

  const isBuiltin = (presetId: string) => builtinIds.includes(presetId);

  const handleStartAdd = () => {
    setIsAdding(true);
    setFormName('');
    setFormDescription('');
    setFormIcon('layers');
    setFormColor('blue');
    setEditingPreset(null);
  };

  const handleStartEdit = (preset: ServicePreset) => {
    setEditingPreset(preset);
    setFormName(preset.name);
    setFormDescription(preset.description);
    setFormIcon(preset.icon);
    setFormColor(preset.color);
    setIsAdding(false);
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingPreset(null);
    setFormName('');
    setFormDescription('');
    setFormIcon('layers');
    setFormColor('blue');
  };

  const handleSave = async () => {
    if (!formName.trim()) return;

    setIsSaving(true);
    try {
      const preset: ServicePreset = {
        id: editingPreset?.id || crypto.randomUUID(),
        name: formName.trim(),
        description: formDescription.trim(),
        icon: formIcon,
        color: formColor,
        services: editingPreset?.services || [],
      };

      await invoke('save_service_preset', { preset });
      await loadPresets();
      handleCancel();
    } catch (e) {
      console.error('Failed to save preset:', e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (presetId: string) => {
    if (!confirm('Are you sure you want to delete this preset?')) return;

    try {
      await invoke('delete_service_preset', { presetId });
      await loadPresets();
    } catch (e) {
      console.error('Failed to delete preset:', e);
    }
  };

  const handleReset = async (presetId: string) => {
    if (!confirm('Reset this preset to its default configuration?')) return;

    try {
      await invoke('delete_service_preset', { presetId });
      await loadPresets();
    } catch (e) {
      console.error('Failed to reset preset:', e);
    }
  };

  const colorOptions = [
    { value: 'blue', label: 'Blue' },
    { value: 'green', label: 'Green' },
    { value: 'purple', label: 'Purple' },
    { value: 'orange', label: 'Orange' },
    { value: 'red', label: 'Red' },
    { value: 'teal', label: 'Teal' },
    { value: 'pink', label: 'Pink' },
  ];

  const iconOptions = [
    { value: 'layers', label: 'Layers' },
    { value: 'stethoscope', label: 'Stethoscope' },
    { value: 'wrench', label: 'Wrench' },
    { value: 'shield-check', label: 'Shield' },
    { value: 'settings-2', label: 'Settings' },
    { value: 'zap', label: 'Zap' },
    { value: 'sparkles', label: 'Sparkles' },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-semibold mb-1">Service Presets</h3>
          <p className="text-muted-foreground">
            Customize and create service preset configurations
          </p>
        </div>
        <Button onClick={handleStartAdd} disabled={isAdding || editingPreset !== null}>
          <Plus className="h-4 w-4 mr-2" />
          New Preset
        </Button>
      </div>

      {/* Add/Edit Form */}
      {(isAdding || editingPreset) && (
        <Card className="border-primary/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">
              {isAdding ? 'Create New Preset' : 'Edit Preset'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="preset-name">Name</Label>
                <Input
                  id="preset-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="My Custom Preset"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="preset-color">Color</Label>
                <Select value={formColor} onValueChange={setFormColor}>
                  <SelectTrigger id="preset-color">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {colorOptions.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: `var(--${c.value === 'blue' ? 'primary' : c.value})` }}
                          />
                          {c.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="preset-description">Description</Label>
              <Input
                id="preset-description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="A brief description of this preset"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="preset-icon">Icon</Label>
              <Select value={formIcon} onValueChange={setFormIcon}>
                <SelectTrigger id="preset-icon" className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {iconOptions.map((i) => (
                    <SelectItem key={i.value} value={i.value}>
                      {i.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <p className="text-sm text-muted-foreground">
              To configure which services are included in this preset, select it on the Services page and customize from there.
            </p>
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={isSaving || !formName.trim()}>
                {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Save Preset
              </Button>
              <Button variant="ghost" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Presets List */}
      <div className="space-y-3">
        {presets.map((preset) => {
          const isBuiltinPreset = isBuiltin(preset.id);

          return (
            <Card key={preset.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div
                    className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 bg-${preset.color}-500/10`}
                  >
                    <Layers className={`h-6 w-6 text-${preset.color}-500`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium truncate">{preset.name}</h4>
                      {isBuiltinPreset && (
                        <Badge variant="secondary" className="text-xs">Built-in</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {preset.description}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {preset.services.filter((s: { enabled: boolean }) => s.enabled).length} services enabled
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleStartEdit(preset)}
                      disabled={editingPreset !== null || isAdding}
                    >
                      <Pencil className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    {isBuiltinPreset ? (
                      // Can only reset built-in presets if they've been customized
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleReset(preset.id)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Reset
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(preset.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {presets.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Layers className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              No service presets available. Create one to get started.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
