/**
 * Appearance Panel Component
 *
 * Theme mode, color scheme selection, and animation toggle settings.
 */

import {
  Sun,
  Moon,
  Monitor,
  Check,
  Palette,
  Zap,
  Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useSettings } from '@/components/settings-context';
import { useTheme } from '@/components/theme-provider';
import type { ThemeMode } from '@/types/settings';
import { COLOR_SCHEMES } from '@/types/settings';

// =============================================================================
// Animation Toggle
// =============================================================================

/**
 * Animation toggle component for appearance panel
 */
function AnimationToggle() {
  const { settings, updateSetting, isLoading } = useSettings();
  const animationsEnabled = settings.appearance?.enableAnimations ?? true;

  const handleToggle = async (checked: boolean) => {
    await updateSetting('appearance.enableAnimations', checked);
  };

  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
      <div className="flex items-center gap-3">
        <Sparkles className={`h-5 w-5 ${animationsEnabled ? 'text-yellow-500' : 'text-muted-foreground'}`} />
        <div>
          <Label htmlFor="enable-animations" className="text-sm font-medium">Enable animations</Label>
          <p className="text-xs text-muted-foreground">Smooth transitions and motion effects throughout the app</p>
        </div>
      </div>
      <Switch
        id="enable-animations"
        checked={animationsEnabled}
        onCheckedChange={handleToggle}
        disabled={isLoading}
      />
    </div>
  );
}

// =============================================================================
// Appearance Panel
// =============================================================================

export function AppearancePanel() {
  const { themeMode, colorScheme, setThemeMode, setColorScheme } = useTheme();

  const themeOptions: { value: ThemeMode; label: string; icon: LucideIcon }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-semibold mb-1">Appearance</h3>
        <p className="text-muted-foreground">
          Customize how the application looks
        </p>
      </div>

      {/* Theme Mode & Color Scheme - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Theme Mode Card */}
        <Card className="h-fit">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Sun className="h-5 w-5 text-amber-500" />
              Theme Mode
            </CardTitle>
            <CardDescription>Choose between light and dark mode</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              {themeOptions.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setThemeMode(value)}
                  className={`
                    flex flex-col items-center gap-3 p-5 rounded-xl border-2
                    transition-all duration-200 hover:scale-[1.02]
                    ${themeMode === value
                      ? 'border-primary bg-primary/10 shadow-md'
                      : 'border-border hover:border-primary/50 hover:bg-muted/50'
                    }
                  `}
                >
                  <Icon className={`h-6 w-6 ${themeMode === value ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className={`text-sm font-medium ${themeMode === value ? 'text-primary' : ''}`}>
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Color Preview Card */}
        <Card className="h-fit">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Palette className="h-5 w-5 text-pink-500" />
              Current Theme
            </CardTitle>
            <CardDescription>Preview of your current color scheme</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Current scheme display */}
              {(() => {
                const currentScheme = COLOR_SCHEMES.find(s => s.id === colorScheme);
                return currentScheme ? (
                  <div className="p-4 rounded-xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
                    <div className="flex items-center gap-3">
                      <div className="flex gap-2">
                        <div
                          className="w-8 h-8 rounded-full border-2 border-background shadow-md"
                          style={{ backgroundColor: currentScheme.preview.primary }}
                        />
                        <div
                          className="w-8 h-8 rounded-full border-2 border-background shadow-md"
                          style={{ backgroundColor: currentScheme.preview.accent }}
                        />
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-lg">{currentScheme.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {currentScheme.description}
                        </div>
                      </div>
                      <Check className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                ) : null;
              })()}
              {/* Sample UI elements */}
              <div className="flex flex-wrap gap-2">
                <Badge>Primary Badge</Badge>
                <Badge variant="secondary">Secondary</Badge>
                <Badge variant="outline">Outline</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Color Scheme Selection - Full Width Grid */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            Color Scheme
          </CardTitle>
          <CardDescription>Choose a color palette for the interface</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {COLOR_SCHEMES.map((scheme) => (
              <button
                key={scheme.id}
                onClick={() => setColorScheme(scheme.id)}
                className={`
                  relative flex flex-col gap-3 p-4 rounded-xl border-2 text-left
                  transition-all duration-200 hover:scale-[1.02]
                  ${colorScheme === scheme.id
                    ? 'border-primary bg-primary/5 shadow-md'
                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
                  }
                `}
              >
                {/* Color preview dots */}
                <div className="flex gap-2">
                  <div
                    className="w-5 h-5 rounded-full border border-border/50 shadow-sm"
                    style={{ backgroundColor: scheme.preview.primary }}
                  />
                  <div
                    className="w-5 h-5 rounded-full border border-border/50 shadow-sm"
                    style={{ backgroundColor: scheme.preview.accent }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm flex items-center gap-2">
                    {scheme.name}
                    {colorScheme === scheme.id && (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate mt-0.5">
                    {scheme.description}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Animations Toggle */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Animations
          </CardTitle>
          <CardDescription>Control motion and transition effects</CardDescription>
        </CardHeader>
        <CardContent>
          <AnimationToggle />
        </CardContent>
      </Card>
    </div>
  );
}
