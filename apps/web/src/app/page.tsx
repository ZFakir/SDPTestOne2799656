'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { RepositoryDTO } from '@rat/shared';
import { ApiError, api } from '@/lib/api';
import { useRepositories } from '@/lib/hooks';
import { formatDateTime, formatInt, shortSha } from '@/lib/format';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorBanner } from '@/components/common/ErrorBanner';
import { RepoStatusBadge } from '@/components/common/StatusBadge';
import { IngestTabs } from '@/components/ingest/IngestTabs';
import { JobProgress } from '@/components/ingest/JobProgress';

/** One repository row with status, progress and actions. */
function RepoRow({
  repo,
  deleting,
  confirming,
  actionError,
  onDelete,
  onConfirm,
  onCancel,
}: {
  repo: RepositoryDTO;
  deleting: boolean;
  confirming: boolean;
  actionError?: string;
  onDelete: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const busy = repo.status === 'queued' || repo.status === 'processing';
  const job = repo.latestJob;

  return (
    <div className="repo-row" style={{ alignItems: 'flex-start' }}>
      <div className="stack" style={{ gap: 'var(--space-xs)', flex: 1, minWidth: 260 }}>
        <div className="row" style={{ gap: 'var(--space-sm)' }}>
          <RepoStatusBadge status={repo.status} />
          {repo.status === 'ready' ? (
            <Link href={`/repos/${repo.id}`} className="repo-name">
              {repo.name}
            </Link>
          ) : (
            <span className="repo-name">{repo.name}</span>
          )}
        </div>

        <div className="repo-meta">
          <span className="badge badge-no-dot mono">
            {repo.sourceType === 'zip' ? 'ZIP' : 'CLONE'}
          </span>
          {repo.status === 'ready' ? (
            <>
              <span>{formatInt(repo.commitCount)} commits</span>
              {repo.headSha ? (
                <span className="mono text-xs" title={repo.headSha}>
                  {shortSha(repo.headSha)}
                </span>
              ) : null}
            </>
          ) : null}
          <span className="muted text-xs">added {formatDateTime(repo.createdAt)}</span>
        </div>

        {busy && job ? (
          <div style={{ width: '100%', maxWidth: 560 }}>
            <JobProgress job={job} fallbackError={repo.error} />
          </div>
        ) : null}

        {repo.status === 'error' ? (
          <div className="banner banner-error text-sm" role="alert">
            <span aria-hidden="true">!</span>
            <span style={{ flex: 1 }}>{repo.error ?? 'Ingestion failed.'}</span>
          </div>
        ) : null}

        {actionError ? <ErrorBanner message={actionError} /> : null}
      </div>

      <div className="repo-actions">
        {repo.status === 'ready' ? (
          <Link href={`/repos/${repo.id}`} className="btn btn-secondary btn-sm">
            Open dashboard
          </Link>
        ) : null}
        {confirming ? (
          <>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={onDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Confirm delete'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onConfirm}
            disabled={busy}
            title={busy ? 'Cannot delete while ingestion is running' : 'Delete repository'}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

export default function HomePage() {
  const { data, error, isLoading, mutate } = useRepositories();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);

  async function handleDelete(repoId: string) {
    setDeletingId(repoId);
    setActionError(null);
    try {
      await api.deleteRepository(repoId);
      setConfirmId(null);
      await mutate();
    } catch (err) {
      setActionError({
        id: repoId,
        message: err instanceof ApiError ? err.message : 'Delete failed.',
      });
    } finally {
      setDeletingId(null);
    }
  }

  const repositories = data?.repositories ?? [];

  return (
    <div className="stack">
      <section className="hero">
        <h1>Analyze any Git repository.</h1>
        <p className="lead" style={{ marginTop: 'var(--space-md)' }}>
          Upload an archive containing the Git history or clone a remote URL. RAT computes
          commit-level line statistics and answers the brief&rsquo;s file, directory, repository,
          commit-set and author metrics.
        </p>
      </section>

      <IngestTabs
        onCreated={() => {
          void mutate();
          document.getElementById('repo-list')?.scrollIntoView({ behavior: 'smooth' });
        }}
      />

      <section className="stack" id="repo-list" style={{ scrollMarginTop: 80 }}>
        <div className="panel-header" style={{ marginBottom: 0 }}>
          <h2 className="section-title">Repositories</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void mutate()}>
            Refresh
          </button>
        </div>

        {error ? (
          <ErrorBanner
            message={error instanceof Error ? error.message : 'Failed to load repositories.'}
            onRetry={() => void mutate()}
          />
        ) : null}

        {isLoading ? (
          <div className="repo-list" aria-hidden="true">
            {[0, 1, 2].map((n) => (
              <div className="repo-row" key={n}>
                <div className="skeleton" style={{ width: 220, height: 20 }} />
                <div className="skeleton" style={{ width: 320, height: 16 }} />
              </div>
            ))}
          </div>
        ) : null}

        {!isLoading && !error && repositories.length === 0 ? (
          <EmptyState
            title="No repositories yet"
            description="Upload a zip containing a .git directory, or clone a repository by URL above."
          />
        ) : null}

        {repositories.length > 0 ? (
          <div className="repo-list">
            {repositories.map((repo) => (
              <RepoRow
                key={repo.id}
                repo={repo}
                deleting={deletingId === repo.id}
                confirming={confirmId === repo.id}
                actionError={actionError?.id === repo.id ? actionError.message : undefined}
                onConfirm={() => setConfirmId(repo.id)}
                onCancel={() => setConfirmId(null)}
                onDelete={() => void handleDelete(repo.id)}
              />
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
