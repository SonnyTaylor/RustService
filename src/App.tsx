/**
 * RustService Main Application
 * 
 * Windows desktop toolkit for computer repair technicians.
 * Tab-based navigation with 8 main sections.
 */

import { useEffect } from 'react';
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
      <div className="h-screen flex flex-col bg-background overflow-hidden">
        {/* Custom Titlebar */}
        <Titlebar />

        {/* Main Content with Tabs */}
        <Tabs defaultValue="service" className="flex-1 flex flex-col min-h-0">
          {/* Tab Navigation */}
          <TabsList className="w-full justify-start rounded-none border-b bg-muted/50 px-2 h-auto py-1 flex-shrink-0">
            {TABS.map(({ id, label, icon: Icon }) => (
              <TabsTrigger
                key={id}
                value={id}
                className="flex items-center gap-2 px-3 py-1.5 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md"
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Tab Content */}
          {TABS.map(({ id, component: Component }) => (
            <TabsContent
              key={id}
              value={id}
              className="flex-1 m-0 overflow-auto"
            >
              <Component />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </ThemeProvider>
  );
}

export default App;
