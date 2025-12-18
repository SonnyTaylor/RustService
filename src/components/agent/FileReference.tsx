/**
 * File Reference Component
 *
 * Displays a file reference with icon, name, and optional line range.
 * Styled to match Claude/Cursor UI.
 */

import { FileCode, FileText, FileJson, File, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileReferenceProps {
  path: string;
  filename?: string;
  lineRange?: string;
  className?: string;
}

/**
 * Get icon based on file extension
 */
function getFileIcon(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase();
  
  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
      return { Icon: FileCode, color: 'text-blue-400' };
    case 'json':
      return { Icon: FileJson, color: 'text-yellow-400' };
    case 'md':
    case 'txt':
      return { Icon: FileText, color: 'text-zinc-400' };
    case 'toml':
    case 'yaml':
    case 'yml':
    case 'config':
      return { Icon: Settings, color: 'text-orange-400' };
    default:
      return { Icon: File, color: 'text-zinc-400' };
  }
}

export function FileReference({
  path,
  filename,
  lineRange,
  className,
}: FileReferenceProps) {
  const displayName = filename || path.split(/[/\\]/).pop() || path;
  const { Icon, color } = getFileIcon(displayName);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-800/50 text-sm font-mono',
        'hover:bg-zinc-700/50 transition-colors cursor-pointer',
        className
      )}
      title={path}
    >
      <Icon className={cn('h-3.5 w-3.5', color)} />
      <span className="text-zinc-200">{displayName}</span>
      {lineRange && (
        <span className="text-zinc-500">#{lineRange}</span>
      )}
    </span>
  );
}

export default FileReference;
