/**
 * BSOD Detail View Component
 *
 * Expanded detail view for a crash dump entry.
 */

import {
  AlertCircle,
  Copy,
  Lightbulb,
  Loader2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

import type { BsodDetails } from '@/types';
import { formatCrashTime } from '@/types/bluescreen';
import { useClipboard } from '@/lib/clipboard-utils';

interface BSODDetailViewProps {
  details: BsodDetails | null;
  dumpPath: string;
  loading: boolean;
}

export function BSODDetailView({
  details,
  dumpPath,
  loading,
}: BSODDetailViewProps) {
  const { copyToClipboard } = useClipboard();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!details || details.dumpPath !== dumpPath) {
    return (
      <div className="text-center text-muted-foreground py-4">
        Click to load details
      </div>
    );
  }

  return (
    <>
      {/* Crash Info Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <div>
          <span className="text-xs text-muted-foreground">Stop Code</span>
          <div className="font-mono">{details.stopCode}</div>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Dump Type</span>
          <div>{details.dumpType}</div>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">Crash Time</span>
          <div>{formatCrashTime(details.crashTime)}</div>
        </div>
        {details.faultingModule && (
          <div className="col-span-2">
            <span className="text-xs text-muted-foreground">
              Faulting Module
            </span>
            <div className="font-mono">{details.faultingModule}</div>
          </div>
        )}
      </div>

      {/* Stop Code Description */}
      {details.stopCodeDescription && (
        <div>
          <span className="text-xs text-muted-foreground">Description</span>
          <div className="text-sm mt-1 p-3 bg-muted rounded-lg">
            {details.stopCodeDescription}
          </div>
        </div>
      )}

      {/* Possible Causes */}
      {details.possibleCauses.length > 0 && (
        <div>
          <span className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
            <AlertCircle className="h-3 w-3" />
            Possible Causes
          </span>
          <ul className="list-disc list-inside space-y-1 text-sm">
            {details.possibleCauses.map((cause, idx) => (
              <li key={idx}>{cause}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommendations */}
      {details.recommendations.length > 0 && (
        <div>
          <span className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
            <Lightbulb className="h-3 w-3" />
            Recommendations
          </span>
          <ul className="list-disc list-inside space-y-1 text-sm">
            {details.recommendations.map((rec, idx) => (
              <li key={idx}>{rec}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Dump Path */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">Dump File Path</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2"
            onClick={() => copyToClipboard(details.dumpPath)}
          >
            <Copy className="h-3 w-3 mr-1" />
            Copy
          </Button>
        </div>
        <code className="text-xs bg-muted p-2 rounded block overflow-x-auto">
          {details.dumpPath}
        </code>
      </div>
    </>
  );
}
