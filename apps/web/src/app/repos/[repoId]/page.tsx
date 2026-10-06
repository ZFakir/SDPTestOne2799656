'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ErrorBanner } from '@/components/common/ErrorBanner';
import { RepoStatusBadge } from '@/components/common/StatusBadge';
import {
  EMPTY_FILTERS,
  FilterBar,
  buildCommitFilters,
  describeFilters,
  type FilterState,
} from '@/components/filters/FilterBar';
import { JobProgress } from '@/components/ingest/JobProgress';
import { AuthorMetricsTable } from '@/components/metrics/AuthorMetricsTable';
import { DirectoryTreeTable } from '@/components/metrics/DirectoryTreeTable';
import { FileMetricsTable } from '@/components/metrics/FileMetricsTable';
import { MetricCards } from '@/components/metrics/MetricCards';
import { ChurnOverTimeChart } from '@/components/metrics/charts/ChurnOverTimeChart';
import { TopFilesChart } from '@/components/metrics/charts/TopFilesChart';
import { ApiError } from '@/lib/api';
import { formatDate, formatInt, shortSha } from '@/lib/format';
import { useAuthors, usePaths, useRepoMetrics, useRepository } from '@/lib/hooks';

const TABS = ['overview', 'files', 'directories', 'authors'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  overview: 'Overview',
  files: 'Files',
  directories: 'Directories',
  authors: 'Authors',
};

export default function RepoDashboardPage({ params }: { params: { repoId: string } }) {
  const repoId = params.repoId;
  const { data: repo, error, isLoading, mutate } = useRepository(repoId);
  const [tab, setTab] = useState<Tab>('overview');
  const [filterState, setFilterState] = useState<FilterState>(EMPTY_FILTERS);

  const authors = useAuthors(repoId);
  const paths = usePaths(repoId);

  // Baseline (unfiltered) metrics anchor the relative range presets.
  const baseline = useRepoMetrics(repoId, {});
  const filters = buildCommitFilters(filterState, baseline.data?.lastTs ?? null);
  const metrics = useRepoMetrics(repoId, filters);

  // A directory selected in the path picker is matched as a subtree prefix.
  const filePrefix = filterState.path
    ? paths.data?.dirs.includes(filterState.path)
      ? `${filterState.path}/`
      : filterState.path
    : '';

  const backLink = (
    <Link href="/" className="btn btn-ghost btn-sm">
      ← Repositories
    </Link>
  );

  if (error) {
    const message =
      error instanceof ApiError && error.code === 'REPO_NOT_FOUND'
        ? `Repository ${repoId} does not exist (it may have been deleted).`
        : error instanceof Error
          ? error.message
          : 'Failed to load the repository.';
    return (
      <div className="container" style={{ paddingTop: 'var(--space-xxxl)', paddingBottom: 'var(--space-section)' }}>
        <div className="stack">
          {backLink}
          <ErrorBanner message={message} onRetry={() => mutate()} />
        </div>
      </div>
    );
  }

  if (isLoading || !repo) {
    return (
      <div className="container" style={{ paddingTop: 'var(--space-xxxl)', paddingBottom: 'var(--space-section)' }}>
        <div className="stack">
          {backLink}
          <div className="skeleton" style={{ height: 40, width: 280 }} />
          <div className="skeleton" style={{ height: 120 }} />
        </div>
      </div>
    );
  }

  const head = (
    <div className="stack" style={{ gap: 'var(--space-md)' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        {backLink}
        <span className="muted text-xs mono">{repo.id}</span>
      </div>
      <div className="row" style={{ gap: 'var(--space-md)' }}>
        <h1 style={{ fontSize: 'var(--text-xl)' }}>{repo.name}</h1>
        <RepoStatusBadge status={repo.status} />
      </div>
      <p className="section-sub text-sm">
        {repo.sourceType === 'zip' ? 'Zip upload' : 'Git clone'} · {repo.sourceRef}
        {repo.status === 'ready' ? (
          <>
            {' '}
            · {formatInt(repo.commitCount ?? 0)} commits · head{' '}
            <span className="mono">{repo.headSha ? shortSha(repo.headSha) : '—'}</span> · ready{' '}
            {formatDate(repo.readyAt)}
          </>
        ) : null}
      </p>
    </div>
  );

  if (repo.status !== 'ready') {
    return (
      <div className="container" style={{ paddingTop: 'var(--space-xxxl)', paddingBottom: 'var(--space-section)' }}>
        <div className="stack">
          {head}
          <div className="card">
            {repo.latestJob ? (
              <div className="stack" style={{ gap: 'var(--space-sm)' }}>
                <span className="section-title" style={{ fontSize: 'var(--text-lg)' }}>
                  Ingestion in progress
                </span>
                <JobProgress job={repo.latestJob} fallbackError={repo.error} />
              </div>
            ) : (
              <div className="stack" style={{ gap: 'var(--space-sm)' }}>
                <span className="section-title" style={{ fontSize: 'var(--text-lg)' }}>
                  {repo.status === 'error' ? 'Ingestion failed' : 'Waiting to start'}
                </span>
                {repo.error ? <ErrorBanner message={repo.error} /> : null}
              </div>
            )}
            <p className="muted text-sm" style={{ marginTop: 'var(--space-md)' }}>
              Metrics become available once the repository reaches the <strong>ready</strong> state.
              This page refreshes automatically.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="container"
      style={{ paddingTop: 'var(--space-xxxl)', paddingBottom: 'var(--space-section)' }}
    >
      <div className="stack">
        {head}

        <FilterBar
          state={filterState}
          onChange={setFilterState}
          authors={authors.data}
          paths={paths.data}
        />
        <span className="filter-summary">{describeFilters(filterState)}</span>

        <div className="tabs" role="tablist" aria-label="Metric views">
          {TABS.map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              className="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
            >
              {TAB_LABELS[value]}
            </button>
          ))}
        </div>

        <div role="tabpanel" aria-label={TAB_LABELS[tab]}>
          {tab === 'overview' ? (
            <div className="stack">
              <MetricCards metrics={metrics.data} />
              {metrics.error ? (
                <ErrorBanner message={`Failed to load metrics: ${metrics.error.message}`} />
              ) : null}
              <div className="chart-row">
                <ChurnOverTimeChart repoId={repoId} filters={filters} path={filterState.path} />
                <TopFilesChart
                  repoId={repoId}
                  filters={filters}
                  pathPrefix={filePrefix}
                  onSelectPath={(path) => setFilterState((prev) => ({ ...prev, path }))}
                />
              </div>
            </div>
          ) : tab === 'files' ? (
            <FileMetricsTable repoId={repoId} filters={filters} pathPrefix={filePrefix} />
          ) : tab === 'directories' ? (
            <DirectoryTreeTable repoId={repoId} filters={filters} />
          ) : (
            <AuthorMetricsTable repoId={repoId} filters={filters} path={filterState.path} />
          )}
        </div>
      </div>
    </div>
  );
}
