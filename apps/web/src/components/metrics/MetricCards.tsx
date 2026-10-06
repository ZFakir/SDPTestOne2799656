'use client';

import type { RepoMetricsDTO } from '@rat/shared';
import { formatDate, formatDecimal, formatInt, formatPercent, formatSigned } from '@/lib/format';

function StatCard({
  label,
  value,
  valueClass,
  sub,
}: {
  label: string;
  value: string;
  valueClass?: string;
  sub?: string;
}) {
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <span className={`stat-value${valueClass ? ` ${valueClass}` : ''}`}>{value}</span>
      {sub ? <span className="stat-sub">{sub}</span> : null}
    </div>
  );
}

/**
 * Repository metric tiles for the current commit set `H`:
 * |H|, l+, l−, δ, λ, n_H,o (with η) and ρ (with λ/|H|).
 */
export function MetricCards({ metrics }: { metrics: RepoMetricsDTO | undefined }) {
  if (!metrics) {
    return (
      <div className="stat-grid" aria-busy="true">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="stat-card">
            <div className="skeleton" style={{ width: 72, height: 12 }} />
            <div className="skeleton" style={{ width: 96, height: 24 }} />
          </div>
        ))}
      </div>
    );
  }

  const growthClass = metrics.growth > 0 ? 'pos' : metrics.growth < 0 ? 'neg' : undefined;

  return (
    <div className="stat-grid">
      <StatCard
        label="Commits |H|"
        value={formatInt(metrics.commitCount)}
        sub={
          metrics.firstTs !== null && metrics.lastTs !== null
            ? `${formatDate(metrics.firstTs)} → ${formatDate(metrics.lastTs)}`
            : 'no commits in set'
        }
      />
      <StatCard label="Added l+" value={formatInt(metrics.added)} valueClass="pos" sub="lines added" />
      <StatCard
        label="Removed l−"
        value={formatInt(metrics.removed)}
        valueClass={metrics.removed > 0 ? 'neg' : undefined}
        sub="lines removed"
      />
      <StatCard
        label="Growth δ"
        value={formatSigned(metrics.growth)}
        valueClass={growthClass}
        sub="l+ − l−"
      />
      <StatCard label="Churn λ" value={formatInt(metrics.churn)} sub="l+ + l−" />
      <StatCard
        label="Modifications"
        value={formatInt(metrics.modifications)}
        sub="n_H,o — changed commits"
      />
      <StatCard
        label="Churn rate ρ"
        value={formatDecimal(metrics.churnRate, 2)}
        sub="λ / |H| per commit"
      />
      <StatCard
        label="Mod. frequency η"
        value={formatPercent(metrics.modificationFrequency, 1)}
        sub="n_H,o / |H|"
      />
    </div>
  );
}
