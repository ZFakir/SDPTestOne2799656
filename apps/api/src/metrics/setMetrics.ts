import type { ObjectMetricsDTO, RepoMetricsDTO } from '@rat/shared';
import type { DB } from '../db/database';
import { commitSetInfo, type MetricFilters } from './commitSet';
import { queryObjectSums, type ObjectSums } from './objectMetrics';
import { hasRollup, isUnfiltered, readRepoRollup } from './rollup';

/**
 * Map raw sums to the full object metric DTO:
 *   growth δ = l+ - l-, churn λ = l+ + l-,
 *   modification frequency η = n_H,o / |H|, churn rate ρ = λ / |H|.
 */
export function toObjectMetricsDTO(sums: ObjectSums, commitCount: number): ObjectMetricsDTO {
  const growth = sums.added - sums.removed;
  const churn = sums.added + sums.removed;
  return {
    added: sums.added,
    removed: sums.removed,
    growth,
    churn,
    modifications: sums.modifications,
    modificationFrequency: commitCount > 0 ? sums.modifications / commitCount : 0,
    churnRate: commitCount > 0 ? churn / commitCount : 0,
  };
}

/**
 * Repository-wide metrics over the commit set (scope = root, all paths).
 * Whole-history requests are served from the materialized rollup when it
 * exists; filtered requests scan the fact table.
 */
export function queryRepoMetrics(db: DB, repoId: string, filters: MetricFilters): RepoMetricsDTO {
  if (isUnfiltered(filters) && hasRollup(db, repoId)) {
    const rollup = readRepoRollup(db, repoId);
    if (rollup) {
      return {
        ...toObjectMetricsDTO(
          { added: rollup.added, removed: rollup.removed, modifications: rollup.modifications },
          rollup.commit_count,
        ),
        commitCount: rollup.commit_count,
        firstTs: rollup.first_ts,
        lastTs: rollup.last_ts,
      };
    }
  }

  const info = commitSetInfo(db, repoId, filters);
  const sums = queryObjectSums(db, repoId, filters, { kind: 'all' });
  return {
    ...toObjectMetricsDTO(sums, info.commitCount),
    commitCount: info.commitCount,
    firstTs: info.firstTs,
    lastTs: info.lastTs,
  };
}
