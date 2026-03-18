/**
 * Agent Loop Queue
 *
 * Ensures only one `runAgentLoop` executes at a time.
 * Queued requests are coalesced — multiple rapid service updates
 * become one combined message — and processed sequentially.
 */

import type { CoreMessage } from 'ai';

export interface LoopOptions {
  /** How many more auto-continue turns the agent may take (default: 50). */
  turnsRemaining?: number;
  reuseMessageId?: string | null;
  /** Internal: pass parts directly to avoid React state race. */
  _currentParts?: unknown[];
  _currentContent?: string;
}

export interface LoopRequest {
  history: CoreMessage[];
  options?: LoopOptions;
  /** When set, this request is a service update that can be merged with others. */
  serviceUpdate?: {
    content: string;
  };
}

type RunAgentLoopFn = (
  history: CoreMessage[],
  options?: LoopOptions,
) => Promise<void>;

export class AgentLoopQueue {
  private _busy = false;
  private _queue: LoopRequest[] = [];
  private _runFn: RunAgentLoopFn;

  constructor(runFn: RunAgentLoopFn) {
    this._runFn = runFn;
  }

  /** Whether a loop is currently executing. */
  get busy(): boolean {
    return this._busy;
  }

  /** Number of pending (queued) requests. */
  get pending(): number {
    return this._queue.length;
  }

  /** Update the run function (e.g. when the callback reference changes). */
  setRunFn(fn: RunAgentLoopFn) {
    this._runFn = fn;
  }

  /**
   * Add a request to the queue.
   * If idle, starts processing immediately.
   * If busy, coalesces service updates and queues the request.
   */
  enqueue(request: LoopRequest) {
    if (!this._busy) {
      this._processRequest(request);
    } else {
      this._queue.push(request);
    }
  }

  /**
   * Merge queued service update requests into a single request.
   * Non-service requests pass through unchanged.
   * Returns the coalesced queue.
   */
  private coalesceQueue(): LoopRequest[] {
    if (this._queue.length <= 1) return this._queue;

    const coalesced: LoopRequest[] = [];
    let pendingServiceUpdates: LoopRequest[] = [];

    for (const req of this._queue) {
      if (req.serviceUpdate) {
        pendingServiceUpdates.push(req);
      } else {
        // Flush any accumulated service updates before a non-service request
        if (pendingServiceUpdates.length > 0) {
          coalesced.push(this._mergeServiceUpdates(pendingServiceUpdates));
          pendingServiceUpdates = [];
        }
        coalesced.push(req);
      }
    }

    // Flush remaining service updates
    if (pendingServiceUpdates.length > 0) {
      coalesced.push(this._mergeServiceUpdates(pendingServiceUpdates));
    }

    return coalesced;
  }

  /**
   * Merge multiple service update requests into one combined request.
   * Uses the latest history and combines all update content.
   */
  private _mergeServiceUpdates(updates: LoopRequest[]): LoopRequest {
    if (updates.length === 1) return updates[0];

    // Combine all service update content into one message
    const combinedContent = updates
      .map(u => u.serviceUpdate!.content)
      .join('\n\n---\n\n');

    // Use the latest history as the base (it's the most up-to-date)
    const latestHistory = updates[updates.length - 1].history;

    // Replace the last user message (which would be a service update) with the combined one
    const baseHistory = latestHistory.slice(0, -1);
    const combinedMsg: CoreMessage = {
      role: 'user',
      content: `[SERVICE UPDATE — ${updates.length} services completed]\n\n${combinedContent}`,
    };

    return {
      history: [...baseHistory, combinedMsg],
      options: updates[updates.length - 1].options,
      serviceUpdate: { content: combinedContent },
    };
  }

  private async _processRequest(request: LoopRequest) {
    this._busy = true;
    try {
      await this._runFn(request.history, request.options);
    } catch (err) {
      console.error('[AgentLoopQueue] Error during loop execution:', err);
    } finally {
      this._busy = false;
      this._processNext();
    }
  }

  private _processNext() {
    if (this._queue.length === 0) return;

    // Coalesce before processing
    const coalesced = this.coalesceQueue();
    this._queue = coalesced.slice(1);
    const next = coalesced[0];

    if (next) {
      this._processRequest(next);
    }
  }

  /** Clear all pending requests (e.g. on abort/reset). */
  clear() {
    this._queue = [];
  }
}
