'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import type { CompareRepoDTO } from '@rat/shared';
import { formatInt } from '@/lib/format';

const COLOR_ADDED = '#3FB950';
const COLOR_REMOVED = '#F85149';
const COLOR_CHURN = '#A2DAFF';
const AXIS_TICK = { fill: '#6B756D', fontSize: 11 };
const GRID_STROKE = '#2A2E33';

interface ComparePoint {
  name: string;
  added: number;
  removed: number;
  churn: number;
  commitCount: number;
}

function CompareTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload as ComparePoint | undefined;
  if (!point) return null;
  return (
    <div className="chart-tooltip">
      <div className="cell-strong">{point.name}</div>
      <div>
        added <span className="pos">{formatInt(point.added)}</span> · removed{' '}
        <span className="neg">{formatInt(point.removed)}</span>
      </div>
      <div>
        churn <span className="mono">{formatInt(point.churn)}</span> · commits{' '}
        <span className="mono">{formatInt(point.commitCount)}</span>
      </div>
    </div>
  );
}

/** Added/removed/churn grouped bars, one group per compared repository. */
export function CompareMetricsChart({ repos }: { repos: CompareRepoDTO[] }) {
  const points: ComparePoint[] = repos.map((repo) => ({
    name: repo.name,
    added: repo.metrics.added,
    removed: repo.metrics.removed,
    churn: repo.metrics.churn,
    commitCount: repo.metrics.commitCount,
  }));

  return (
    <div className="chart-card">
      <span className="chart-title">Added l+ / removed l− / churn λ per repository</span>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="name"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: GRID_STROKE }}
          />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} />
          <Tooltip
            content={<CompareTooltip />}
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            wrapperStyle={{ outline: 'none' }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="added" name="Added l+" fill={COLOR_ADDED} />
          <Bar dataKey="removed" name="Removed l−" fill={COLOR_REMOVED} />
          <Bar dataKey="churn" name="Churn λ" fill={COLOR_CHURN} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
