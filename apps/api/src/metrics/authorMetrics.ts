import type { AuthorIdentityDTO, AuthorMetricRowDTO, RawIdentDTO } from '@rat/shared';
import type { DB } from '../db/database';
import {
  AUTHOR_EMAIL_SQL,
  AUTHOR_KEY_SQL,
  AUTHOR_KIND_SQL,
  AUTHOR_NAME_SQL,
  COMMIT_SOURCE_SQL,
  buildFiltersSql,
  type MetricFilters,
} from './commitSet';
import { pathScopeSql, type PathScope } from './objectMetrics';

export type AuthorKind = 'canonical' | 'mailmap' | 'raw';

interface IdentResolutionRow {
  raw_ident_id: number;
  raw_name: string;
  raw_email: string;
  author_id: string;
  resolved_name: string;
  resolved_email: string;
  kind: AuthorKind;
  commit_count: number;
}

export interface ResolvedAuthors {
  authors: AuthorIdentityDTO[];
  rawIdents: RawIdentDTO[];
  byId: Map<string, AuthorIdentityDTO>;
}

const KIND_RANK: Record<AuthorKind, number> = { canonical: 2, mailmap: 1, raw: 0 };

/**
 * Resolve every raw ident of a repository to its author (manual merge >
 * mailmap > raw) and fold idents into author identities.
 *
 * The representative display name/email of an author is taken from the ident
 * with the most commits (ties broken by raw email) — the resolved values of
 * idents that share an author key are normally identical.
 */
export function resolveAuthors(db: DB, repoId: string): ResolvedAuthors {
  const rows = db
    .prepare(
      `SELECT ri.id AS raw_ident_id, ri.name AS raw_name, ri.email AS raw_email,
              ${AUTHOR_KEY_SQL} AS author_id,
              ${AUTHOR_NAME_SQL} AS resolved_name,
              ${AUTHOR_EMAIL_SQL} AS resolved_email,
              ${AUTHOR_KIND_SQL} AS kind,
              (SELECT COUNT(*) FROM commits c WHERE c.raw_ident_id = ri.id) AS commit_count
         FROM raw_idents ri
         LEFT JOIN author_merges am ON am.repo_id = ri.repo_id AND am.ident_id = ri.id
         LEFT JOIN canonical_authors ca ON ca.id = am.canonical_author_id
         LEFT JOIN mailmap_map mm ON mm.repo_id = ri.repo_id AND mm.ident_id = ri.id
        WHERE ri.repo_id = ?
        ORDER BY ri.id`,
    )
    .all(repoId) as IdentResolutionRow[];

  interface Entry {
    dto: AuthorIdentityDTO;
    kindRank: number;
    bestCount: number;
    bestEmail: string;
  }

  const entries = new Map<string, Entry>();
  for (const row of rows) {
    let entry = entries.get(row.author_id);
    if (!entry) {
      entry = {
        dto: {
          id: row.author_id,
          name: row.resolved_name,
          email: row.resolved_email,
          kind: row.kind,
          commitCount: 0,
          rawIdentCount: 0,
        },
        kindRank: -1,
        bestCount: -1,
        bestEmail: '',
      };
      entries.set(row.author_id, entry);
    }
    entry.dto.commitCount += row.commit_count;
    entry.dto.rawIdentCount += 1;
    if (KIND_RANK[row.kind] > entry.kindRank) {
      entry.kindRank = KIND_RANK[row.kind];
      entry.dto.kind = row.kind;
    }
    if (
      row.commit_count > entry.bestCount ||
      (row.commit_count === entry.bestCount && row.raw_email < entry.bestEmail)
    ) {
      entry.bestCount = row.commit_count;
      entry.bestEmail = row.raw_email;
      entry.dto.name = row.resolved_name;
      entry.dto.email = row.resolved_email;
    }
  }

  const authors = Array.from(entries.values())
    .map((entry) => entry.dto)
    .sort(
      (a, b) =>
        b.commitCount - a.commitCount || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    );

  const rawIdents = rows
    .map(
      (row): RawIdentDTO => ({
        id: row.raw_ident_id,
        name: row.raw_name,
        email: row.raw_email,
        commitCount: row.commit_count,
      }),
    )
    .sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email));

  const byId = new Map(authors.map((author) => [author.id, author]));
  return { authors, rawIdents, byId };
}

export interface AuthorMetricsResult {
  /** Total churn over the scope — the ownership denominator. */
  totalChurn: number;
  rows: AuthorMetricRowDTO[];
}

/**
 * Per-author metrics over the commit set and path scope:
 * `n_H,o,a`, `λ_H,o,a` and ownership `ω = λ_H,o,a / λ_H,o`.
 * Commits that do not touch the path scope still count toward `commitCount`.
 */
export function queryAuthorMetrics(
  db: DB,
  repoId: string,
  filters: MetricFilters,
  scope: PathScope,
): AuthorMetricsResult {
  const where = buildFiltersSql(repoId, filters);
  const paths = pathScopeSql(scope);

  const rows = db
    .prepare(
      `SELECT ${AUTHOR_KEY_SQL} AS author_id,
              COUNT(DISTINCT c.id) AS commit_count,
              COALESCE(SUM(s.added), 0) AS added,
              COALESCE(SUM(s.removed), 0) AS removed,
              COALESCE(COUNT(DISTINCT CASE WHEN s.added + s.removed > 0 THEN s.commit_id END), 0) AS modifications
       ${COMMIT_SOURCE_SQL}
       LEFT JOIN commit_file_stats s ON s.commit_id = c.id AND (${paths.sql})
       WHERE ${where.sql}
       GROUP BY author_id`,
    )
    .all(...paths.params, ...where.params) as Array<{
    author_id: string;
    commit_count: number;
    added: number;
    removed: number;
    modifications: number;
  }>;

  let totalChurn = 0;
  const withChurn = rows.map((row) => {
    const churn = row.added + row.removed;
    totalChurn += churn;
    return { row, churn };
  });

  const result: AuthorMetricRowDTO[] = withChurn
    .map(({ row, churn }) => ({
      id: row.author_id,
      name: '',
      email: '',
      commitCount: row.commit_count,
      added: row.added,
      removed: row.removed,
      modifications: row.modifications,
      churn,
      ownership: totalChurn > 0 ? churn / totalChurn : 0,
    }))
    .sort(
      (a, b) =>
        b.churn - a.churn || b.commitCount - a.commitCount || a.id.localeCompare(b.id),
    );

  return { totalChurn, rows: result };
}

/** Decorate author metric rows with resolved display names/emails. */
export function decorateAuthorRows(
  result: AuthorMetricsResult,
  identities: ResolvedAuthors,
): AuthorMetricsResult {
  return {
    totalChurn: result.totalChurn,
    rows: result.rows.map((row) => {
      const identity = identities.byId.get(row.id);
      return { ...row, name: identity?.name ?? '', email: identity?.email ?? '' };
    }),
  };
}
