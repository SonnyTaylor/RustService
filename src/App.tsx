/**
 * RustService Main Application
 * 
 * Windows desktop toolkit for computer repair technicians.
 * Tab-based navigation with 8 main sections plus custom technician tabs.
 */

import { useState, useEffect, ReactNode, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Wrench,
  Monitor,
  TestTube,
  Zap,
  AppWindow,
  ScrollText,
  FileText,
  Settings,
  Globe,
  ChevronDown,
  // Icon picker icons
  Folder,
  Database,
  Mail,
  Calendar,
  ShoppingCart,
  CreditCard,
  BarChart,
  Code,
  Terminal,
  Cloud,
  Lock,
  Smartphone,
  Headphones,
  User,
} from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ThemeProvider } from '@/components/theme-provider';
import { SettingsProvider, useSettings } from '@/components/settings-context';
import { AnimationProvider, useAnimation, motion, AnimatePresence, tabContentVariants } from '@/components/animation-context';
import { Titlebar } from '@/components/titlebar';
import { IframeTabContent } from '@/components/IframeTabContent';
import {
  ServicePage,
  SystemInfoPage,
  ComponentTestPage,
  ShortcutsPage,
  ProgramsPage,
  ScriptsPage,
  ReportsPage,
  SettingsPage,
} from '@/pages';
import type { TechnicianTab } from '@/types/settings';

import '@/styles/globals.css';

/** Maps icon ID strings to Lucide icon components */
function getIconComponent(iconId: string): React.ComponentType<{ className?: string }> {
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
    'tool': Wrench,
    'wrench': Wrench,
    'monitor': Monitor,
    'smartphone': Smartphone,
    'headphones': Headphones,
  };
  return iconMap[iconId] ?? Globe;
}

/** Gets favicon URL for a website using DuckDuckGo's favicon service */
function getFaviconUrl(siteUrl: string): string {
  try {
    const url = new URL(siteUrl);
    // Use DuckDuckGo's favicon service - more reliable
    return `https://icons.duckduckgo.com/ip3/${url.hostname}.ico`;
  } catch {
    return '';
  }
}

/** Component that displays either a preset icon or the website's favicon */
function TechnicianTabIcon({ tab, useFavicons }: { tab: TechnicianTab; useFavicons: boolean }) {
  const [faviconError, setFaviconError] = useState(false);
  
  // If tab has a preset icon, use it
  if (tab.icon) {
    const IconComponent = getIconComponent(tab.icon);
    return <IconComponent className="h-4 w-4" />;
  }
  
  // Otherwise try favicon if enabled
  if (useFavicons && !faviconError) {
    const faviconUrl = getFaviconUrl(tab.url);
    if (faviconUrl) {
      return (
        <img 
          src={faviconUrl} 
          alt=""
          className="h-4 w-4"
          onError={() => setFaviconError(true)}
        />
      );
    }
  }
  
  // Fallback to globe icon
  return <Globe className="h-4 w-4" />;
}

/**
 * Tab configuration for main navigation
 */
const TABS = [
  { id: 'service', label: 'Service', icon: Wrench, component: ServicePage },
  { id: 'system-info', label: 'System Info', icon: Monitor, component: SystemInfoPage },
  { id: 'component-test', label: 'Component Test', icon: TestTube, component: ComponentTestPage },
  { id: 'shortcuts', label: 'Shortcuts', icon: Zap, component: ShortcutsPage },
  { id: 'programs', label: 'Programs', icon: AppWindow, component: ProgramsPage },
  { id: 'scripts', label: 'Scripts', icon: ScrollText, component: ScriptsPage },
  { id: 'reports', label: 'Reports', icon: FileText, component: ReportsPage },
  { id: 'settings', label: 'Settings', icon: Settings, component: SettingsPage },
] as const;

/** Number of technician tabs to show before using dropdown */
const VISIBLE_TECH_TABS = 3;

/**
 * Animated tab content wrapper
 */
function AnimatedTabContent({ id, children }: { id: string; children: ReactNode }) {
  const { animationsEnabled } = useAnimation();

  if (!animationsEnabled) {
    return <>{children}</>;
  }

  return (
    <motion.div
      key={id}
      variants={tabContentVariants}
      initial="hidden"
      animate="show"
      exit="exit"
      className="flex-1 flex flex-col min-h-0"
    >
      {children}
    </motion.div>
  );
}

/**
 * App content with animations
 */
