/**
 * Service Card Wrapper
 *
 * Standardized Card + colored header used by all service renderers.
 * Provides consistent styling across the findings view.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getIcon } from '@/components/service/utils';
import type { ServiceDefinition, ServiceResult } from '@/types/service';

// =============================================================================
// Types
// =============================================================================

export interface StatusBadge {
  label: string;
  color: 'green' | 'yellow' | 'red' | 'blue';
}

export interface ServiceCardWrapperProps {
  definition: ServiceDefinition;
  result: ServiceResult;
  children: React.ReactNode;
  /** Override the display title (defaults to definition.name) */
  title?: string;
  /** Custom status badge (defaults to PASS/FAIL based on result.success) */
  statusBadge?: StatusBadge;
  /** Custom content to render in the badge area (overrides statusBadge entirely) */
  badgeContent?: React.ReactNode;
}

// =============================================================================
// Constants
// =============================================================================

const CATEGORY_GRADIENTS: Record<string, string> = {
  diagnostics: 'from-blue-500/10 to-cyan-500/10',
  cleanup: 'from-green-500/10 to-emerald-500/10',
  security: 'from-red-500/10 to-orange-500/10',
  maintenance: 'from-violet-500/10 to-purple-500/10',
};

const CATEGORY_ICON_BG: Record<string, string> = {
  diagnostics: 'bg-blue-500/20 text-blue-500',
  cleanup: 'bg-green-500/20 text-green-500',
  security: 'bg-red-500/20 text-red-500',
  maintenance: 'bg-violet-500/20 text-violet-500',
};

const BADGE_COLORS: Record<string, string> = {
  green: 'bg-green-500/10 text-green-500',
  yellow: 'bg-yellow-500/10 text-yellow-500',
  red: 'bg-red-500/10 text-red-500',
  blue: 'bg-blue-500/10 text-blue-500',
};

const FALLBACK_GRADIENT = 'from-muted/30 to-muted/20';
const FALLBACK_ICON_BG = 'bg-muted text-muted-foreground';

// =============================================================================
// Component
// =============================================================================

export function ServiceCardWrapper({
  definition,
  result,
  children,
  title,
  statusBadge,
  badgeContent,
}: ServiceCardWrapperProps) {
  const Icon = getIcon(definition.icon);
  const gradient = CATEGORY_GRADIENTS[definition.category] ?? FALLBACK_GRADIENT;
  const iconBg = CATEGORY_ICON_BG[definition.category] ?? FALLBACK_ICON_BG;

  // Determine badge
  const badge = statusBadge ?? {
    label: result.success ? 'PASS' : 'FAIL',
    color: result.success ? 'green' : 'red',
  } satisfies StatusBadge;

  const badgeClass = BADGE_COLORS[badge.color] ?? BADGE_COLORS.blue;

  return (
    <Card className={`overflow-hidden pt-0 ${!result.success ? 'border-l-4 border-l-destructive' : ''}`}>
      <CardHeader className={`py-3 px-4 bg-gradient-to-r ${gradient}`}>
        <CardTitle className="text-sm flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${iconBg}`}>
            <Icon className="h-4 w-4" />
          </div>
          {title ?? definition.name}
          <div className="ml-auto flex items-center gap-2">
            {badgeContent ?? (
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${badgeClass}`}>
                {badge.label}
              </span>
            )}
            <span className="text-xs text-muted-foreground font-normal">
              {(result.durationMs / 1000).toFixed(1)}s
            </span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-3">
        {children}
      </CardContent>
    </Card>
  );
}
