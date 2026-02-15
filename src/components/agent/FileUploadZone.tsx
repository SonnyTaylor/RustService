/**
 * File Upload Zone Component
 *
 * Drag-and-drop file upload area with progress tracking.
 * Supports multiple files, size validation, and MIME type detection.
 */

import { useState, useCallback, useRef } from 'react';
import { Upload, X, File, Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { FileAttachment, FileUploadState } from '@/types/file-attachment';
import { formatFileSize, getCategoryFromExtension, FILE_SIZE_LIMITS } from '@/types/file-attachment';
import { invoke } from '@tauri-apps/api/core';

interface FileUploadZoneProps {
  onFilesUploaded: (attachments: FileAttachment[]) => void;
  maxFiles?: number;
  maxTotalSize?: number;
  disabled?: boolean;
}

export function FileUploadZone({
  onFilesUploaded,
  maxFiles = 10,
  maxTotalSize = FILE_SIZE_LIMITS.SMALL * 10, // 100MB default
  disabled = false,
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploads, setUploads] = useState<FileUploadState[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  }, [disabled]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleFiles(files);
    // Reset input
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }, []);

  const handleFiles = async (files: File[]) => {
    // Check max files
    if (uploads.length + files.length > maxFiles) {
      alert(`Maximum ${maxFiles} files allowed`);
      return;
    }

    // Check total size
    const currentSize = uploads.reduce((sum, u) => sum + u.totalBytes, 0);
    const newSize = files.reduce((sum, f) => sum + f.size, 0);
    if (currentSize + newSize > maxTotalSize) {
      alert(`Total size would exceed ${formatFileSize(maxTotalSize)}`);
      return;
    }

    // Create upload states
    const newUploads: FileUploadState[] = files.map(file => ({
      file,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: 'pending',
      progress: 0,
      bytesUploaded: 0,
      totalBytes: file.size,
    }));

    setUploads(prev => [...prev, ...newUploads]);

    // Upload each file
    for (const upload of newUploads) {
      await uploadFile(upload);
    }
  };

  const uploadFile = async (uploadState: FileUploadState) => {
    const { file, id } = uploadState;

    // Update status to uploading
    setUploads(prev => prev.map(u =>
      u.id === id ? { ...u, status: 'uploading' } : u
    ));

    try {
      // Read file as base64
      const base64 = await fileToBase64(file);

      // Update progress
      setUploads(prev => prev.map(u =>
        u.id === id ? { ...u, progress: 50 } : u
      ));

      // Call Tauri command
      const attachment = await invoke<FileAttachment>('save_uploaded_file', {
        file_name: file.name,
        mime_type: file.type || 'application/octet-stream',
        size: file.size,
        content_base64: base64,
      });

      // Update to complete
      setUploads(prev => prev.map(u =>
        u.id === id ? { ...u, status: 'complete', progress: 100, attachment } : u
      ));

      // Notify parent
      onFilesUploaded([attachment]);

      // Remove from list after delay
      setTimeout(() => {
        setUploads(prev => prev.filter(u => u.id !== id));
      }, 2000);

    } catch (error) {
      setUploads(prev => prev.map(u =>
        u.id === id ? { ...u, status: 'error', error: String(error) } : u
      ));
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data URL prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const removeUpload = (id: string) => {
    setUploads(prev => prev.filter(u => u.id !== id));
  };

  const getFileIcon = (filename: string) => {
    const category = getCategoryFromExtension(filename);
    switch (category) {
      case 'image':
        return <div className="w-8 h-8 rounded bg-purple-500/20 flex items-center justify-center"><File className="h-4 w-4 text-purple-500" /></div>;
      case 'code':
        return <div className="w-8 h-8 rounded bg-blue-500/20 flex items-center justify-center"><File className="h-4 w-4 text-blue-500" /></div>;
      case 'document':
        return <div className="w-8 h-8 rounded bg-yellow-500/20 flex items-center justify-center"><File className="h-4 w-4 text-yellow-500" /></div>;
      default:
        return <div className="w-8 h-8 rounded bg-muted flex items-center justify-center"><File className="h-4 w-4 text-muted-foreground" /></div>;
    }
  };

  return (
    <div className="space-y-2">
      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={cn(
          "relative border-2 border-dashed rounded-lg p-6 transition-colors cursor-pointer",
          "hover:border-primary/50 hover:bg-primary/5",
          isDragging && "border-primary bg-primary/10",
          disabled && "opacity-50 cursor-not-allowed hover:border-border hover:bg-transparent",
          uploads.length > 0 && "border-solid border-border bg-muted/30"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled}
        />

        <div className="flex flex-col items-center gap-2 text-center">
          <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
            isDragging ? "bg-primary text-primary-foreground" : "bg-muted"
          )}>
            <Upload className="h-5 w-5" />
          </div>
          <div className="text-sm">
            <span className="font-medium">Click to upload</span>
            <span className="text-muted-foreground"> or drag and drop</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Max {maxFiles} files, up to {formatFileSize(FILE_SIZE_LIMITS.SMALL)} each
          </div>
        </div>
      </div>

      {/* Upload List */}
      {uploads.length > 0 && (
        <div className="space-y-2">
          {uploads.map(upload => (
            <div
              key={upload.id}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border",
                upload.status === 'error' && "border-red-500/30 bg-red-500/10",
                upload.status === 'complete' && "border-green-500/30 bg-green-500/10",
                upload.status !== 'error' && upload.status !== 'complete' && "border-border bg-muted/50"
              )}
            >
              {getFileIcon(upload.file.name)}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{upload.file.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatFileSize(upload.totalBytes)}
                  </span>
                </div>

                {upload.status === 'uploading' && (
                  <div className="flex items-center gap-2 mt-1">
                    <Progress value={upload.progress} className="h-1.5 flex-1" />
                    <span className="text-xs text-muted-foreground">{upload.progress}%</span>
                  </div>
                )}

                {upload.status === 'error' && (
                  <span className="text-xs text-red-500">{upload.error}</span>
                )}

                {upload.status === 'complete' && (
                  <span className="text-xs text-green-500 flex items-center gap-1">
                    <Check className="h-3 w-3" />
                    Uploaded
                  </span>
                )}
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 shrink-0"
                onClick={() => removeUpload(upload.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default FileUploadZone;
