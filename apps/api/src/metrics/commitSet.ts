import type { DB } from '../db/database';
import { optionalInt, optionalString } from '../middleware/validate';
import { badRequest } from '../util/errors';

/**
 * Filters selecting the commit set H of the brief:
 *   - a timestamp range: [fromTs, toTs)  (fromTs inclusive, toTs exclusive),
 *   - an explicit list of commit SHAs (manual selection),
 *   - and/or a resolved author id.
 */
export interface MetricFilters {
  fromTs?: number;
  toTs?: number;
  commitIds?: string[];
  authorId?: string;
}

export interface SqlFragment {
  sql: string;
  params: Array<string | number>;
}

const MAX_COMMIT_IDS = 5000;
const SHA_RE = /^[0-9a-fA-F]{4,64}$/;

/**
 * FROM-clause shared by every commit-scoped query: raw ident plus both
 * author-resolution layers, so the resolved author is available everywhere.
 * Resolution precedence: manual merge (canonical) > mailmap > raw ident.
 */
export const COMMIT_SOURCE_SQL = `
  FROM commits c
  JOIN raw_idents ri ON ri.id = c.raw_ident_id
  LEFT JOIN author_merges am ON am.repo_id = c.repo_id AND am.ident_id = c.raw_ident_id
  LEFT JOIN canonical_authors ca ON ca.id = am.canonical_author_id
  LEFT JOIN mailmap_map mm ON mm.repo_id = c.repo_id AND mm.ident_id = c.raw_ident_id`;

/** Stable resolved-author key used by `authorId` filters and the authors API. */
export const AUTHOR_KEY_SQL =
  `CASE WHEN ca.id IS NOT NULL THEN 'canonical:' || ca.id ` +
  `ELSE 'mailto:' || LOWER(COALESCE(mm.resolved_email, ri.email)) END`;

/** Display name of the resolved author. */
export const AUTHOR_NAME_SQL = `COALESCE(ca.display_name, mm.resolved_name, ri.name)`;

/** Display email of the resolved author. */
export const AUTHOR_EMAIL_SQL = `COALESCE(ca.display_email, mm.resolved_email, ri.email)`;

/** Which resolution layer the author came from. */
export const AUTHOR_KIND_SQL =
  `CASE WHEN ca.id IS NOT NULL THEN 'canonical' ` +
  `WHEN mm.ident_id IS NOT NULL THEN 'mailmap' ELSE 'raw' END`;

/**
 * Parse the common metric filters from a request query.
 * `commitIds` is mutually exclusive with `fromTs`/`toTs`.
 */
export function parseMetricFilters(query: Record<string, unknown>): MetricFilters {
  const fromTs = optionalInt(query.fromTs, 'fromTs');
  const toTs = optionalInt(query.toTs, 'toTs');
  const authorId = optionalString(query.authorId);
  const rawIds = optionalString(query.commitIds);

  let commitIds: string[] | undefined;
  if (rawIds !== undefined) {
    const parts = rawIds
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);
    const unique = Array.from(new Set(parts));
    if (unique.length === 0) {
      throw badRequest('Query parameter "commitIds" must contain at least one commit SHA.');
    }
    if (unique.length > MAX_COMMIT_IDS) {
      throw badRequest(`At most ${MAX_COMMIT_IDS} commit ids may be selected at once.`);
    }
    for (const sha of unique) {
      if (!SHA_RE.test(sha)) throw badRequest(`"${sha}" is not a valid commit SHA.`);
    }
    commitIds = unique;
  }

  if (commitIds && (fromTs !== undefined || toTs !== undefined)) {
    throw badRequest('"commitIds" cannot be combined with "fromTs"/"toTs".');
  }
  if (fromTs !== undefined && toTs !== undefined && fromTs > toTs) {
    throw badRequest('"fromTs" must be less than or equal to "toTs".');
  }
  if (
    authorId !== undefined &&
    !authorId.startsWith('mailto:') &&
    !authorId.startsWith('canonical:')
  ) {
    throw badRequest('Query parameter "authorId" must be an id returned by the authors endpoint.');
  }

  return { fromTs, toTs, commitIds, authorId };
}

/**
 * SQL condition (on the `commits` alias `c`) selecting the commit set H for a
 * repository. Always includes `c.repo_id = ?` as the first clause.
 */
export function buildFiltersSql(repoId: string, filters: MetricFilters): SqlFragment {
  const clauses = ['c.repo_id = ?'];
  const params: Array<string | number> = [repoId];

  if (filters.fromTs !== undefined) {
    clauses.push('c.ts >= ?');
    params.push(filters.fromTs);
  }
  if (filters.toTs !== undefined) {
    clauses.push('c.ts < ?');
    params.push(filters.toTs);
  }
  if (filters.commitIds && filters.commitIds.length > 0) {
    clauses.push(`c.sha IN (${filters.commitIds.map(() => '?').join(', ')})`);
    params.push(...filters.commitIds);
  }
  if (filters.authorId !== undefined) {
    clauses.push(`${AUTHOR_KEY_SQL} = ?`);
    params.push(filters.authorId);
  }

  return { sql: clauses.join(' AND '), params };
}

export interface CommitSetInfo {
  /** |H| — size of the filtered commit set (includes empty commits). */
  commitCount: number;
  firstTs: number | null;
  lastTs: number | null;
}

/** |H| and the time span of the commit set (matching commits only). */
export function commitSetInfo(db: DB, repoId: string, filters: MetricFilters): CommitSetInfo {
  const where = buildFiltersSql(repoId, filters);
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n, MIN(c.ts) AS first_ts, MAX(c.ts) AS last_ts ${COMMIT_SOURCE_SQL}
        WHERE ${where.sql}`,
    )
    .get(...where.params) as { n: number; first_ts: number | null; last_ts: number | null };
  return { commitCount: row.n, firstTs: row.first_ts, lastTs: row.last_ts };
}
