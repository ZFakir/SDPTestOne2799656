'use client';

import { useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import type { TimeseriesPointDTO } from '@rat/shared';
import type { CommitFilters } from '@/lib/api';
import { formatInt } from '@/lib/format';
import { useTimeseries } from '@/lib/hooks';

const COLOR_ADDED = '#3FB950';
const COLOR_REMOVED = '#F85149';
const COLOR_COMMITS = '#A2DAFF';
const AXIS_TICK = { fill: '#6B756D', fontSize: 11 };
const GRID_STROKE = '#2A2E33';

interface ChartPoint extends TimeseriesPointDTO {
  /** Negated removals so added/removed mirror around zero. */
  removedNeg: number;
}

function ChurnTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as ChartPoint | undefined;
  if (!point) return null;
  return (
    <div className="chart-tooltip">
      <div className="cell-strong">{point.bucket}</div>
      <div>
        added <span className="pos">{formatInt(point.added)}</span> · removed{' '}
        <span className="neg">{formatInt(point.removed)}</span>
      </div>
      <div>
        growth {formatInt(point.growth)} · churn {formatInt(point.churn)}
      </div>
      <div>
        commits <span className="mono">{formatInt(point.commits)}</span>
      </div>
    </div>
  );
}

/** Added/removed churn over time plus the commit-count line, day or week buckets. */
export function ChurnOverTimeChart({
  repoId,
  filters,
  path,
}: {
  repoId: string;
  filters: CommitFilters;
  path: string;
}) {
  const [bucket, setBucket] = useState<'day' | 'week'>('day');
  const { data, error, isLoading } = useTimeseries(repoId, filters, {
    bucket,
    path: path || undefined,
  });

  const points: ChartPoint[] = (data?.points ?? []).map((point) => ({
    ...point,
    removedNeg: -point.removed,
  }));

  return (
    <div className="chart-card">
      <div className="table-toolbar" style={{ marginBottom: 'var(--space-sm)' }}>
        <span className="chart-title">Churn over time{path ? ` — ${path}` : ''}</span>
        <div className="segmented" role="group" aria-label="Bucket size">
          <button
            type="button"
            aria-pressed={bucket === 'day'}
            onClick={() => setBucket('day')}
          >
            Day
          </button>
          <button
            type="button"
            aria-pressed={bucket === 'week'}
            onClick={() => setBucket('week')}
          >
            Week
          </button>
        </div>
      </div>

      {error ? (
        <div className="banner banner-error" role="alert">
          Failed to load timeseries: {error instanceof Error ? error.message : 'unknown error'}
        </div>
      ) : isLoading && !data ? (
        <div className="skeleton" style={{ height: 280 }} />
      ) : points.length === 0 ? (
        <div className="chart-empty">No commits in this range.</div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="bucket" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} />
            <YAxis yAxisId="lines" tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} />
            <YAxis
              yAxisId="commits"
              orientation="right"
              allowDecimals={false}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={32}
            />
            <Tooltip
              content={<ChurnTooltip />}
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              wrapperStyle={{ outline: 'none' }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="lines" dataKey="added" name="Added l+" fill={COLOR_ADDED} />
            <Bar yAxisId="lines" dataKey="removedNeg" name="Removed l−" fill={COLOR_REMOVED} />
            <Line
              yAxisId="commits"
              type="monotone"
              dataKey="commits"
              name="Commits"
              stroke={COLOR_COMMITS}
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
