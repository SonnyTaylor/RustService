/**
 * Behavior Settings Component
 * 
 * Manage agent behavior rules and personality settings.
 * Rules are stored as 'behavior' type memories and injected into the system prompt.
 */

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { generateEmbedding } from '@/lib/agent-memory';
import type { Memory } from '@/types/agent';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { 
  Loader2, 
  Save, 
  Sparkles, 
  RefreshCw, 
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Star,
  Bot,
  User,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface BehaviorRule extends Memory {
  // Behavior-specific metadata
  rule?: string;
  reason?: string;
  source?: 'user' | 'agent-adjustment';
}

export function BehaviorSettings() {
  const [behaviors, setBehaviors] = useState<BehaviorRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newRule, setNewRule] = useState('');
  const [newReason, setNewReason] = useState('');
  const [newImportance, setNewImportance] = useState(80);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  const loadBehaviors = async () => {
    setLoading(true);
    try {
      const memories = await invoke<Memory[]>('get_all_memories', {
        memory_type: 'behavior',
        limit: 50,
      });
      setBehaviors(memories as BehaviorRule[]);
    } catch (err) {
      console.error('Failed to load behaviors:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBehaviors();
  }, []);

  const handleAddBehavior = async () => {
    if (!newRule.trim()) return;
    
    setIsSaving(true);
    try {
      const content = newReason.trim() 
        ? `Rule: ${newRule}\nReason: ${newReason}`
        : newRule;
      
      const embedding = await generateEmbedding(content);
      
      await invoke('save_memory', {
        memory_type: 'behavior',
        content,
        metadata: { 
          rule: newRule,
          reason: newReason || undefined,
          source: 'user',
        },
        embedding: embedding.length > 0 ? embedding : undefined,
        importance: newImportance,
      });
      
      setNewRule('');
      setNewReason('');
      setNewImportance(80);
      setIsAddDialogOpen(false);
      await loadBehaviors();
    } catch (err) {
      console.error('Failed to save behavior:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteBehavior = async (id: string) => {
    try {
      await invoke('delete_memory', { memory_id: id });
      setBehaviors(prev => prev.filter(b => b.id !== id));
    } catch (err) {
      console.error('Failed to delete behavior:', err);
    }
  };

  const handleUpdateBehavior = async (id: string, content: string) => {
    try {
      await invoke('update_memory', {
        memory_id: id,
        content,
      });
      setEditingId(null);
      await loadBehaviors();
    } catch (err) {
      console.error('Failed to update behavior:', err);
    }
  };

  const handleClearAll = async () => {
    try {
      const ids = behaviors.map(b => b.id);
      if (ids.length > 0) {
        await invoke('bulk_delete_memories', { memory_ids: ids });
      }
      setBehaviors([]);
    } catch (err) {
      console.error('Failed to clear behaviors:', err);
    }
  };

  const startEditing = (behavior: BehaviorRule) => {
    setEditingId(behavior.id);
    setEditContent(behavior.content);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditContent('');
  };

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-500" />
            Agent Behavior
          </h3>
          <p className="text-xs text-muted-foreground">
            Define personality and rules
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7"
            onClick={loadBehaviors} 
            disabled={loading}
          >
            <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
          </Button>
          
          {behaviors.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 text-red-500 hover:text-red-600"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear All Behavior Rules?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will delete all {behaviors.length} behavior rules.
                    The agent will revert to default behavior.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-500 hover:bg-red-600"
                    onClick={handleClearAll}
                  >
                    Clear All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Add Rule Button */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogTrigger asChild>
          <Button className="w-full" variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Behavior Rule
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Behavior Rule</DialogTitle>
            <DialogDescription>
              Define a rule that guides how the agent behaves.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rule">Rule</Label>
              <Textarea
                id="rule"
                placeholder="E.g., Always ask for confirmation before modifying system files"
                value={newRule}
                onChange={(e) => setNewRule(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="reason">Reason (optional)</Label>
              <Input
                id="reason"
                placeholder="Why this rule is important"
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Importance</Label>
                <span className="text-sm text-muted-foreground">{newImportance}</span>
              </div>
              <Slider
                value={[newImportance]}
                onValueChange={([val]) => setNewImportance(val)}
                min={0}
                max={100}
                step={5}
              />
              <p className="text-xs text-muted-foreground">
                Higher importance rules take priority
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddBehavior} disabled={!newRule.trim() || isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Behavior Rules List */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : behaviors.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <Sparkles className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
              <CardTitle className="text-sm mb-1">No Behavior Rules</CardTitle>
              <CardDescription className="text-xs">
                Add rules to customize how the agent behaves.
              </CardDescription>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2 pr-2">
            {behaviors.map((behavior) => (
              <Card key={behavior.id} className="group">
                <CardContent className="p-3">
                  {editingId === behavior.id ? (
                    <div className="space-y-2">
                      <Textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="min-h-[80px] text-sm"
                      />
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={cancelEditing}>
                          <X className="h-3 w-3 mr-1" /> Cancel
                        </Button>
                        <Button 
                          size="sm" 
                          onClick={() => handleUpdateBehavior(behavior.id, editContent)}
                        >
                          <Check className="h-3 w-3 mr-1" /> Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          {/* Source indicator */}
                          <Badge 
                            variant="outline" 
                            className={cn(
                              'text-xs',
                              behavior.metadata?.source === 'agent-adjustment'
                                ? 'text-blue-500 border-blue-500/30'
                                : 'text-purple-500 border-purple-500/30'
                            )}
                          >
                            {behavior.metadata?.source === 'agent-adjustment' ? (
                              <>
                                <Bot className="h-2.5 w-2.5 mr-1" />
                                Agent
                              </>
                            ) : (
                              <>
                                <User className="h-2.5 w-2.5 mr-1" />
                                User
                              </>
                            )}
                          </Badge>
                          
                          {/* Importance */}
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Star className={cn(
                              'h-3 w-3',
                              behavior.importance >= 80 && 'text-yellow-500 fill-yellow-500'
                            )} />
                            <span>{behavior.importance}</span>
                          </div>
                        </div>
                        
                        <p className="text-sm whitespace-pre-wrap">
                          {behavior.content}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => startEditing(behavior)}
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-red-500 hover:text-red-600"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Behavior Rule?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This rule will be permanently removed.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-red-500 hover:bg-red-600"
                                onClick={() => handleDeleteBehavior(behavior.id)}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Help Text */}
      <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded border shrink-0">
        <strong>Note:</strong> Behavior rules are injected into the system prompt.
        The agent can also adjust its own behavior using the adjust_behavior tool.
      </div>
    </div>
  );
}

export default BehaviorSettings;
