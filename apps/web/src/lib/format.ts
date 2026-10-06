/** Display formatting helpers shared across the dashboard. */

export function formatInt(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('en-US');
}

/** Signed integer for growth values: `+29`, `-4`, `0`. */
export function formatSigned(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value > 0 ? `+${value.toLocaleString('en-US')}` : value.toLocaleString('en-US');
}

/** Fixed-decimal float, e.g. `2.75`. */
export function formatDecimal(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return '—';
  return value.toFixed(digits);
}

/** Fraction (0.4634) → percent string (`46.3%`). */
export function formatPercent(fraction: number | null | undefined, digits = 1): string {
  if (fraction === null || fraction === undefined) return '—';
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** UNIX seconds → `YYYY-MM-DD` (UTC). */
export function formatDate(ts: number | null | undefined): string {
  if (ts === null || ts === undefined) return '—';
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

/** UNIX seconds → `YYYY-MM-DD HH:MM UTC`. */
export function formatDateTime(ts: number | null | undefined): string {
  if (ts === null || ts === undefined) return '—';
  return `${new Date(ts * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/** UNIX seconds → `YYYY-MM-DDTHH:MM` for `datetime-local` inputs (UTC). */
export function toDatetimeLocalValue(ts: number | null | undefined): string {
  if (ts === null || ts === undefined) return '';
  return new Date(ts * 1000).toISOString().slice(0, 16);
}

/** `datetime-local` value (UTC) → UNIX seconds. */
export function fromDatetimeLocalValue(value: string): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(`${value}:00Z`);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : undefined;
}

/** High-resolution duration: `1.4 s`, `2 m 05 s`. */
export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes} m ${String(rest).padStart(2, '0')} s`;
}

/** Shorten a commit sha to its 7-character abbreviation. */
export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

/** Human-readable byte size. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value >= 100 || unit === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

export const REPO_STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  processing: 'Processing',
  ready: 'Ready',
  error: 'Failed',
};

export const JOB_PHASE_LABELS: Record<string, string> = {
  pending: 'Waiting in queue',
  extracting: 'Extracting archive',
  cloning: 'Cloning repository',
  validating: 'Validating repository',
  analyzing: 'Analyzing history',
  finalizing: 'Finalizing',
  complete: 'Complete',
};

export const JOB_STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  running: 'Running',
  done: 'Done',
  failed: 'Failed',
};

/** Badge modifier for a repository status. */
export function repoStatusBadgeClass(status: string): string {
  switch (status) {
    case 'ready':
      return 'badge badge-success';
    case 'error':
      return 'badge badge-danger';
    case 'processing':
      return 'badge badge-info';
    default:
      return 'badge badge-warning';
  }
}

/** Badge modifier for a job status. */
export function jobStatusBadgeClass(status: string): string {
  switch (status) {
    case 'done':
      return 'badge badge-success';
    case 'failed':
      return 'badge badge-danger';
    case 'running':
      return 'badge badge-info';
    default:
      return 'badge badge-warning';
  }
}
