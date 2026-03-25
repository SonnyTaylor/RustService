/**
 * Shared clipboard utilities
 *
 * Reusable hook for copy-to-clipboard with visual feedback.
 */

import { useState, useCallback } from 'react';

export function useClipboard(resetDelay = 2000) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyToClipboard = useCallback(
    async (text: string, id?: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedId(id ?? '__default__');
        setTimeout(() => setCopiedId(null), resetDelay);
        return true;
      } catch {
        return false;
      }
    },
    [resetDelay]
  );

  const isCopied = useCallback(
    (id?: string) => {
      return copiedId === (id ?? '__default__');
    },
    [copiedId]
  );

  return { copyToClipboard, isCopied, copiedId } as const;
}
