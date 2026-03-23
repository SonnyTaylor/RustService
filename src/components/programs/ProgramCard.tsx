/**
 * Program Card Component
 *
 * Displays a single program entry with icon, info, and action buttons.
 */

import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  AppWindow,
  Play,
  Edit,
  Trash2,
  FolderOpen,
  Terminal,
  MoreVertical,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import type { Program } from '@/types/programs';

// =============================================================================
// Program Card Component
// =============================================================================

export interface ProgramCardProps {
  program: Program;
  dataDir: string;
  onLaunch: (id: string) => void;
  onEdit: (program: Program) => void;
  onDelete: (id: string) => void;
  onReveal: (id: string) => void;
}

export function ProgramCard({
  program,
  onLaunch,
  onEdit,
  onDelete,
  onReveal,
}: Omit<ProgramCardProps, 'dataDir'>) {
  const [iconUrl, setIconUrl] = useState<string | null>(null);

  // Load icon via backend command
  useEffect(() => {
    if (program.iconPath) {
      invoke<string | null>('get_program_icon', { iconPath: program.iconPath })
        .then(url => setIconUrl(url))
        .catch(() => setIconUrl(null));
    } else {
      setIconUrl(null);
    }
  }, [program.iconPath]);

  return (
    <Card className="group hover:shadow-md transition-all duration-200 hover:border-primary/50 w-full">
      <CardContent className="p-3 py-0">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
            {iconUrl ? (
              <img
                src={iconUrl}
                alt={program.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.parentElement?.classList.add('no-icon');
                }}
              />
            ) : (
              <AppWindow className="h-5 w-5 text-muted-foreground" />
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-medium truncate">{program.name}</h3>
              {program.isCli && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Terminal className="h-3 w-3" />
                  CLI
                </Badge>
              )}
            </div>
            {program.description && (
              <p className="text-sm text-muted-foreground break-words">
                {program.description}
              </p>
            )}
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              {program.version && <span>v{program.version}</span>}
              <span>Launched {program.launchCount}×</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <TooltipProvider delayDuration={300}>
              {program.isCli ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" disabled className="h-8 w-8">
                      <Play className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>CLI tools cannot be launched from GUI</TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-100 dark:hover:bg-green-900/30"
                      onClick={() => onLaunch(program.id)}
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Launch</TooltipContent>
                </Tooltip>
              )}
            </TooltipProvider>

            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(program)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onReveal(program.id)}>
                  <FolderOpen className="h-4 w-4 mr-2" />
                  Show in Explorer
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDelete(program.id)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
