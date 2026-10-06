'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ErrorBanner } from '@/components/common/ErrorBanner';
import { RepoStatusBadge } from '@/components/common/StatusBadge';
import { CompareMetricsChart } from '@/components/metrics/charts/CompareMetricsChart';
import {
  formatDate,
  formatDecimal,
  formatInt,
  formatPercent,
  formatSigned,
  fromDatetimeLocalValue,
  shortSha,
} from '@/lib/format';
import { useCompare, useRepositories, type CompareParams } from '@/lib/hooks';

const MAX_REPOS = 8;

type ComparePreset = 'all' | 'last7' | 'last30' | 'last90' | 'custom';

/** Compile the range selector into compare API params. */
function buildCompareParams(
  preset: ComparePreset,
  customFrom: string,
  customTo: string,
): CompareParams {
  if (preset === 'custom') {
    const from = fromDatetimeLocalValue(customFrom);
    const to = fromDatetimeLocalValue(customTo);
    if (from === undefined && to === undefined) return {};
    // The API range end is exclusive; include the entered minute.
    return { fromTs: from, toTs: to !== undefined ? to + 60 : undefined };
  }
  const days = preset === 'last7' ? 7 : preset === 'last30' ? 30 : preset === 'last90' ? 90 : 0;
  return days > 0 ? { lastDays: days } : {};
}

/**
 * Multi-repository comparison: pick up to eight ready repositories and compare
 * their metric vectors over a shared range. Relative windows ("last N days")
 * end at each repository's own newest commit.
 */
