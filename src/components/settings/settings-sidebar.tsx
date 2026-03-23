/**
 * Settings Sidebar Component
 *
 * Navigation sidebar for settings categories with icon-based items.
 */

import {
  Settings,
  Palette,
  FolderOpen,
  Info,
  ChevronRight,
  FileText,
  Building2,
  Sparkles,
  Package,
  Globe,
  Timer,
  Layers,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { SettingsCategory } from '@/types/settings';

// =============================================================================
// Types
// =============================================================================

export interface SidebarItem {
  id: SettingsCategory;
  label: string;
  description: string;
  icon: LucideIcon;
  iconColor: string;
}

// =============================================================================
// Constants
// =============================================================================

export const SIDEBAR_ITEMS: SidebarItem[] = [
  {
    id: 'appearance',
    label: 'Appearance',
    description: 'Theme and colors',
    icon: Palette,
    iconColor: 'text-pink-500',
  },
  {
    id: 'data',
    label: 'Data & Storage',
    description: 'Folders and logs',
    icon: FolderOpen,
    iconColor: 'text-green-500',
  },
  {
    id: 'reports',
    label: 'Reports',
    description: 'Report settings',
    icon: FileText,
    iconColor: 'text-blue-500',
  },
  {
    id: 'business',
    label: 'Business',
    description: 'Branding & technicians',
    icon: Building2,
    iconColor: 'text-orange-500',
  },
  {
    id: 'programs',
    label: 'Required Programs',
    description: 'Service dependencies',
    icon: Package,
    iconColor: 'text-cyan-500',
  },
  {
    id: 'servicePresets',
    label: 'Service Presets',
    description: 'Preset configurations',
    icon: Layers,
    iconColor: 'text-amber-500',
  },
  {
    id: 'technicianTabs',
    label: 'Technician Tabs',
    description: 'Custom web tabs',
    icon: Globe,
    iconColor: 'text-indigo-500',
  },
  {
    id: 'serviceMetrics',
    label: 'Service Metrics',
    description: 'Timing & estimates',
    icon: Timer,
    iconColor: 'text-teal-500',
  },
  {
    id: 'agent',
    label: 'AI Agent',
    description: 'Provider & execution',
    icon: Sparkles,
    iconColor: 'text-violet-500',
  },
  {
    id: 'about',
    label: 'About',
    description: 'Version info',
    icon: Info,
    iconColor: 'text-purple-500',
  },
];

// =============================================================================
// Sidebar Component
// =============================================================================

interface SettingsSidebarProps {
  activeCategory: SettingsCategory;
  onCategoryChange: (category: SettingsCategory) => void;
}

export function SettingsSidebar({ activeCategory, onCategoryChange }: SettingsSidebarProps) {
  return (
    <div className="w-52 border-r bg-muted/30 flex flex-col">
      <div className="flex items-center gap-2 p-4 border-b">
        <Settings className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Settings</h2>
      </div>

      <nav className="flex-1 p-2 space-y-1">
        {SIDEBAR_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeCategory === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onCategoryChange(item.id)}
              className={`
                w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left
                transition-colors duration-150
                ${isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
                }
              `}
            >
              <Icon className={`h-4 w-4 ${isActive ? '' : item.iconColor}`} />
              <span className="text-sm font-medium truncate">{item.label}</span>
              {isActive && (
                <ChevronRight className="h-4 w-4 ml-auto flex-shrink-0" />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
