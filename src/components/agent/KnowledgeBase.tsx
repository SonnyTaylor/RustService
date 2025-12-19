/**
 * Knowledge Base Component
 * 
 * Upload documents for RAG (Retrieval-Augmented Generation).
 * Documents are chunked, embedded, and stored as 'knowledge' type memories.
 */

import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { generateEmbedding } from '@/lib/agent-memory';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  Upload, 
  FileText, 
  CheckCircle, 
  AlertCircle, 
  Loader2,
  Trash2,
  Database,
  FileStack,
  RefreshCw,
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
import type { Memory } from '@/types/agent';

// =============================================================================
// Chunking Utilities
// =============================================================================

interface ChunkOptions {
  maxChunkSize: number;
  overlap: number;
  respectParagraphs: boolean;
}

const DEFAULT_CHUNK_OPTIONS: ChunkOptions = {
  maxChunkSize: 1000,
  overlap: 100,
  respectParagraphs: true,
};

/**
 * Smart text chunking that respects semantic boundaries
 */
function chunkText(text: string, options: ChunkOptions = DEFAULT_CHUNK_OPTIONS): string[] {
  const { maxChunkSize, overlap, respectParagraphs } = options;
  const chunks: string[] = [];
  
  if (!text.trim()) return chunks;

  // If respecting paragraphs, split by double newlines first
  if (respectParagraphs) {
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
    let currentChunk = '';
    
    for (const paragraph of paragraphs) {
      // If adding this paragraph would exceed max size
      if (currentChunk.length + paragraph.length + 2 > maxChunkSize) {
        // Save current chunk if it has content
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }
        
        // If paragraph itself is too long, split it further
        if (paragraph.length > maxChunkSize) {
          const subChunks = chunkLongText(paragraph, maxChunkSize, overlap);
          chunks.push(...subChunks);
          currentChunk = '';
        } else {
          currentChunk = paragraph;
        }
      } else {
        // Add paragraph to current chunk
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      }
    }
    
    // Don't forget the last chunk
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
  } else {
    // Simple fixed-size chunking with overlap
    return chunkLongText(text, maxChunkSize, overlap);
  }
  
  return chunks;
}

/**
 * Simple chunking for long text without paragraph boundaries
 */
function chunkLongText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let i = 0;
  
  while (i < text.length) {
    let end = i + chunkSize;
    
    // Try to break at a sentence or word boundary
    if (end < text.length) {
      // Look for sentence boundary
      const sentenceEnd = text.lastIndexOf('. ', end);
      if (sentenceEnd > i + chunkSize * 0.5) {
        end = sentenceEnd + 1;
      } else {
        // Fall back to word boundary
        const wordEnd = text.lastIndexOf(' ', end);
        if (wordEnd > i + chunkSize * 0.5) {
          end = wordEnd;
        }
      }
    }
    
    chunks.push(text.slice(i, end).trim());
    i = end - overlap;
    
    // Prevent infinite loop
    if (i <= 0 && chunks.length > 0) break;
  }
  
  return chunks.filter(c => c.length > 0);
}

// =============================================================================
// Component
// =============================================================================

interface IngestionStatus {
  filename: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  chunksTotal?: number;
  chunksProcessed?: number;
  message?: string;
}

interface KnowledgeStats {
  totalDocuments: number;
  totalChunks: number;
  sources: string[];
}

