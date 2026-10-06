import type { ObjectMetricsDTO, RepoMetricsDTO } from '@rat/shared';
import type { DB } from '../db/database';
import { commitSetInfo, type MetricFilters } from './commitSet';
import { queryObjectSums, type ObjectSums } from './objectMetrics';

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

/** Repository-wide metrics over the commit set (scope = root, all paths). */
export function queryRepoMetrics(db: DB, repoId: string, filters: MetricFilters): RepoMetricsDTO {
  const info = commitSetInfo(db, repoId, filters);
  const sums = queryObjectSums(db, repoId, filters, { kind: 'all' });
  return {
    ...toObjectMetricsDTO(sums, info.commitCount),
    commitCount: info.commitCount,
    firstTs: info.firstTs,
    lastTs: info.lastTs,
  };
}
