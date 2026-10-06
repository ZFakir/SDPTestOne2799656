'use client';

import type { JobDTO } from '@rat/shared';
import { JOB_PHASE_LABELS, formatPercent } from '@/lib/format';

/**
 * Live progress strip for an ingestion job. The parent list already polls
 * while a repository is busy, so this component renders purely from props.
 */
export function JobProgress({ job, fallbackError }: { job: JobDTO; fallbackError?: string | null }) {
  if (job.status === 'failed') {
    return (
      <div className="banner banner-error text-sm" role="alert">
        <span aria-hidden="true">!</span>
        <span style={{ flex: 1 }}>{job.error ?? fallbackError ?? 'Ingestion failed.'}</span>
      </div>
    );
  }
  if (job.status === 'done') return null;

  const phase = JOB_PHASE_LABELS[job.phase] ?? job.phase;
  return (
    <div className="stack" style={{ gap: 'var(--space-xxs)', width: '100%' }}>
      <div className="row" style={{ justifyContent: 'space-between', gap: 'var(--space-sm)' }}>
        <span className="text-xs muted">
          {phase}
          {job.status === 'queued' ? ' · waiting in queue' : ''}
        </span>
        <span className="text-xs mono">{formatPercent(job.progress, 0)}</span>
      </div>
      <div
        className="progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(job.progress * 100)}
        aria-label={`Ingestion progress: ${phase}`}
      >
        <div className="progress-fill" style={{ width: `${Math.max(2, job.progress * 100)}%` }} />
      </div>
    </div>
  );
}