function AppContent() {
  const [activeTab, setActiveTab] = useState('service');
  const { animationsEnabled } = useAnimation();
  const { settings } = useSettings();

  // Get technician tabs from settings
  const technicianTabs = useMemo(() => 
    settings.technicianTabs?.tabs ?? [],
    [settings.technicianTabs?.tabs]
  );
  const useFavicons = settings.technicianTabs?.useFavicons ?? true;

  // Split technician tabs into visible and overflow
  const visibleTechTabs = technicianTabs.slice(0, VISIBLE_TECH_TABS);
  const overflowTechTabs = technicianTabs.slice(VISIBLE_TECH_TABS);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<string>;
      const nextTab = custom.detail;
      if (typeof nextTab !== 'string') return;
      // Check both regular tabs and technician tabs
      if (TABS.some((t) => t.id === nextTab) || technicianTabs.some(t => `tech-${t.id}` === nextTab)) {
        setActiveTab(nextTab);
      }
    };

    window.addEventListener('navigate-tab', handler as EventListener);
    return () => window.removeEventListener('navigate-tab', handler as EventListener);
  }, [technicianTabs]);

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Custom Titlebar */}
      <Titlebar />

      {/* Main Content with Tabs */}
      <Tabs 
        value={activeTab} 
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col min-h-0"
      >
        {/* Tab Navigation */}
        <TabsList className="w-full justify-start rounded-none border-b bg-muted/50 px-2 h-auto py-1 flex-shrink-0">
          {/* Regular tabs */}
          {TABS.map(({ id, label, icon: Icon }) => (
            <TabsTrigger
              key={id}
              value={id}
              className="flex items-center gap-2 px-3 py-1.5 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md transition-all duration-150"
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </TabsTrigger>
          ))}

          {/* Separator and technician tabs */}
          {technicianTabs.length > 0 && (
            <>
              <Separator orientation="vertical" className="h-6 mx-2" />
              
              {/* Visible technician tabs */}
              {visibleTechTabs.map((tab) => (
                <TabsTrigger
                  key={`tech-${tab.id}`}
                  value={`tech-${tab.id}`}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md transition-all duration-150"
                >
                  <TechnicianTabIcon tab={tab} useFavicons={useFavicons} />
                  <span className="hidden sm:inline">{tab.name}</span>
                </TabsTrigger>
              ))}

              {/* Overflow dropdown for extra tabs */}
              {overflowTechTabs.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 px-2 gap-1 text-sm"
                    >
                      <span className="hidden sm:inline">More</span>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {overflowTechTabs.map((tab) => (
                      <DropdownMenuItem
                        key={`tech-${tab.id}`}
                        onClick={() => setActiveTab(`tech-${tab.id}`)}
                        className="gap-2"
                      >
                        <TechnicianTabIcon tab={tab} useFavicons={useFavicons} />
                        {tab.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </>
          )}
        </TabsList>

        {/* Tab Content with Animation */}
        <div className="flex-1 overflow-hidden min-h-0 relative">
          <AnimatePresence mode="wait" initial={false}>
            {/* Regular tab content */}
            {TABS.map(({ id, component: Component }) => (
              activeTab === id && (
                <TabsContent
                  key={id}
                  value={id}
                  forceMount
                  className="absolute inset-0 data-[state=active]:flex data-[state=active]:flex-col m-0"
                >
                  <AnimatedTabContent id={animationsEnabled ? id : 'static'}>
                    <Component />
                  </AnimatedTabContent>
                </TabsContent>
              )
            ))}
          </AnimatePresence>

          {/* Technician tab iframes - kept mounted to preserve state */}
          {technicianTabs.map((tab) => {
            const isActive = activeTab === `tech-${tab.id}`;
            return (
              <div
                key={`tech-${tab.id}`}
                className={`absolute inset-0 ${isActive ? 'flex flex-col z-10' : 'invisible pointer-events-none z-0'}`}
              >
                <IframeTabContent url={tab.url} name={tab.name} />
              </div>
            );
          })}
        </div>
      </Tabs>
    </div>
  );
}

/**
 * Main application component with tab-based navigation
 */
function App() {
  // Ensure data directory exists on startup
  useEffect(() => {
    async function initializeDataDir() {
      try {
        await invoke('ensure_data_dir');
      } catch (error) {
        console.error('Failed to initialize data directory:', error);
      }
    }
    initializeDataDir();
  }, []);

  return (
    <ThemeProvider defaultTheme="system">
      <SettingsProvider>
        <AnimationProvider>
          <AppContent />
        </AnimationProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}

export default App;