export function KnowledgeBase() {
  const [uploads, setUploads] = useState<IngestionStatus[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  // Load knowledge base stats
  const loadStats = async () => {
    setIsLoadingStats(true);
    try {
      const memories = await invoke<Memory[]>('get_all_memories', {
        memory_type: 'knowledge',
        limit: 500,
      });
      
      // Calculate stats
      const sources = new Set<string>();
      memories.forEach(m => {
        if (m.metadata?.source) {
          sources.add(m.metadata.source as string);
        }
      });
      
      setStats({
        totalDocuments: sources.size,
        totalChunks: memories.length,
        sources: Array.from(sources),
      });
    } catch (error) {
      console.error('Failed to load knowledge stats:', error);
    } finally {
      setIsLoadingStats(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const processFile = async (file: File) => {
    setUploads(prev => [...prev, { 
      filename: file.name, 
      status: 'processing', 
      progress: 0,
      chunksTotal: 0,
      chunksProcessed: 0,
    }]);
    
    try {
      // 1. Read file
      const text = await file.text();
      
      // 2. Chunk with smart boundaries
      const chunks = chunkText(text, {
        maxChunkSize: 1000,
        overlap: 100,
        respectParagraphs: true,
      });
      const totalChunks = chunks.length;
      
      setUploads(prev => prev.map(u => 
        u.filename === file.name 
          ? { ...u, chunksTotal: totalChunks } 
          : u
      ));
      
      // 3. Embed and Save each chunk
      for (let i = 0; i < totalChunks; i++) {
        const chunk = chunks[i];
        
        // Generate embedding
        const embedding = await generateEmbedding(chunk);
        
        // Save as 'knowledge' type memory
        await invoke('save_memory', {
          memory_type: 'knowledge',
          content: chunk,
          metadata: { 
            source: file.name,
            isKnowledgeBase: true,
            chunkIndex: i,
            totalChunks: totalChunks,
            tags: ['knowledge-base', file.name.split('.').pop() || 'text'],
          },
          embedding: embedding.length > 0 ? embedding : undefined,
          importance: 60, // Knowledge base entries are moderately important
        });

        // Update progress
        setUploads(prev => prev.map(u => 
          u.filename === file.name 
            ? { 
                ...u, 
                progress: Math.round(((i + 1) / totalChunks) * 100),
                chunksProcessed: i + 1,
              } 
            : u
        ));
      }

      setUploads(prev => prev.map(u => 
        u.filename === file.name 
          ? { ...u, status: 'completed', progress: 100 } 
          : u
      ));
      
      // Refresh stats
      await loadStats();

    } catch (error) {
      console.error('Ingestion error:', error);
      setUploads(prev => prev.map(u => 
        u.filename === file.name 
          ? { ...u, status: 'error', message: String(error) } 
          : u
      ));
    }
  };

  const onDrop = useCallback(async (files: File[]) => {
    setIsProcessing(true);
    // Process sequentially to avoid rate limits
    for (const file of files) {
      await processFile(file);
    }
    setIsProcessing(false);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      onDrop(files);
    }
  };

  const clearKnowledgeBase = async () => {
    try {
      // Get all knowledge memories
      const memories = await invoke<Memory[]>('get_all_memories', {
        memory_type: 'knowledge',
        limit: 1000,
      });
      
      // Delete them all
      if (memories.length > 0) {
        await invoke('bulk_delete_memories', {
          memory_ids: memories.map(m => m.id),
        });
      }
      
      setUploads([]);
      await loadStats();
    } catch (error) {
      console.error('Failed to clear knowledge base:', error);
    }
  };

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium flex items-center gap-2">
            <FileStack className="h-4 w-4 text-cyan-500" />
            Knowledge Base
          </h3>
          <p className="text-xs text-muted-foreground">Upload documents for RAG</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7"
            onClick={loadStats}
            disabled={isLoadingStats}
          >
            <RefreshCw className={`h-3 w-3 ${isLoadingStats ? 'animate-spin' : ''}`} />
          </Button>
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 text-red-500 hover:text-red-600"
                disabled={!stats || stats.totalChunks === 0}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear Knowledge Base?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will delete all {stats?.totalChunks || 0} knowledge chunks from 
                  {stats?.totalDocuments || 0} documents. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-500 hover:bg-red-600"
                  onClick={clearKnowledgeBase}
                >
                  Clear All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Stats */}
      {stats && stats.totalChunks > 0 && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground bg-muted/30 p-2 rounded">
          <div className="flex items-center gap-1">
            <Database className="h-3 w-3" />
            <span>{stats.totalChunks} chunks</span>
          </div>
          <span>•</span>
          <div className="flex items-center gap-1">
            <FileText className="h-3 w-3" />
            <span>{stats.totalDocuments} documents</span>
          </div>
        </div>
      )}

      {/* Upload Zone */}
      <Card className="border-dashed border-2 hover:bg-muted/50 transition-colors relative">
        <CardContent className="p-6 flex flex-col items-center justify-center text-center space-y-2">
          <div className="p-3 bg-primary/10 rounded-full">
            <Upload className="h-6 w-6 text-primary" />
          </div>
          <div className="text-sm font-medium">Click to upload documents</div>
          <p className="text-xs text-muted-foreground">
            .txt, .md, .json, .csv, .xml, .log supported
          </p>
          <input 
            type="file" 
            multiple 
            accept=".txt,.md,.json,.csv,.xml,.log,.html,.yaml,.yml"
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            onChange={handleFileChange}
            disabled={isProcessing}
          />
        </CardContent>
      </Card>

      {/* Upload Queue */}
      <div className="flex-1 min-h-0">
        <h4 className="text-xs font-medium mb-2 text-muted-foreground uppercase flex items-center gap-2">
          Upload Queue
          {isProcessing && <Loader2 className="h-3 w-3 animate-spin" />}
        </h4>
        <ScrollArea className="h-[calc(100%-2rem)]">
          <div className="space-y-2 pr-2">
            {uploads.length === 0 && (
              <div className="text-center py-4 text-xs text-muted-foreground italic">
                No active uploads
              </div>
            )}
            {uploads.map((upload) => (
              <div 
                key={upload.filename} 
                className="bg-muted/40 p-2 rounded text-sm relative overflow-hidden"
              >
                <div className="flex items-center justify-between mb-1 relative z-10">
                  <span className="truncate font-medium flex items-center gap-2">
                    <FileText className="h-3 w-3 shrink-0" />
                    <span className="truncate">{upload.filename}</span>
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {upload.status === 'processing' && (
                      <span className="text-xs text-muted-foreground">
                        {upload.chunksProcessed}/{upload.chunksTotal}
                      </span>
                    )}
                    {upload.status === 'completed' && (
                      <CheckCircle className="h-3 w-3 text-green-500" />
                    )}
                    {upload.status === 'error' && (
                      <AlertCircle className="h-3 w-3 text-red-500" />
                    )}
                  </div>
                </div>
                {upload.status === 'processing' && (
                  <Progress value={upload.progress} className="h-1" />
                )}
                {upload.status === 'error' && (
                  <div className="text-xs text-red-500 mt-1 truncate">
                    {upload.message}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Sources List */}
      {stats && stats.sources.length > 0 && (
        <div className="border-t pt-3">
          <h4 className="text-xs font-medium mb-2 text-muted-foreground uppercase">
            Indexed Documents
          </h4>
          <div className="flex flex-wrap gap-1">
            {stats.sources.slice(0, 5).map(source => (
              <Badge key={source} variant="secondary" className="text-xs">
                {source}
              </Badge>
            ))}
            {stats.sources.length > 5 && (
              <Badge variant="outline" className="text-xs">
                +{stats.sources.length - 5} more
              </Badge>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default KnowledgeBase;
