/**
 * File Attachment Component
 *
 * Displays file attachments in chat messages with download, preview,
 * and content extraction capabilities.
 */

import { useState, useCallback } from 'react';
import {
  File,
  FileText,
  FileCode,
  FileImage,
  FileAudio,
  FileVideo,
  Download,
  Eye,
  X,
  Check,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import type { FileAttachment, FileCategory } from '@/types/file-attachment';
import { formatFileSize } from '@/types/file-attachment';
import { invoke } from '@tauri-apps/api/core';

interface FileAttachmentProps {
  attachment: FileAttachment;
  showPreview?: boolean;
  showDownload?: boolean;
  compact?: boolean;
  className?: string;
}

export function FileAttachmentComponent({
  attachment,
  showPreview = true,
  showDownload = true,
  compact = false,
  className,
}: FileAttachmentProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const category = attachment.category;

  const getCategoryIcon = (cat: FileCategory) => {
    const iconClass = "h-4 w-4";
    switch (cat) {
      case 'image':
        return <FileImage className={iconClass} />;
      case 'code':
        return <FileCode className={iconClass} />;
      case 'document':
        return <FileText className={iconClass} />;
      case 'media':
        // Use audio or video icon based on mime type
        if (attachment.mimeType.startsWith('audio/')) {
          return <FileAudio className={iconClass} />;
        }
        return <FileVideo className={iconClass} />;
      default:
        return <File className={iconClass} />;
    }
  };

  const getCategoryColor = (cat: FileCategory) => {
    switch (cat) {
      case 'image':
        return 'bg-purple-500/20 text-purple-500 border-purple-500/30';
      case 'code':
        return 'bg-blue-500/20 text-blue-500 border-blue-500/30';
      case 'document':
        return 'bg-yellow-500/20 text-yellow-500 border-yellow-500/30';
      case 'media':
        return attachment.mimeType.startsWith('audio/')
          ? 'bg-pink-500/20 text-pink-500 border-pink-500/30'
          : 'bg-red-500/20 text-red-500 border-red-500/30';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  const handlePreview = useCallback(async () => {
    if (!showPreview) return;

    // For images, we can show directly if we have the content
    if (category === 'image' && attachment.content) {
      setPreviewContent(attachment.content);
      setIsPreviewOpen(true);
      return;
    }

    // For text/code files, read content
    if ((category === 'text' || category === 'code' || category === 'document') &&
        attachment.size < 1024 * 1024) { // Max 1MB for preview
      setIsLoading(true);
      try {
        const content = await invoke<string>('read_file_content', {
          file_id: attachment.id,
        });
        setPreviewContent(content);
        setIsPreviewOpen(true);
      } catch (error) {
        console.error('Failed to read file:', error);
      } finally {
        setIsLoading(false);
      }
    } else {
      // For other files, just show metadata
      setIsPreviewOpen(true);
    }
  }, [attachment, category, showPreview]);

  const handleDownload = useCallback(async () => {
    if (!showDownload) return;

    setIsDownloading(true);
    try {
      // Get file info to determine path
      const info = await invoke<{ path: string }>('get_file_info', {
        file_id: attachment.id,
      });

      // Open file with default application
      const { openPath } = await import('@tauri-apps/plugin-opener');
      await openPath(info.path);

      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 2000);
    } catch (error) {
      console.error('Failed to open file:', error);
    } finally {
      setIsDownloading(false);
    }
  }, [attachment.id, showDownload]);

  const handleReveal = useCallback(async () => {
    try {
      const info = await invoke<{ path: string }>('get_file_info', {
        file_id: attachment.id,
      });

      const { revealItemInDir } = await import('@tauri-apps/plugin-opener');
      await revealItemInDir(info.path);
    } catch (error) {
      console.error('Failed to reveal file:', error);
    }
  }, [attachment.id]);

  if (compact) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-2 px-2 py-1 rounded-md border text-sm",
          getCategoryColor(category),
          className
        )}
      >
        {getCategoryIcon(category)}
        <span className="truncate max-w-[150px]">{attachment.originalName}</span>
        <span className="text-xs opacity-70">{formatFileSize(attachment.size)}</span>
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-3 p-3 rounded-lg border bg-card/50 hover:bg-card transition-colors",
          className
        )}
      >
        {/* Icon */}
        <div className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
          getCategoryColor(category)
        )}>
          {getCategoryIcon(category)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{attachment.originalName}</div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formatFileSize(attachment.size)}</span>
            <span>•</span>
            <Badge variant="outline" className="text-xs py-0 h-4">
              {category}
            </Badge>
            {attachment.source === 'generated' && (
              <>
                <span>•</span>
                <Badge variant="secondary" className="text-xs py-0 h-4">
                  AI Generated
                </Badge>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {showPreview && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={handlePreview}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          )}

          {showDownload && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={handleDownload}
              disabled={isDownloading}
            >
              {isDownloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : downloadSuccess ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Download className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {getCategoryIcon(category)}
              {attachment.originalName}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* File Info */}
            <div className="flex flex-wrap gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Size:</span>{' '}
                <span>{formatFileSize(attachment.size)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Type:</span>{' '}
                <span>{attachment.mimeType}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Source:</span>{' '}
                <Badge variant="outline">{attachment.source}</Badge>
              </div>
              {attachment.checksum && (
                <div>
                  <span className="text-muted-foreground">SHA-256:</span>{' '}
                  <code className="text-xs bg-muted px-1 rounded">
                    {attachment.checksum.slice(0, 16)}...
                  </code>
                </div>
              )}
            </div>

            {/* Content Preview */}
            {previewContent ? (
              <ScrollArea className="h-[400px] border rounded-md">
                {category === 'image' ? (
                  <img
                    src={previewContent.startsWith('data:') ? previewContent : `data:${attachment.mimeType};base64,${previewContent}`}
                    alt={attachment.originalName}
                    className="max-w-full h-auto"
                  />
                ) : (
                  <pre className="p-4 text-sm font-mono whitespace-pre-wrap">
                    {previewContent}
                  </pre>
                )}
              </ScrollArea>
            ) : category === 'image' ? (
              <div className="h-[200px] flex items-center justify-center border rounded-md bg-muted">
                <p className="text-muted-foreground">Image preview not available</p>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center border rounded-md bg-muted">
                <p className="text-muted-foreground">
                  Preview not available for this file type
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleReveal}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Show in Folder
              </Button>
              <Button onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Open File
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default FileAttachmentComponent;