export default function ComparePage() {
  const { data, error: reposError, isLoading, mutate } = useRepositories();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [preset, setPreset] = useState<ComparePreset>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const repositories = data?.repositories ?? [];
  const readyRepos = repositories.filter((repo) => repo.status === 'ready');

  const params = buildCompareParams(preset, customFrom, customTo);
  const compare = useCompare(selectedIds, params);

  function toggleRepo(repoId: string) {
    setSelectedIds((prev) => {
      if (prev.includes(repoId)) return prev.filter((id) => id !== repoId);
      if (prev.length >= MAX_REPOS) return prev;
      return [...prev, repoId];
    });
  }

  const repos = compare.data?.repos ?? [];
  const comparisonReady = selectedIds.length >= 2;

  return (
    <div className="stack" style={{ paddingTop: 'var(--space-md)' }}>
      <div className="stack" style={{ gap: 'var(--space-sm)' }}>
        <Link href="/" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}>
          ← Repositories
        </Link>
        <h1 style={{ fontSize: 'var(--text-xl)' }}>Compare repositories</h1>
        <p className="section-sub text-sm">
          Pick two to eight ready repositories. Relative windows end at each repository&rsquo;s own
          newest commit, so &ldquo;last 30 days&rdquo; always covers its final 30 days of history.
        </p>
      </div>

      {reposError ? (
        <ErrorBanner
          message={
            reposError instanceof Error ? reposError.message : 'Failed to load repositories.'
          }
          onRetry={() => void mutate()}
        />
      ) : null}

      <div className="card" style={{ padding: 'var(--space-lg)' }}>
        <div className="table-toolbar" style={{ marginBottom: 'var(--space-sm)' }}>
          <span className="section-title" style={{ fontSize: 'var(--text-md)' }}>
            Repositories
          </span>
          <span className="muted text-xs">
            {selectedIds.length} selected · up to {MAX_REPOS}
          </span>
        </div>

        {isLoading ? (
          <div className="stack" style={{ gap: 'var(--space-sm)' }}>
            {[0, 1, 2].map((n) => (
              <div key={n} className="skeleton" style={{ height: 28 }} />
            ))}
          </div>
        ) : readyRepos.length === 0 ? (
          <span className="muted text-sm">
            No ready repositories yet. Ingest and finish at least two repositories to compare them.
          </span>
        ) : (
          <div className="compare-picks">
            {repositories.map((repo) => {
              const ready = repo.status === 'ready';
              const checked = selectedIds.includes(repo.id);
              const atCapacity = selectedIds.length >= MAX_REPOS;
              return (
                <label
                  key={repo.id}
                  className={`compare-pick${checked ? ' compare-pick-active' : ''}${
                    ready ? '' : ' compare-pick-disabled'
                  }`}
                  title={ready ? undefined : 'Only ready repositories can be compared'}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!ready || (atCapacity && !checked)}
                    onChange={() => toggleRepo(repo.id)}
                  />
                  <span className="compare-pick-name">{repo.name}</span>
                  <RepoStatusBadge status={repo.status} />
                  {repo.status === 'ready' ? (
                    <span className="muted text-xs">
                      {formatInt(repo.commitCount)} commits
                      {repo.headSha ? (
                        <>
                          {' '}
                          · <span className="mono">{shortSha(repo.headSha)}</span>
                        </>
                      ) : null}
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
        )}

        <div className="compare-range row" style={{ marginTop: 'var(--space-md)' }}>
          <div className="field">
            <label className="field-label" htmlFor="compare-preset">
              Range
            </label>
            <select
              id="compare-preset"
              className="select"
              value={preset}
              onChange={(event) => setPreset(event.target.value as ComparePreset)}
            >
              <option value="all">All time</option>
              <option value="last7">Last 7 days</option>
              <option value="last30">Last 30 days</option>
              <option value="last90">Last 90 days</option>
              <option value="custom">Custom range…</option>
            </select>
          </div>
          {preset === 'custom' ? (
            <>
              <div className="field">
                <label className="field-label" htmlFor="compare-from">
                  From (UTC)
                </label>
                <input
                  id="compare-from"
                  className="input"
                  type="datetime-local"
                  value={customFrom}
                  onChange={(event) => setCustomFrom(event.target.value)}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="compare-to">
                  To (UTC, inclusive)
                </label>
                <input
                  id="compare-to"
                  className="input"
                  type="datetime-local"
                  value={customTo}
                  onChange={(event) => setCustomTo(event.target.value)}
                />
              </div>
            </>
          ) : null}
        </div>
      </div>

      {!comparisonReady ? (
        <div className="empty-state">
          <h3>Select at least two repositories</h3>
          <p>Check two or more ready repositories above to see the side-by-side comparison.</p>
        </div>
      ) : compare.error ? (
        <ErrorBanner
          message={
            compare.error instanceof Error
              ? compare.error.message
              : 'Failed to load the comparison.'
          }
          onRetry={() => void compare.mutate()}
        />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Repository</th>
                  <th className="num">Commits |H|</th>
                  <th className="num">Added l+</th>
                  <th className="num">Removed l−</th>
                  <th className="num">Growth δ</th>
                  <th className="num">Churn λ</th>
                  <th className="num">Mods n</th>
                  <th className="num">Mod. η</th>
                  <th className="num">Churn rate ρ</th>
                  <th>Window (UTC)</th>
                </tr>
              </thead>
              <tbody>
                {repos.length === 0 ? (
                  <tr>
                    <td className="table-empty" colSpan={10}>
                      {compare.isLoading ? 'Loading comparison…' : 'No data for this range.'}
                    </td>
                  </tr>
                ) : (
                  repos.map((repo) => (
                    <tr key={repo.id}>
                      <td>
                        <div className="cell-strong">
                          <Link href={`/repos/${repo.id}`} className="path-link">
                            {repo.name}
                          </Link>
                        </div>
                        <div className="muted text-xs mono">
                          {repo.sourceType === 'zip' ? 'ZIP' : 'CLONE'} · {repo.sourceRef}
                          {repo.headSha ? ` · ${shortSha(repo.headSha)}` : ''}
                        </div>
                      </td>
                      <td className="num">{formatInt(repo.metrics.commitCount)}</td>
                      <td className="num pos">{formatInt(repo.metrics.added)}</td>
                      <td className={`num${repo.metrics.removed > 0 ? ' neg' : ''}`}>
                        {formatInt(repo.metrics.removed)}
                      </td>
                      <td
                        className={`num${
                          repo.metrics.growth > 0
                            ? ' pos'
                            : repo.metrics.growth < 0
                              ? ' neg'
                              : ''
                        }`}
                      >
                        {formatSigned(repo.metrics.growth)}
                      </td>
                      <td className="num cell-strong">{formatInt(repo.metrics.churn)}</td>
                      <td className="num">{formatInt(repo.metrics.modifications)}</td>
                      <td className="num">{formatPercent(repo.metrics.modificationFrequency)}</td>
                      <td className="num">{formatDecimal(repo.metrics.churnRate)}</td>
                      <td className="text-xs">
                        {repo.metrics.firstTs !== null && repo.metrics.lastTs !== null
                          ? `${formatDate(repo.metrics.firstTs)} → ${formatDate(repo.metrics.lastTs)}`
                          : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {repos.length > 0 ? <CompareMetricsChart repos={repos} /> : null}
        </>
      )}
    </div>
  );
}
