import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Memory } from '@/types/agent';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, Sparkles, RefreshCw } from 'lucide-react';

export function BehaviorSettings() {
  const [behavior, setBehavior] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const loadBehavior = async () => {
    setLoading(true);
    try {
      const memories = await invoke<Memory[]>('search_memories', {
        query: '',
        memory_type: 'behavior',
        limit: 1,
      });
      if (memories.length > 0) {
        setBehavior(memories[0].content);
      } else {
        setBehavior('');
      }
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Failed to load behavior:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBehavior();
  }, []);

  const handleSave = async () => {
    if (!behavior.trim()) return;
    setSaving(true);
    try {
        // We use save_memory. Backend handles embedding generation if we passed it?
        // Wait, backend save_memory takes `embedding` argument.
        // If we don't pass it, it's null.
        // Behavior memories usually don't need RAG as much as they are injected into system prompt.
        // But implementation plan said "Frontend will handle...". 
        // For behavior, we probably want to embed it too just in case?
        // Let's assume for now we just save the text. "Dynamic Behavior" logic fetches it by type.
        // So embedding is optional.
        
        await invoke('save_memory', {
            memory_type: 'behavior',
            content: behavior,
            metadata: { type: 'system_instruction' }
        });
        
        // Reload to confirm save (and maybe get new ID)
        await loadBehavior();

    } catch (err) {
        console.error('Failed to save behavior:', err);
    } finally {
        setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col space-y-4">
      <div>
        <h3 className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-500" />
            Agent Behavior
        </h3>
        <p className="text-xs text-muted-foreground">Define the agent's personality and rules.</p>
      </div>

      <Card className="flex-1 flex flex-col min-h-0">
        <CardContent className="p-4 flex-1 flex flex-col space-y-4">
            <div className="flex-1 relative">
                <Textarea 
                    value={behavior}
                    onChange={(e) => setBehavior(e.target.value)}
                    placeholder="E.g., You are a helpful assistant who speaks like a pirate..."
                    className="h-full resize-none font-mono text-sm leading-relaxed"
                    disabled={loading || saving}
                />
            </div>
            
            <div className="flex items-center justify-between shrink-0">
                <span className="text-[10px] text-muted-foreground">
                    {lastRefreshed ? `loaded ${lastRefreshed.toLocaleTimeString()}` : ''}
                </span>
                <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={loadBehavior} disabled={loading || saving}>
                        <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={loading || saving || !behavior.trim()}>
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <Save className="h-3.5 w-3.5 mr-2" />}
                        Set Behavior
                    </Button>
                </div>
            </div>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded border">
        <strong>Note:</strong> This behavior instruction overrides the default system prompt and persists across sessions.
      </div>
    </div>
  );
}
