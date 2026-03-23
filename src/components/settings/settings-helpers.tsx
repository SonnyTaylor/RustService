/**
 * Settings helpers — shared types, constants, and utilities used across settings panels
 */

import {
  Globe,
  FileText,
  Folder,
  Database,
  Mail,
  Calendar,
  Settings,
  User,
  ShoppingCart,
  CreditCard,
  BarChart,
  Code,
  Terminal,
  Cloud,
  Lock,
  Wrench,
  Monitor,
  Smartphone,
  Headphones,
} from 'lucide-react';

// =============================================================================
// Icon Helper
// =============================================================================

/** Maps icon ID strings to Lucide icon components */
export function getIconComponent(iconId: string): React.ComponentType<{ className?: string }> {
  const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    'globe': Globe,
    'file-text': FileText,
    'folder': Folder,
    'database': Database,
    'mail': Mail,
    'calendar': Calendar,
    'settings': Settings,
    'user': User,
    'shopping-cart': ShoppingCart,
    'credit-card': CreditCard,
    'bar-chart': BarChart,
    'code': Code,
    'terminal': Terminal,
    'cloud': Cloud,
    'lock': Lock,
    'tool': Wrench, // Tool icon uses Wrench
    'wrench': Wrench,
    'monitor': Monitor,
    'smartphone': Smartphone,
    'headphones': Headphones,
  };
  return iconMap[iconId] ?? Globe;
}
