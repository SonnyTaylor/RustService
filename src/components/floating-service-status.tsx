/**
 * Floating Service Status
 *
 * Bottom-right floating pill that shows service run progress when the user
 * navigates away from the service tab. Clicking it returns to the service tab.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Ban,
} from 'lucide-react';

import { Progress } from '@/components/ui/progress';
import { useServiceRun } from '@/components/service-run-context';
import { useAnimation } from '@/components/animation-context';

// =============================================================================
// Types
// =============================================================================

interface FloatingServiceStatusProps {
  activeTab: string;
}

// =============================================================================
// Component
// =============================================================================

export function FloatingServiceStatus({ activeTab }: FloatingServiceStatusProps) {
  const {
    isRunning,
    phase,
    completedCount,
    totalCount,
    currentServiceName,
    progress,
    failedCount,
  } = useServiceRun();
  const { animationsEnabled } = useAnimation();

  // Track completion dismissal
  const [dismissed, setDismissed] = useState(false);
  const [completionTimerId, setCompletionTimerId] = useState<ReturnType<typeof setTimeout> | null>(null);

  const isOnServiceTab = activeTab === 'service';
  const isComplete = phase === 'completed' || phase === 'failed' || phase === 'cancelled';

  // Reset dismissed state when a new run starts
  useEffect(() => {
    if (isRunning) {
      setDismissed(false);
      if (completionTimerId) {
        clearTimeout(completionTimerId);
        setCompletionTimerId(null);
      }
    }
  }, [isRunning]);

  // Auto-dismiss after completion (8 seconds)
  useEffect(() => {
    if (isComplete && !isOnServiceTab && !dismissed) {
      const timer = setTimeout(() => {
        setDismissed(true);
      }, 8000);
      setCompletionTimerId(timer);
      return () => clearTimeout(timer);
    }
  }, [isComplete, isOnServiceTab, dismissed]);

  // Determine visibility
  const shouldShow = !isOnServiceTab && !dismissed && (isRunning || (isComplete && !dismissed));

  const navigateToService = () => {
    window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'service' }));
    setDismissed(true);
  };

  const passedCount = completedCount - failedCount;

  const pillContent = () => {
    if (isRunning) {
      return (
        <>
          <div className="flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                Running {completedCount}/{totalCount} services...
              </p>
              {currentServiceName && (
                <p className="text-xs text-muted-foreground truncate">{currentServiceName}</p>
              )}
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
          <Progress value={progress} className="h-1.5 mt-2" />
        </>
      );
    }

    if (phase === 'completed') {
      return (
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Service Complete</p>
            <p className="text-xs text-muted-foreground">
              {passedCount} passed{failedCount > 0 ? `, ${failedCount} failed` : ''}
            </p>
          </div>
          <span className="text-xs text-primary font-medium shrink-0">View Results</span>
        </div>
      );
    }

    if (phase === 'failed') {
      return (
        <div className="flex items-center gap-3">
          <XCircle className="h-4 w-4 text-destructive shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Service Failed</p>
            <p className="text-xs text-muted-foreground">
              {failedCount} failed, {passedCount} passed
            </p>
          </div>
          <span className="text-xs text-primary font-medium shrink-0">View Results</span>
        </div>
      );
    }

    if (phase === 'cancelled') {
      return (
        <div className="flex items-center gap-3">
          <Ban className="h-4 w-4 text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Service Cancelled</p>
            <p className="text-xs text-muted-foreground">
              {completedCount} of {totalCount} completed
            </p>
          </div>
          <span className="text-xs text-primary font-medium shrink-0">View Results</span>
        </div>
      );
    }

    return null;
  };

  if (!animationsEnabled) {
    if (!shouldShow) return null;
    return (
      <div
        className="fixed bottom-4 right-4 z-50 w-80 px-4 py-3 rounded-xl border bg-card/95 backdrop-blur-md shadow-lg cursor-pointer hover:bg-card transition-colors"
        onClick={navigateToService}
      >
        {pillContent()}
      </div>
    );
  }

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          className="fixed bottom-4 right-4 z-50 w-80 px-4 py-3 rounded-xl border bg-card/95 backdrop-blur-md shadow-lg cursor-pointer hover:bg-card transition-colors"
          onClick={navigateToService}
        >
          {pillContent()}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
