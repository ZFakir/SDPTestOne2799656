'use client';

import { useState } from 'react';
import type { FileMetricRowDTO } from '@rat/shared';
import type { CommitFilters } from '@/lib/api';
import { formatDecimal, formatInt, formatPercent, formatSigned } from '@/lib/format';
import { useFileMetrics } from '@/lib/hooks';

const PAGE_SIZE = 25;

type SortKey =
  | 'path'
  | 'added'
  | 'removed'
  | 'growth'
  | 'churn'
  | 'modifications'
  | 'modificationFrequency'
  | 'churnRate';

interface Column {
  key: SortKey | null;
  label: string;
  numeric: boolean;
}

const COLUMNS: Column[] = [
  { key: 'path', label: 'Path', numeric: false },
  { key: 'added', label: 'Added', numeric: true },
  { key: 'removed', label: 'Removed', numeric: true },
  { key: 'growth', label: 'Growth', numeric: true },
  { key: 'churn', label: 'Churn', numeric: true },
  { key: 'modifications', label: 'Mods', numeric: true },
  { key: 'modificationFrequency', label: 'Freq η', numeric: true },
  { key: 'churnRate', label: 'Rate ρ', numeric: true },
];

const DEFAULTS: Record<SortKey, 'asc' | 'desc'> = {
  path: 'asc',
  added: 'desc',
  removed: 'desc',
  growth: 'desc',
  churn: 'desc',
  modifications: 'desc',
  modificationFrequency: 'desc',
  churnRate: 'desc',
};

function SortIndicator({ active, order }: { active: boolean; order: 'asc' | 'desc' }) {
  if (!active) return <span aria-hidden="true"> ↕</span>;
  return <span aria-hidden="true"> {order === 'asc' ? '↑' : '↓'}</span>;
}

/** Per-file metric table for the active commit set and path prefix. */
export function FileMetricsTable({
  repoId,
  filters,
  pathPrefix,
}: {
  repoId: string;
  filters: CommitFilters;
  pathPrefix: string;
}) {
  const [sort, setSort] = useState<SortKey>('churn');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const { data, error, isLoading } = useFileMetrics(repoId, filters, {
    pathPrefix: pathPrefix || undefined,
    sort,
    order,
    page,
    pageSize: PAGE_SIZE,
  });

  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);

  function handleSort(key: SortKey) {
    if (key === sort) {
      setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(key);
      setOrder(DEFAULTS[key]);
    }
    setPage(1);
  }

  if (error) {
    return (
      <div className="banner banner-error" role="alert">
        Failed to load file metrics: {error instanceof Error ? error.message : 'unknown error'}
      </div>
    );
  }

  return (
    <div>
      <div className="table-toolbar">
        <span className="filter-summary">
          {total.toLocaleString('en-US')} file{total === 1 ? '' : 's'}
          {pathPrefix ? ` under ${pathPrefix}` : ''}
        </span>
        <span className="filter-summary">
          Sorted by {COLUMNS.find((column) => column.key === sort)?.label} ({order})
        </span>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th key={column.key} className={column.numeric ? 'num' : undefined}>
                  {column.key ? (
                    <button
                      type="button"
                      onClick={() => handleSort(column.key as SortKey)}
                      aria-label={`Sort by ${column.label}`}
                    >
                      {column.label}
                      <SortIndicator active={sort === column.key} order={order} />
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && !data ? (
              Array.from({ length: 5 }, (_, index) => (
                <tr key={index}>
                  <td colSpan={COLUMNS.length}>
                    <div className="skeleton" style={{ height: 20 }} />
                  </td>
                </tr>
              ))
            ) : total === 0 ? (
              <tr>
                <td className="table-empty" colSpan={COLUMNS.length}>
                  No files changed in this commit set.
                </td>
              </tr>
            ) : (
              (data?.items ?? []).map((row: FileMetricRowDTO) => (
                <tr key={row.path}>
                  <td className="cell-path">{row.path}</td>
                  <td className="num pos">{formatInt(row.added)}</td>
                  <td className={`num${row.removed > 0 ? ' neg' : ''}`}>{formatInt(row.removed)}</td>
                  <td className={`num${row.growth > 0 ? ' pos' : row.growth < 0 ? ' neg' : ''}`}>
                    {formatSigned(row.growth)}
                  </td>
                  <td className="num cell-strong">{formatInt(row.churn)}</td>
                  <td className="num">{formatInt(row.modifications)}</td>
                  <td className="num">{formatPercent(row.modificationFrequency)}</td>
                  <td className="num">{formatDecimal(row.churnRate, 2)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 ? (
        <div className="pager" style={{ marginTop: 'var(--space-sm)' }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={safePage <= 1}
            onClick={() => setPage(safePage - 1)}
          >
            ← Prev
          </button>
          <span>
            Page {safePage} of {pageCount}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={safePage >= pageCount}
            onClick={() => setPage(safePage + 1)}
          >
            Next →
          </button>
        </div>
      ) : null}
    </div>
  );
}
