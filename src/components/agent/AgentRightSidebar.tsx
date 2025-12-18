import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BehaviorSettings } from '@/components/agent/BehaviorSettings';
import { InstrumentList } from '@/components/agent/InstrumentList';
import { KnowledgeBase } from '@/components/agent/KnowledgeBase';
import { MemoryBrowser } from '@/components/agent/MemoryBrowser';
import { Brain, FileCode, Database, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils'; // Assuming cn exists

interface AgentRightSidebarProps {
  className?: string;
  onRunInstrument: (name: string) => void;
}

export function AgentRightSidebar({ className, onRunInstrument }: AgentRightSidebarProps) {
  const [activeTab, setActiveTab] = useState('memory');

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <div className="px-4 py-2 border-b">
                <TabsList className="w-full justify-start h-9 p-0 bg-transparent gap-2">
                    <TabsTrigger value="memory" className="data-[state=active]:bg-background ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-2 px-1 text-xs gap-1.5 transition-none">
                        <Database className="h-3.5 w-3.5" />
                        Memory
                    </TabsTrigger>
                     <TabsTrigger value="behavior" className="data-[state=active]:bg-background ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-2 px-1 text-xs gap-1.5 transition-none">
                        <Sparkles className="h-3.5 w-3.5" />
                        Behavior
                    </TabsTrigger>
                    <TabsTrigger value="knowledge" className="data-[state=active]:bg-background ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-2 px-1 text-xs gap-1.5 transition-none">
                        <Brain className="h-3.5 w-3.5" />
                        Knowledge
                    </TabsTrigger>
                    <TabsTrigger value="instruments" className="data-[state=active]:bg-background ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-2 px-1 text-xs gap-1.5 transition-none">
                        <FileCode className="h-3.5 w-3.5" />
                        Instruments
                    </TabsTrigger>
                </TabsList>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
                <TabsContent value="memory" className="h-full m-0 p-4 overflow-auto">
                    <MemoryBrowser />
                </TabsContent>
                <TabsContent value="behavior" className="h-full m-0 p-4 overflow-auto">
                    <BehaviorSettings />
                </TabsContent>
                <TabsContent value="knowledge" className="h-full m-0 p-4 overflow-auto">
                    <KnowledgeBase />
                </TabsContent>
                <TabsContent value="instruments" className="h-full m-0 p-4 overflow-auto">
                    <InstrumentList onRunInstrument={onRunInstrument} />
                </TabsContent>
            </div>
        </Tabs>
    </div>
  );
}
