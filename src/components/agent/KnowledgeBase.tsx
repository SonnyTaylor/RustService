import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone'; // Check if I have this package
import { invoke } from '@tauri-apps/api/core';
import { generateEmbedding } from '@/lib/agent-memory';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

// Simple text chunking
function chunkText(text: string, chunkSize: number = 1000, overlap: number = 100): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + chunkSize));
    i += chunkSize - overlap;
  }
  return chunks;
}

interface IngestionStatus {
  filename: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  message?: string;
}

export function KnowledgeBase() {
  const [uploads, setUploads] = useState<IngestionStatus[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const processFile = async (file: File) => {
    setUploads(prev => [...prev, { filename: file.name, status: 'processing', progress: 0 }]);
    
    try {
      // 1. Read file
      const text = await file.text();
      
      // 2. Chunk
      const chunks = chunkText(text);
      const totalChunks = chunks.length;
      
      // 3. Embed and Save
      for (let i = 0; i < totalChunks; i++) {
        const chunk = chunks[i];
        
        // Generate embedding
        const embedding = await generateEmbedding(chunk);
        
        // Save to memory (type 'knowledge' isn't in Enum yet? 
        // We used 'fact', 'solution' etc. Plan said add 'knowledge'? 
        // Or just use 'fact' with tag 'knowledge'?
        // The implementation plan said: "Update saveToMemoryTool to support knowledge type".
        // But backend Enum only has Fact, Solution, Conversation, Instruction, Behavior.
        // Let's use 'fact' and add metadata { source: filename, type: 'knowledge' }.
        await invoke('save_memory', {
            memory_type: 'fact',
            content: chunk,
            metadata: { 
                source: file.name,
                is_knowledge_base: true,
                chunk_index: i,
                total_chunks: totalChunks 
            },
            embedding: embedding.length > 0 ? embedding : undefined
        });

        // Update progress
        setUploads(prev => prev.map(u => 
            u.filename === file.name 
            ? { ...u, progress: Math.round(((i + 1) / totalChunks) * 100) } 
            : u
        ));
      }

      setUploads(prev => prev.map(u => 
        u.filename === file.name ? { ...u, status: 'completed', progress: 100 } : u
      ));

    } catch (error) {
      console.error('Ingestion error:', error);
      setUploads(prev => prev.map(u => 
        u.filename === file.name ? { ...u, status: 'error', message: String(error) } : u
      ));
    }
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setIsProcessing(true);
    // Process sequentially to avoid rate limits
    for (const file of acceptedFiles) {
        await processFile(file);
    }
    setIsProcessing(false);
  }, []);

  // Use standard input because I might not have react-dropzone installed
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
        // Convert FileList to array
        const files = Array.from(e.target.files);
        onDrop(files);
    }
  };

  return (
    <div className="h-full flex flex-col space-y-4">
      <div>
        <h3 className="text-sm font-medium">Knowledge Base</h3>
        <p className="text-xs text-muted-foreground">Upload documents for RAG</p>
      </div>

      <Card className="border-dashed border-2 hover:bg-muted/50 transition-colors relative">
        <CardContent className="p-6 flex flex-col items-center justify-center text-center space-y-2">
           <div className="p-3 bg-primary/10 rounded-full">
            <Upload className="h-6 w-6 text-primary" />
           </div>
           <div className="text-sm font-medium">Click to upload text files</div>
           <p className="text-xs text-muted-foreground">.txt, .md, .json supported</p>
           <input 
             type="file" 
             multiple 
             accept=".txt,.md,.json,.csv,.xml,.log"
             className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
             onChange={handleFileChange}
           />
        </CardContent>
      </Card>

      <div className="flex-1 min-h-0">
        <h4 className="text-xs font-medium mb-2 text-muted-foreground uppercase">Upload Queue</h4>
        <ScrollArea className="h-[calc(100%-2rem)]">
            <div className="space-y-2 pr-2">
                {uploads.length === 0 && (
                    <div className="text-center py-4 text-xs text-muted-foreground italic">
                        No active uploads
                    </div>
                )}
                {uploads.map((upload) => (
                    <div key={upload.filename} className="bg-muted/40 p-2 rounded text-sm relative overflow-hidden">
                        <div className="flex items-center justify-between mb-1 relative z-10">
                            <span className="truncate font-medium flex items-center gap-2">
                                <FileText className="h-3 w-3" />
                                {upload.filename}
                            </span>
                            {upload.status === 'processing' && <span className="text-xs text-muted-foreground">{upload.progress}%</span>}
                            {upload.status === 'completed' && <CheckCircle className="h-3 w-3 text-green-500" />}
                            {upload.status === 'error' && <AlertCircle className="h-3 w-3 text-red-500" />}
                        </div>
                        {upload.status === 'processing' && (
                            <Progress value={upload.progress} className="h-1" />
                        )}
                        {upload.status === 'error' && (
                            <div className="text-xs text-red-500 mt-1">{upload.message}</div>
                        )}
                    </div>
                ))}
            </div>
        </ScrollArea>
      </div>
    </div>
  );
}
