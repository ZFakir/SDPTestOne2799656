import type { TimeseriesPointDTO } from '@rat/shared';
import type { DB } from '../db/database';
import type { MetricFilters } from './commitSet';
import type { FileMetricAggRow, TimeseriesBucket } from './objectMetrics';

/**
 * Materialized rollups (the pre-computation tier for large histories).
 *
 * `rollup_repo`, `rollup_file` and `rollup_day` are built in one transaction
 * when a repository becomes ready — and lazily on first read for databases
 * that were seeded before the tables existed. They answer the common
 * dashboard reads (whole-history repository metrics, the unfiltered file
 * table, the day/week timeseries) without scanning the fact table.
 *
 * Correctness contract: a rollup row must always equal the live computation
 * for the same query. The SQL below mirrors `queryObjectSums`,
 * `queryFileAggregates` and `queryTimeseries` (whole-repo, root scope,
 * no filters) exactly; the test suite asserts both paths produce identical
 * DTOs.
 */

export interface RepoRollupRow {
  commit_count: number;
  first_ts: number | null;
  last_ts: number | null;
  added: number;
  removed: number;
  modifications: number;
}

/** True when a filter combination can be served from the rollups. */
export function isUnfiltered(filters: MetricFilters): boolean {
  return (
    filters.fromTs === undefined &&
    filters.toTs === undefined &&
    (filters.commitIds === undefined || filters.commitIds.length === 0) &&
    filters.authorId === undefined
  );
}

export function hasRollup(db: DB, repoId: string): boolean {
  return db.prepare('SELECT 1 FROM rollup_repo WHERE repo_id = ?').get(repoId) !== undefined;
}

/**
 * Materialize (idempotently) all three rollup tables for a repository.
 * Returns false when the repository row does not exist (nothing to build).
 */
export function ensureRollup(db: DB, repoId: string): boolean {
  const exists = db.prepare('SELECT 1 FROM repositories WHERE id = ?').get(repoId);
  if (!exists) return false;
  if (hasRollup(db, repoId)) return true;

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO rollup_repo (repo_id, commit_count, first_ts, last_ts, added, removed, modifications)
       SELECT ?,
              (SELECT COUNT(*) FROM commits WHERE repo_id = ?),
              (SELECT MIN(ts) FROM commits WHERE repo_id = ?),
              (SELECT MAX(ts) FROM commits WHERE repo_id = ?),
              (SELECT COALESCE(SUM(added), 0) FROM commit_file_stats WHERE repo_id = ?),
              (SELECT COALESCE(SUM(removed), 0) FROM commit_file_stats WHERE repo_id = ?),
              (SELECT COUNT(DISTINCT CASE WHEN added + removed > 0 THEN commit_id END)
                 FROM commit_file_stats WHERE repo_id = ?)`,
    ).run(repoId, repoId, repoId, repoId, repoId, repoId, repoId);

    db.prepare(
      `INSERT INTO rollup_file (repo_id, path, added, removed, modifications)
       SELECT repo_id, path, SUM(added), SUM(removed),
              COUNT(DISTINCT CASE WHEN added + removed > 0 THEN commit_id END)
         FROM commit_file_stats
        WHERE repo_id = ?
        GROUP BY path`,
    ).run(repoId);

    db.prepare(
      `INSERT INTO rollup_day (repo_id, day, commits, added, removed)
       SELECT c.repo_id,
              strftime('%Y-%m-%d', c.ts, 'unixepoch') AS day,
              COUNT(DISTINCT c.id) AS commits,
              COALESCE(SUM(s.added), 0) AS added,
              COALESCE(SUM(s.removed), 0) AS removed
         FROM commits c
         LEFT JOIN commit_file_stats s ON s.commit_id = c.id
        WHERE c.repo_id = ?
        GROUP BY day`,
    ).run(repoId);
  });
  tx();
  return true;
}

export function readRepoRollup(db: DB, repoId: string): RepoRollupRow | undefined {
  return db.prepare('SELECT * FROM rollup_repo WHERE repo_id = ?').get(repoId) as
    | RepoRollupRow
    | undefined;
}

/**
 * Per-file aggregates from the rollup (equivalent to `queryFileAggregates`
 * with no commit-set filters), optionally restricted to a literal path
 * prefix. Returns undefined when no rollup exists.
 */
export function readFileRollup(
  db: DB,
  repoId: string,
  pathPrefix?: string,
): FileMetricAggRow[] | undefined {
  if (!hasRollup(db, repoId)) return undefined;
  const prefixClause =
    pathPrefix !== undefined && pathPrefix !== '' ? 'AND substr(path, 1, ?) = ?' : '';
  const params: Array<string | number> =
    prefixClause !== '' ? [repoId, pathPrefix!.length, pathPrefix!] : [repoId];
  return db
    .prepare(
      `SELECT path, added, removed, modifications
         FROM rollup_file
        WHERE repo_id = ? ${prefixClause}
        ORDER BY path`,
    )
    .all(...params) as FileMetricAggRow[];
}

interface RollupSeriesRow {
  bucket: string;
  commits: number;
  added: number;
  removed: number;
}

/**
 * Day/week timeseries from the rollup (equivalent to `queryTimeseries` with
 * no filters and whole-repository scope). Returns undefined when no rollup
 * exists.
 */
export function readTimeseriesRollup(
  db: DB,
  repoId: string,
  bucket: TimeseriesBucket,
): TimeseriesPointDTO[] | undefined {
  if (!hasRollup(db, repoId)) return undefined;

  const rows =
    bucket === 'day'
      ? (db
          .prepare(
            'SELECT day AS bucket, commits, added, removed FROM rollup_day WHERE repo_id = ? ORDER BY bucket',
          )
          .all(repoId) as RollupSeriesRow[])
      : (db
          .prepare(
            `SELECT strftime('%Y-W%W', day) AS bucket,
                    SUM(commits) AS commits,
                    SUM(added) AS added,
                    SUM(removed) AS removed
               FROM rollup_day
              WHERE repo_id = ?
              GROUP BY bucket
              ORDER BY bucket`,
          )
          .all(repoId) as RollupSeriesRow[]);

  return rows.map((row) => ({
    bucket: row.bucket,
    added: row.added,
    removed: row.removed,
    growth: row.added - row.removed,
    churn: row.added + row.removed,
    commits: row.commits,
  }));
}
