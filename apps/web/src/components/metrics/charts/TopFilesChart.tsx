'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import type { FileMetricRowDTO } from '@rat/shared';
import type { CommitFilters } from '@/lib/api';
import { formatInt } from '@/lib/format';
import { useFileMetrics } from '@/lib/hooks';

const COLOR_BAR = '#A2DAFF';
const AXIS_TICK = { fill: '#6B756D', fontSize: 11 };
const GRID_STROKE = '#2A2E33';

interface BarRow extends FileMetricRowDTO {
  /** Basename shown on the category axis. */
  label: string;
}

function TopFilesTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload as BarRow | undefined;
  if (!row) return null;
  return (
    <div className="chart-tooltip">
      <div className="cell-strong mono">{row.path}</div>
      <div>
        churn λ <span className="mono">{formatInt(row.churn)}</span> · added{' '}
        <span className="pos">{formatInt(row.added)}</span> · removed{' '}
        <span className="neg">{formatInt(row.removed)}</span>
      </div>
    </div>
  );
}

/**
 * Top files by churn for the active commit set (click a bar to set the global
 * path scope to that file).
 */
export function TopFilesChart({
  repoId,
  filters,
  pathPrefix,
  onSelectPath,
}: {
  repoId: string;
  filters: CommitFilters;
  pathPrefix?: string;
  onSelectPath: (path: string) => void;
}) {
  const { data, error, isLoading } = useFileMetrics(repoId, filters, {
    pathPrefix: pathPrefix || undefined,
    sort: 'churn',
    order: 'desc',
    page: 1,
    pageSize: 10,
  });

  const rows: BarRow[] = (data?.items ?? []).map((row) => ({
    ...row,
    label: row.path.split('/').pop() ?? row.path,
  }));

  return (
    <div className="chart-card">
      <div className="table-toolbar" style={{ marginBottom: 'var(--space-sm)' }}>
        <span className="chart-title">Top files by churn</span>
        <span className="filter-summary">click a bar to scope the dashboard</span>
      </div>

      {error ? (
        <div className="banner banner-error" role="alert">
          Failed to load top files: {error instanceof Error ? error.message : 'unknown error'}
        </div>
      ) : isLoading && !data ? (
        <div className="skeleton" style={{ height: 300 }} />
      ) : rows.length === 0 ? (
        <div className="chart-empty">No files changed in this range.</div>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(220, rows.length * 30 + 40)}>
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 4, right: 24, bottom: 0, left: 8 }}
          >
            <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} />
            <YAxis
              type="category"
              dataKey="label"
              width={150}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<TopFilesTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Bar
              dataKey="churn"
              fill={COLOR_BAR}
              radius={[0, 3, 3, 0]}
              cursor="pointer"
              onClick={(entry: { payload?: FileMetricRowDTO }) => {
                const path = entry?.payload?.path;
                if (path) onSelectPath(path);
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
