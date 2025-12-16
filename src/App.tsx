/**
 * RustService Main Application
 * 
 * Windows desktop toolkit for computer repair technicians.
 * Tab-based navigation with 8 main sections.
 */

import { useState, useEffect, ReactNode } from 'react';
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
} from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ThemeProvider } from '@/components/theme-provider';
import { SettingsProvider } from '@/components/settings-context';
import { AnimationProvider, useAnimation, motion, AnimatePresence, tabContentVariants } from '@/components/animation-context';
import { Titlebar } from '@/components/titlebar';
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

import '@/styles/globals.css';

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

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<string>;
      const nextTab = custom.detail;
      if (typeof nextTab !== 'string') return;
      if (TABS.some((t) => t.id === nextTab)) {
        setActiveTab(nextTab);
      }
    };

    window.addEventListener('navigate-tab', handler as EventListener);
    return () => window.removeEventListener('navigate-tab', handler as EventListener);
  }, []);

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
        </TabsList>

        {/* Tab Content with Animation */}
        <div className="flex-1 overflow-hidden min-h-0 relative">
          <AnimatePresence mode="wait" initial={false}>
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

