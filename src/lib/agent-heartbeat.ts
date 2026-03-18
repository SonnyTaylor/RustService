/**
 * Agent Heartbeat
 *
 * Watchdog that tracks agent loop activity and detects stalls.
 * Checks every 5 seconds — if no stream event for 30s, marks as `stalled`.
 */

export type HeartbeatStatus = 'idle' | 'active' | 'stalled';

export type HeartbeatCallback = (status: HeartbeatStatus) => void;

const CHECK_INTERVAL_MS = 5_000;
const STALL_THRESHOLD_MS = 30_000;

export class AgentHeartbeat {
  private _status: HeartbeatStatus = 'idle';
  private _lastPing = 0;
  private _intervalId: ReturnType<typeof setInterval> | null = null;
  private _onStatusChange: HeartbeatCallback | null = null;

  /** Current heartbeat status. */
  get status(): HeartbeatStatus {
    return this._status;
  }

  /** Register a callback for status changes. */
  onStatusChange(cb: HeartbeatCallback) {
    this._onStatusChange = cb;
  }

  /** Start monitoring. Call at the beginning of `runAgentLoop`. */
  start() {
    this._lastPing = Date.now();
    this._setStatus('active');

    // Clear any existing interval
    if (this._intervalId !== null) {
      clearInterval(this._intervalId);
    }

    this._intervalId = setInterval(() => {
      if (this._status === 'idle') return;

      const elapsed = Date.now() - this._lastPing;
      if (elapsed >= STALL_THRESHOLD_MS && this._status !== 'stalled') {
        this._setStatus('stalled');
      }
    }, CHECK_INTERVAL_MS);
  }

  /** Record activity. Call on every stream event. */
  ping() {
    this._lastPing = Date.now();
    if (this._status === 'stalled') {
      this._setStatus('active');
    }
  }

  /** Stop monitoring. Call on all exit paths of `runAgentLoop`. */
  stop() {
    if (this._intervalId !== null) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
    this._setStatus('idle');
  }

  private _setStatus(status: HeartbeatStatus) {
    if (this._status === status) return;
    this._status = status;
    this._onStatusChange?.(status);
  }
}
