/**
 * Business Panel Component
 *
 * Configure business branding, details, and technician management.
 */

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import * as dialog from '@tauri-apps/plugin-dialog';
import {
  Check,
  Building2,
  Plus,
  Pencil,
  X,
  ImageIcon,
  User,
  Upload,
  Loader2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { useSettings } from '@/components/settings-context';
import type { BusinessSettings } from '@/types/settings';
import { DEFAULT_BUSINESS } from '@/types/settings';

export function BusinessPanel() {
  const { settings, updateSetting, isLoading } = useSettings();
  const [newTechnician, setNewTechnician] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');

  // Local state for form fields - prevents race conditions when typing
  const [localName, setLocalName] = useState('');
  const [localAddress, setLocalAddress] = useState('');
  const [localPhone, setLocalPhone] = useState('');
  const [localEmail, setLocalEmail] = useState('');
  const [localWebsite, setLocalWebsite] = useState('');
  const [localTfn, setLocalTfn] = useState('');
  const [localAbn, setLocalAbn] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  const business = settings.business ?? DEFAULT_BUSINESS;

  // Initialize local state from settings when they load
  useEffect(() => {
    if (!isLoading && !initialized) {
      setLocalName(business.name);
      setLocalAddress(business.address);
      setLocalPhone(business.phone);
      setLocalEmail(business.email);
      setLocalWebsite(business.website);
      setLocalTfn(business.tfn);
      setLocalAbn(business.abn);
      setInitialized(true);
      // Load logo preview on initialization
      if (business.logoPath) {
        loadLogoPreview(business.logoPath);
      }
    }
  }, [business, isLoading, initialized]);

  // Reset initialized when business mode is toggled to re-sync
  useEffect(() => {
    if (business.enabled) {
      setLocalName(business.name);
      setLocalAddress(business.address);
      setLocalPhone(business.phone);
      setLocalEmail(business.email);
      setLocalWebsite(business.website);
      setLocalTfn(business.tfn);
      setLocalAbn(business.abn);
      // Load logo preview
      if (business.logoPath) {
        loadLogoPreview(business.logoPath);
      }
    }
  }, [business.enabled]);

  const handleToggleEnabled = async (checked: boolean) => {
    await updateSetting('business.enabled', checked);
  };

  // Save on blur instead of on every keystroke
  // Load logo preview from backend
  const loadLogoPreview = async (logoPath: string) => {
    if (logoPath) {
      try {
        const url = await invoke<string | null>('get_business_logo', { logoPath });
        setLogoPreview(url);
      } catch {
        setLogoPreview(null);
      }
    } else {
      setLogoPreview(null);
    }
  };

  // Browse and upload business logo
  const handleBrowseLogo = async () => {
    try {
      const selected = await dialog.open({
        multiple: false,
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'ico', 'bmp'] }],
      });

      if (selected) {
        setIsUploadingLogo(true);
        try {
          // Save the logo to data directory and get relative path
          const savedPath = await invoke<string>('save_business_logo', {
            sourcePath: selected,
          });
          await updateSetting('business.logoPath', savedPath);
          await loadLogoPreview(savedPath);
        } catch (e) {
          console.error('Failed to save logo:', e);
        } finally {
          setIsUploadingLogo(false);
        }
      }
    } catch (e) {
      console.error('Failed to open file dialog:', e);
    }
  };

  // Clear the logo
  const handleClearLogo = async () => {
    setLogoPreview(null);
    await updateSetting('business.logoPath', '');
  };

  const handleFieldBlur = async (field: keyof BusinessSettings, value: string) => {
    const currentValue = field === 'logoPath' ? (business.logoPath ?? '') : (business[field] as string);
    if (value !== currentValue) {
      await updateSetting(`business.${field}` as 'business.name', value);
    }
  };

  const handleAddTechnician = async () => {
    if (!newTechnician.trim()) return;
    const updated = [...business.technicians, newTechnician.trim()];
    await updateSetting('business.technicians', updated);
    setNewTechnician('');
  };

  const handleRemoveTechnician = async (index: number) => {
    const updated = business.technicians.filter((_, i) => i !== index);
    await updateSetting('business.technicians', updated);
  };

  const handleStartEdit = (index: number) => {
    setEditingIndex(index);
    setEditingName(business.technicians[index]);
  };

  const handleSaveEdit = async () => {
    if (editingIndex === null || !editingName.trim()) return;
    const updated = [...business.technicians];
    updated[editingIndex] = editingName.trim();
    await updateSetting('business.technicians', updated);
    setEditingIndex(null);
    setEditingName('');
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditingName('');
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-semibold mb-1">Business Mode</h3>
        <p className="text-muted-foreground">
          Configure business branding and technician information for customer reports
        </p>
      </div>

      {/* Enable Business Mode */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5 text-orange-500" />
            Business Mode
          </CardTitle>
          <CardDescription>
            Enable business branding on reports and service receipts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div>
              <Label htmlFor="business-enabled" className="text-sm font-medium">Enable Business Mode</Label>
              <p className="text-xs text-muted-foreground">Show business details on prints and reports</p>
            </div>
            <Switch
              id="business-enabled"
              checked={business.enabled}
              onCheckedChange={handleToggleEnabled}
              disabled={isLoading}
            />
          </div>
        </CardContent>
      </Card>

      {/* Business Details - Only show if enabled */}
      {business.enabled && (
        <>
          {/* Business Info */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-blue-500" />
                Business Details
              </CardTitle>
              <CardDescription>
                Your business information displayed on customer reports
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="business-name">Business Name</Label>
                  <Input
                    id="business-name"
                    placeholder="Techbay Computer Specialists"
                    value={localName}
                    onChange={(e) => setLocalName(e.target.value)}
                    onBlur={() => handleFieldBlur('name', localName)}
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="business-address">Address</Label>
                  <Input
                    id="business-address"
                    placeholder="336 Highett Rd, Highett VIC 3190"
                    value={localAddress}
                    onChange={(e) => setLocalAddress(e.target.value)}
                    onBlur={() => handleFieldBlur('address', localAddress)}
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="business-phone">Phone</Label>
                  <Input
                    id="business-phone"
                    placeholder="03 9554 4321"
                    value={localPhone}
                    onChange={(e) => setLocalPhone(e.target.value)}
                    onBlur={() => handleFieldBlur('phone', localPhone)}
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="business-email">Email</Label>
                  <Input
                    id="business-email"
                    placeholder="admin@techbay.net.au"
                    value={localEmail}
                    onChange={(e) => setLocalEmail(e.target.value)}
                    onBlur={() => handleFieldBlur('email', localEmail)}
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="business-website">Website</Label>
                  <Input
                    id="business-website"
                    placeholder="https://www.techbay.net.au"
                    value={localWebsite}
                    onChange={(e) => setLocalWebsite(e.target.value)}
                    onBlur={() => handleFieldBlur('website', localWebsite)}
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* Business Logo - Full Width */}
              <div className="space-y-2">
                <Label>Business Logo (optional)</Label>
                <div className="flex items-center gap-4">
                  {/* Logo Preview */}
                  <div className="w-20 h-20 rounded-lg border-2 border-dashed bg-muted/50 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {isUploadingLogo ? (
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    ) : logoPreview ? (
                      <img
                        src={logoPreview}
                        alt="Business logo preview"
                        className="w-full h-full object-contain"
                        onError={() => setLogoPreview(null)}
                      />
                    ) : (
                      <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
                    )}
                  </div>

                  {/* Upload/Change Button */}
                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleBrowseLogo}
                      disabled={isLoading || isUploadingLogo}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {logoPreview ? 'Change Logo' : 'Upload Logo'}
                    </Button>
                    {logoPreview && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleClearLogo}
                        disabled={isLoading}
                        className="text-destructive hover:text-destructive"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Remove Logo
                      </Button>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Supports PNG, JPG, ICO, BMP
                    </p>
                  </div>
                </div>
              </div>

              <Separator className="my-4" />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="business-tfn">TFN (Tax File Number)</Label>
                  <Input
                    id="business-tfn"
                    placeholder="123 456 789"
                    value={localTfn}
                    onChange={(e) => setLocalTfn(e.target.value)}
                    onBlur={() => handleFieldBlur('tfn', localTfn)}
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="business-abn">ABN (Australian Business Number)</Label>
                  <Input
                    id="business-abn"
                    placeholder="12 345 678 910"
                    value={localAbn}
                    onChange={(e) => setLocalAbn(e.target.value)}
                    onBlur={() => handleFieldBlur('abn', localAbn)}
                    disabled={isLoading}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Technicians */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-5 w-5 text-green-500" />
                Technicians
              </CardTitle>
              <CardDescription>
                Manage technicians who can be assigned to services
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Technician List */}
              {business.technicians.length > 0 ? (
                <div className="space-y-2">
                  {business.technicians.map((tech, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 group"
                    >
                      {editingIndex === index ? (
                        <>
                          <Input
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="flex-1"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEdit();
                              if (e.key === 'Escape') handleCancelEdit();
                            }}
                          />
                          <Button size="sm" onClick={handleSaveEdit} disabled={isLoading}>
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="flex-1 font-medium">{tech}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleStartEdit(index)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                            onClick={() => handleRemoveTechnician(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  No technicians added yet. Add your first technician below.
                </p>
              )}

              {/* Add Technician */}
              <div className="flex gap-2">
                <Input
                  placeholder="Enter technician name..."
                  value={newTechnician}
                  onChange={(e) => setNewTechnician(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddTechnician();
                  }}
                  disabled={isLoading}
                />
                <Button onClick={handleAddTechnician} disabled={isLoading || !newTechnician.trim()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
