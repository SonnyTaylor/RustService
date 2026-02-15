/**
 * File Attachment Types
 *
 * Type definitions for the file handling system supporting heterogeneous file types
 * with bidirectional flow between user and agent.
 */

// =============================================================================
// File Categories
// =============================================================================

/**
 * Categories of files for specialized handling
 */
export type FileCategory =
  | 'text'      // Plain text files
  | 'code'      // Source code files
  | 'document'  // PDF, Word, etc.
  | 'image'     // Image files
  | 'media'     // Audio/video files
  | 'binary';   // Binary executables, archives

/**
 * Source of a file attachment
 */
export type FileSource =
  | 'upload'      // User uploaded
  | 'generated'   // Agent generated
  | 'filesystem'; // Referenced from filesystem

// =============================================================================
// File Attachment (Unified Schema)
// =============================================================================

/**
 * Core file attachment metadata used across the system
 */
export interface FileAttachment {
  // Core Identity
  id: string;                    // UUID v4
  source: FileSource;

  // File Information
  originalName: string;        // Original filename
  storedName: string;          // UUID-based stored filename
  mimeType: string;            // Detected MIME type
  category: FileCategory;      // File category for handling
  size: number;                // Bytes

  // Storage Paths
  storedPath: string;          // Relative to data/agent/files/
  thumbnailPath?: string;      // Preview thumbnail path

  // Content (for text/code files)
  content?: string;            // Extracted text content
  encoding?: string;           // Content encoding
  lineCount?: number;          // For code files

  // Metadata
  checksum: string;            // SHA-256 hash
  uploadedAt: string;          // ISO 8601 timestamp
  expiresAt?: string;          // Optional expiration

  // Source-specific metadata
  uploadMetadata?: UploadMetadata;
  generationMetadata?: GenerationMetadata;
  filesystemMetadata?: FilesystemMetadata;
}

/**
 * Metadata for user-uploaded files
 */
export interface UploadMetadata {
  uploadedBy: 'user';
  originalPath?: string;       // Original filesystem path if known
  autoExtracted: boolean;      // Whether content was auto-extracted
}

/**
 * Metadata for agent-generated files
 */
export interface GenerationMetadata {
  generatedBy: 'agent';
  description: string;         // Agent's description of the file
  toolCallId: string;          // Reference to generating tool call
  approved: boolean;           // Whether HITL approval was obtained
}

/**
 * Metadata for filesystem-referenced files
 */
export interface FilesystemMetadata {
  originalPath: string;        // Original absolute path
  accessedAt: string;          // When agent first referenced it
  autoRead: boolean;          // Whether content was auto-read
}

// =============================================================================
// File Upload State
// =============================================================================

/**
 * State tracking for file upload operations
 */
export interface FileUploadState {
  file: File;                  // Browser File object
  id: string;                  // Temporary upload ID
  status: 'pending' | 'uploading' | 'processing' | 'complete' | 'error';
  progress: number;            // 0-100
  bytesUploaded: number;
  totalBytes: number;
  error?: string;
  attachment?: FileAttachment; // Final attachment when complete
}

// =============================================================================
// Upload Request/Response Types
// =============================================================================

/**
 * Request to upload a file (for small files < 10MB)
 */
export interface FileUploadRequest {
  fileName: string;
  mimeType: string;
  size: number;
  contentBase64: string;       // Base64 encoded content
}

/**
 * Request to upload a chunk (for large files)
 */
export interface FileChunkRequest {
  uploadId: string;
  chunkIndex: number;
  totalChunks: number;
  contentBase64: string;
}

/**
 * Status of a chunked upload
 */
export interface ChunkUploadStatus {
  uploadId: string;
  chunksReceived: number[];
  chunksTotal: number;
  bytesReceived: number;
  bytesTotal: number;
  complete: boolean;
}

// =============================================================================
// File Generation Types
// =============================================================================

/**
 * Request for agent to generate a file
 */
export interface FileGenerationRequest {
  filename: string;
  content: string;
  description: string;
  mimeType?: string;
}

// =============================================================================
// File System Reference Types
// =============================================================================

/**
 * Result of validating a filesystem path
 */
export interface PathValidationResult {
  valid: boolean;
  sanitizedPath?: string;
  error?: string;
  withinSandbox: boolean;
}

/**
 * Request to read a file from the filesystem
 */
export interface FilesystemReadRequest {
  path: string;
  autoExtract?: boolean;       // Auto-extract text content
  maxSize?: number;            // Max bytes to read
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get file category from MIME type
 */
export function getFileCategory(mimeType: string): FileCategory {
  if (mimeType.startsWith('text/')) return 'text';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/') || mimeType.startsWith('video/')) return 'media';

  const codeTypes = [
    'application/javascript',
    'application/json',
    'application/xml',
    'application/x-python-code',
    'application/x-sh',
  ];
  if (codeTypes.includes(mimeType) || mimeType.includes('script')) return 'code';

  const docTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats',
    'application/vnd.ms-',
  ];
  if (docTypes.some(t => mimeType.includes(t))) return 'document';

  return 'binary';
}

/**
 * Get file category from extension
 */
export function getCategoryFromExtension(filename: string): FileCategory {
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  const codeExts = [
    'js', 'ts', 'jsx', 'tsx', 'py', 'rs', 'java', 'cpp', 'c', 'h', 'hpp',
    'go', 'rb', 'php', 'swift', 'kt', 'scala', 'r', 'm', 'mm', 'cs', 'vb',
    'fs', 'hs', 'lua', 'pl', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'cmd',
    'bat', 'sql', 'html', 'css', 'scss', 'sass', 'less', 'xml', 'yaml',
    'yml', 'toml', 'ini', 'conf', 'config', 'json', 'md', 'markdown'
  ];
  if (codeExts.includes(ext)) return 'code';

  const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 'raw'];
  if (imageExts.includes(ext)) return 'image';

  const mediaExts = ['mp3', 'mp4', 'wav', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'webm', 'ogg', 'ogv'];
  if (mediaExts.includes(ext)) return 'media';

  const docExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'txt'];
  if (docExts.includes(ext)) return 'document';

  return 'binary';
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Check if file type should have content auto-extracted
 */
export function shouldAutoExtractContent(category: FileCategory, mimeType: string): boolean {
  if (category === 'text') return true;
  if (category === 'code') return true;
  if (mimeType === 'application/json') return true;
  if (mimeType === 'application/xml') return true;
  if (mimeType === 'text/plain') return true;
  if (mimeType === 'text/markdown') return true;
  if (mimeType === 'text/html') return true;
  if (mimeType === 'text/css') return true;
  return false;
}

/**
 * Get icon name for file category
 */
export function getCategoryIcon(category: FileCategory): string {
  switch (category) {
    case 'text': return 'FileText';
    case 'code': return 'FileCode';
    case 'document': return 'FileText';
    case 'image': return 'Image';
    case 'media': return 'Film';
    case 'binary': return 'File';
    default: return 'File';
  }
}

/**
 * Maximum file sizes (in bytes)
 */
export const FILE_SIZE_LIMITS = {
  SMALL: 10 * 1024 * 1024,      // 10 MB - direct upload
  LARGE: 100 * 1024 * 1024,     // 100 MB - chunked upload
  HUGE: 1024 * 1024 * 1024,     // 1 GB - streaming only
} as const;

/**
 * Chunk size for large file uploads (1 MB)
 */
export const CHUNK_SIZE = 1024 * 1024;

/**
 * Maximum content extraction size (100 KB)
 */
export const MAX_CONTENT_EXTRACTION_SIZE = 100 * 1024;
