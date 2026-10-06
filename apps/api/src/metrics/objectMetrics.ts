import type { TimeseriesPointDTO } from '@rat/shared';
import type { DB } from '../db/database';
import { notFound } from '../util/errors';
import {
  COMMIT_SOURCE_SQL,
  buildFiltersSql,
  type MetricFilters,
  type SqlFragment,
} from './commitSet';

/** Path scope of an object metric (the brief's object `o`). */
export type PathScope =
  | { kind: 'all' }
  | { kind: 'file'; path: string }
  | { kind: 'dir'; path: string };

/**
 * SQL condition on the fact-table alias `s` selecting the scope's paths.
 *
 * Directory scope uses the index-friendly subtree range from the plan:
 *   path = d OR (path > d||'/' AND path < d||'0')
 * The repository root ("") covers everything.
 */
export function pathScopeSql(scope: PathScope): SqlFragment {
  switch (scope.kind) {
    case 'all':
      return { sql: '1 = 1', params: [] };
    case 'file':
      return { sql: 's.path = ?', params: [scope.path] };
    case 'dir': {
      if (scope.path === '') return { sql: '1 = 1', params: [] };
      const d = scope.path;
      return { sql: '(s.path = ? OR (s.path > ? AND s.path < ?))', params: [d, `${d}/`, `${d}0`] };
    }
  }
}

/** Fact-table FROM clause including author-resolution joins. */
const FACTS_SOURCE_SQL = `
  FROM commit_file_stats s
  JOIN commits c ON c.id = s.commit_id
  JOIN raw_idents ri ON ri.id = c.raw_ident_id
  LEFT JOIN author_merges am ON am.repo_id = c.repo_id AND am.ident_id = c.raw_ident_id
  LEFT JOIN canonical_authors ca ON ca.id = am.canonical_author_id
  LEFT JOIN mailmap_map mm ON mm.repo_id = c.repo_id AND mm.ident_id = c.raw_ident_id`;

/**
 * Resolve a `path` query parameter into a metric scope:
 * `undefined`/`""` = whole repository (root subtree), a known directory =
 * subtree, a known file path = exact file.
 */
export function resolvePathScope(
  db: DB,
  repoId: string,
  rawPath: string | undefined,
): PathScope {
  if (rawPath === undefined || rawPath === '') return { kind: 'dir', path: '' };
  const path = rawPath.replace(/\/+$/, '');
  const isDir = db
    .prepare('SELECT 1 FROM repo_dirs WHERE repo_id = ? AND path = ?')
    .get(repoId, path);
  if (isDir) return { kind: 'dir', path };
  const isFile = db
    .prepare('SELECT 1 FROM commit_file_stats WHERE repo_id = ? AND path = ? LIMIT 1')
    .get(repoId, path);
  if (isFile) return { kind: 'file', path };
  throw notFound(`Path "${rawPath}" does not exist in this repository.`, 'PATH_NOT_FOUND');
}

export interface ObjectSums {
  /** l+ over the set. */
  added: number;
  /** l- over the set. */
  removed: number;
  /** n_H,o — commits that changed at least one line in the object. */
  modifications: number;
}

