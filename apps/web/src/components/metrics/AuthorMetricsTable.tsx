'use client';

import type { AuthorKind } from '@rat/shared';
import type { CommitFilters } from '@/lib/api';
import { formatInt, formatPercent } from '@/lib/format';
import { useAuthorMetrics, useAuthors } from '@/lib/hooks';

function kindBadgeClass(kind: AuthorKind | 'mailto'): string {
  switch (kind) {
    case 'canonical':
      return 'badge badge-info';
    case 'mailmap':
      return 'badge badge-success';
    default:
      return 'badge badge-neutral';
  }
}

/**
 * Per-author metrics over the active scope: churn, modifications and the
 * ownership fraction ω = λ_H,o,a / λ_H,o (bar + percentage).
 */
export function AuthorMetricsTable({
  repoId,
  filters,
  path,
}: {
  repoId: string;
  filters: CommitFilters;
  path: string;
}) {
  const { data, error, isLoading } = useAuthorMetrics(repoId, filters, path || undefined);
  const { data: authorsData } = useAuthors(repoId);

  /** Resolution kind per author id, from the resolved-authors endpoint. */
  const kindById = new Map<string, AuthorKind>();
  for (const identity of authorsData?.authors ?? []) {
    kindById.set(identity.id, identity.kind);
  }

  if (error) {
    return (
      <div className="banner banner-error" role="alert">
        Failed to load author metrics: {error instanceof Error ? error.message : 'unknown error'}
      </div>
    );
  }

  const authors = data?.authors ?? [];
  const totalChurn = data?.totalChurn ?? 0;

  if (isLoading && !data) {
    return (
      <div className="table-wrap">
        <table className="table">
          <tbody>
            {Array.from({ length: 3 }, (_, index) => (
              <tr key={index}>
                <td colSpan={7}>
                  <div className="skeleton" style={{ height: 20 }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div>
      <div className="table-toolbar">
        <span className="filter-summary">
          {authors.length} author{authors.length === 1 ? '' : 's'}
          {path ? ` in ${path}` : ''} · total churn λ {formatInt(totalChurn)}
        </span>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Author</th>
              <th>Resolution</th>
              <th className="num">Commits</th>
              <th className="num">Added</th>
              <th className="num">Removed</th>
              <th className="num">Mods</th>
              <th className="num">Churn λ</th>
              <th>Ownership ω</th>
            </tr>
          </thead>
          <tbody>
            {authors.length === 0 ? (
              <tr>
                <td className="table-empty" colSpan={8}>
                  No authors committed in this set.
                </td>
              </tr>
            ) : (
              authors.map((author) => (
                <tr key={author.id}>
                  <td>
                    <div className="cell-strong">{author.name}</div>
                    <div className="muted text-xs mono">{author.email}</div>
                  </td>
                  <td>
                    <span className={kindBadgeClass(kindById.get(author.id) ?? 'mailto')}>
                      {kindById.get(author.id) ?? 'resolved'}
                    </span>
                  </td>
                  <td className="num">{formatInt(author.commitCount)}</td>
                  <td className="num pos">{formatInt(author.added)}</td>
                  <td className={`num${author.removed > 0 ? ' neg' : ''}`}>
                    {formatInt(author.removed)}
                  </td>
                  <td className="num">{formatInt(author.modifications)}</td>
                  <td className="num cell-strong">{formatInt(author.churn)}</td>
                  <td>
                    <div className="ownership">
                      <div
                        className="ownership-bar"
                        role="img"
                        aria-label={`Ownership ${formatPercent(author.ownership)}`}
                      >
                        <div
                          className="ownership-fill"
                          style={{ width: `${Math.min(100, author.ownership * 100)}%` }}
                        />
                      </div>
                      <span className="ownership-value">{formatPercent(author.ownership)}</span>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
