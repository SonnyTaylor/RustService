import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Instrument } from '@/types/agent';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Play, FileCode, RefreshCw } from 'lucide-react';

interface InstrumentListProps {
  onRunInstrument: (name: string) => void;
}

export function InstrumentList({ onRunInstrument }: InstrumentListProps) {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [loading, setLoading] = useState(true);

  const loadInstruments = async () => {
    setLoading(true);
    try {
      const data = await invoke<Instrument[]>('list_instruments');
      setInstruments(data);
    } catch (err) {
      console.error('Failed to load instruments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInstruments();
  }, []);

  const getExtensionColor = (ext: string) => {
    switch (ext) {
      case 'ps1': return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
      case 'py': return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
      case 'js': return 'text-green-500 bg-green-500/10 border-green-500/20';
      case 'bat': 
      case 'cmd': return 'text-gray-500 bg-gray-500/10 border-gray-500/20';
      default: return 'text-purple-500 bg-purple-500/10 border-purple-500/20';
    }
  };

  return (
    <div className="h-full flex flex-col space-y-4">
      <div className="flex items-center justify-between shrink-0">
        <div>
            <h3 className="text-sm font-medium">Instruments</h3>
            <p className="text-xs text-muted-foreground">Custom agent scripts</p>
        </div>
        <Button variant="ghost" size="icon" onClick={loadInstruments} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 -mx-4 px-4">
        {loading ? (
             <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
        ) : instruments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
                No instruments found in data/instruments
            </div>
        ) : (
            <div className="space-y-3 pb-4">
            {instruments.map((inst) => (
                <Card key={inst.name} className="overflow-hidden">
                <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-sm truncate" title={inst.name}>
                                    {inst.name}
                                </span>
                                <Badge variant="outline" className={`text-[10px] h-5 px-1 ${getExtensionColor(inst.extension)}`}>
                                    .{inst.extension}
                                </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                                {inst.description || "No description provided."}
                            </p>
                        </div>
                        <Button 
                            variant="secondary" 
                            size="icon" 
                            className="h-8 w-8 shrink-0"
                            onClick={() => onRunInstrument(inst.name)}
                            title="Run Instrument"
                        >
                            <Play className="h-3 w-3" />
                        </Button>
                    </div>
                    <div className="mt-2 flex items-center text-[10px] text-muted-foreground bg-muted/50 p-1.5 rounded truncate font-mono">
                        <FileCode className="h-3 w-3 mr-1.5 shrink-0" />
                        <span className="truncate">{inst.path}</span>
                    </div>
                </CardContent>
                </Card>
            ))}
            </div>
        )}
      </ScrollArea>
    </div>
  );
}