/** Aggregate `l+`, `l-` and `n_H,o` for one object over the commit set. */
export function queryObjectSums(
  db: DB,
  repoId: string,
  filters: MetricFilters,
  scope: PathScope,
): ObjectSums {
  const where = buildFiltersSql(repoId, filters);
  const paths = pathScopeSql(scope);
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(s.added), 0) AS added,
              COALESCE(SUM(s.removed), 0) AS removed,
              COUNT(DISTINCT CASE WHEN s.added + s.removed > 0 THEN s.commit_id END) AS modifications
       ${FACTS_SOURCE_SQL}
       WHERE ${where.sql} AND (${paths.sql})`,
    )
    .get(...where.params, ...paths.params) as ObjectSums;
  return row;
}

export interface FileMetricAggRow {
  path: string;
  added: number;
  removed: number;
  modifications: number;
}

/**
 * Per-file aggregates over the commit set, optionally restricted to a literal
 * path prefix. Used by the files endpoint and the directory roll-up.
 */
export function queryFileAggregates(
  db: DB,
  repoId: string,
  filters: MetricFilters,
  pathPrefix?: string,
): FileMetricAggRow[] {
  const where = buildFiltersSql(repoId, filters);
  const prefixClause =
    pathPrefix !== undefined && pathPrefix !== ''
      ? 'AND substr(s.path, 1, ?) = ?'
      : '';
  const prefixParams: Array<string | number> =
    prefixClause !== '' ? [pathPrefix!.length, pathPrefix!] : [];
  return db
    .prepare(
      `SELECT s.path AS path,
              COALESCE(SUM(s.added), 0) AS added,
              COALESCE(SUM(s.removed), 0) AS removed,
              COUNT(DISTINCT CASE WHEN s.added + s.removed > 0 THEN s.commit_id END) AS modifications
       ${FACTS_SOURCE_SQL}
       WHERE ${where.sql} ${prefixClause}
       GROUP BY s.path
       ORDER BY s.path`,
    )
    .all(...where.params, ...prefixParams) as FileMetricAggRow[];
}

export type TimeseriesBucket = 'day' | 'week';

function bucketExpr(bucket: TimeseriesBucket): string {
  return bucket === 'day'
    ? `strftime('%Y-%m-%d', c.ts, 'unixepoch')`
    : `strftime('%Y-W%W', c.ts, 'unixepoch')`;
}

/**
 * Line churn bucketed by day (`YYYY-MM-DD`) or week (`YYYY-Www`, Monday-based)
 * in UTC, over the commit set and path scope. Buckets are dense in the sense
 * that every bucket that contains commits appears — including commits with no
 * file changes (they feed the `commits` count).
 */
export function queryTimeseries(
  db: DB,
  repoId: string,
  filters: MetricFilters,
  scope: PathScope,
  bucket: TimeseriesBucket,
): TimeseriesPointDTO[] {
  const where = buildFiltersSql(repoId, filters);
  const paths = pathScopeSql(scope);
  const fmt = bucketExpr(bucket);

  const commitRows = db
    .prepare(
      `SELECT ${fmt} AS bucket, COUNT(*) AS commits
       ${COMMIT_SOURCE_SQL}
       WHERE ${where.sql}
       GROUP BY bucket
       ORDER BY bucket`,
    )
    .all(...where.params) as Array<{ bucket: string; commits: number }>;

  const statRows = db
    .prepare(
      `SELECT ${fmt} AS bucket,
              COALESCE(SUM(s.added), 0) AS added,
              COALESCE(SUM(s.removed), 0) AS removed
       ${FACTS_SOURCE_SQL}
       WHERE ${where.sql} AND (${paths.sql})
       GROUP BY bucket
       ORDER BY bucket`,
    )
    .all(...where.params, ...paths.params) as Array<{
    bucket: string;
    added: number;
    removed: number;
  }>;

  const byBucket = new Map<string, TimeseriesPointDTO>();
  for (const row of commitRows) {
    byBucket.set(row.bucket, {
      bucket: row.bucket,
      added: 0,
      removed: 0,
      growth: 0,
      churn: 0,
      commits: row.commits,
    });
  }
  for (const row of statRows) {
    const point = byBucket.get(row.bucket) ?? {
      bucket: row.bucket,
      added: 0,
      removed: 0,
      growth: 0,
      churn: 0,
      commits: 0,
    };
    point.added = row.added;
    point.removed = row.removed;
    point.growth = row.added - row.removed;
    point.churn = row.added + row.removed;
    byBucket.set(row.bucket, point);
  }

  return Array.from(byBucket.values()).sort((a, b) => (a.bucket < b.bucket ? -1 : 1));
}
