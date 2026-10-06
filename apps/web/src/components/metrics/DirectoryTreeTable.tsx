'use client';

import { useState } from 'react';
import type { CommitFilters } from '@/lib/api';
import { formatDecimal, formatInt, formatPercent, formatSigned } from '@/lib/format';
import { useDirectoryMetrics } from '@/lib/hooks';

/** Split a directory path into breadcrumb segments with accumulated prefixes. */
function crumbs(path: string): Array<{ label: string; path: string }> {
  const result: Array<{ label: string; path: string }> = [];
  const parts = path.split('/').filter(Boolean);
  let acc = '';
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    result.push({ label: part, path: acc });
  }
  return result;
}

/**
 * Directory drill-down: breadcrumb navigation, a subtree summary row for the
 * current directory and its descendant directories (1–5 levels deep).
 */
export function DirectoryTreeTable({
  repoId,
  filters,
}: {
  repoId: string;
  filters: CommitFilters;
}) {
  const [currentPath, setCurrentPath] = useState('');
  const [depth, setDepth] = useState(1);

  const { data, error, isLoading } = useDirectoryMetrics(repoId, filters, {
    path: currentPath || undefined,
    depth,
  });

  if (error) {
    return (
      <div className="banner banner-error" role="alert">
        Failed to load directory metrics: {error instanceof Error ? error.message : 'unknown error'}
      </div>
    );
  }

  const self = data?.self;
  const children = data?.children ?? [];
  const trail = crumbs(currentPath);

  return (
    <div>
      <div className="table-toolbar">
        <nav className="breadcrumb" aria-label="Directory path">
          <button type="button" onClick={() => setCurrentPath('')}>
            Repository
          </button>
          {trail.map((crumb) => (
            <span key={crumb.path} className="row" style={{ gap: 'var(--space-xxs)' }}>
              <span className="crumb-sep" aria-hidden="true">
                /
              </span>
              <button type="button" onClick={() => setCurrentPath(crumb.path)}>
                {crumb.label}
              </button>
            </span>
          ))}
        </nav>
        <div className="row">
          <label className="filter-summary" htmlFor="dir-depth">
            Depth
          </label>
          <select
            id="dir-depth"
            className="select"
            style={{ width: 96, height: 36 }}
            value={depth}
            onChange={(event) => setDepth(Number(event.target.value))}
          >
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Directory</th>
              <th className="num">Added</th>
              <th className="num">Removed</th>
              <th className="num">Growth</th>
              <th className="num">Churn</th>
              <th className="num">Mods</th>
              <th className="num">Freq η</th>
              <th className="num">Rate ρ</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && !data ? (
              <tr>
                <td colSpan={8}>
                  <div className="skeleton" style={{ height: 20 }} />
                </td>
              </tr>
            ) : (
              <>
                {self ? (
                  <tr>
                    <td className="cell-path">
                      <strong className="cell-strong">
                        {currentPath ? `${currentPath}/` : 'Repository'} (this directory)
                      </strong>
                    </td>
                    <td className="num pos">{formatInt(self.added)}</td>
                    <td className={`num${self.removed > 0 ? ' neg' : ''}`}>
                      {formatInt(self.removed)}
                    </td>
                    <td className={`num${self.growth > 0 ? ' pos' : self.growth < 0 ? ' neg' : ''}`}>
                      {formatSigned(self.growth)}
                    </td>
                    <td className="num cell-strong">{formatInt(self.churn)}</td>
                    <td className="num">{formatInt(self.modifications)}</td>
                    <td className="num">{formatPercent(self.modificationFrequency)}</td>
                    <td className="num">{formatDecimal(self.churnRate, 2)}</td>
                  </tr>
                ) : null}
                {children.length === 0 ? (
                  <tr>
                    <td className="table-empty" colSpan={8}>
                      No descendant directories with changes in this commit set.
                    </td>
                  </tr>
                ) : (
                  children.map((child) => (
                    <tr key={child.path}>
                      <td className="cell-path">
                        <button
                          type="button"
                          className="path-link"
                          onClick={() => setCurrentPath(child.path)}
                          title={`Open ${child.path}/`}
                        >
                          {child.path}/
                        </button>
                        {child.depth > 1 ? (
                          <span className="muted text-xs"> (+{child.depth - 1} level)</span>
                        ) : null}
                      </td>
                      <td className="num pos">{formatInt(child.added)}</td>
                      <td className={`num${child.removed > 0 ? ' neg' : ''}`}>
                        {formatInt(child.removed)}
                      </td>
                      <td
                        className={`num${child.growth > 0 ? ' pos' : child.growth < 0 ? ' neg' : ''}`}
                      >
                        {formatSigned(child.growth)}
                      </td>
                      <td className="num cell-strong">{formatInt(child.churn)}</td>
                      <td className="num">{formatInt(child.modifications)}</td>
                      <td className="num">{formatPercent(child.modificationFrequency)}</td>
                      <td className="num">{formatDecimal(child.churnRate, 2)}</td>
                    </tr>
                  ))
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
