import { Router } from 'express';
import type { CommitFileStatDTO, CommitListItem, CommitStatsDTO, ListResponse } from '@rat/shared';
import {
  AUTHOR_EMAIL_SQL,
  AUTHOR_KEY_SQL,
  AUTHOR_NAME_SQL,
  COMMIT_SOURCE_SQL,
  buildFiltersSql,
  commitSetInfo,
  parseMetricFilters,
} from '../metrics/commitSet';
import { optionalString, pagingParams } from '../middleware/validate';
import { requireReadyRepository, type Services } from '../services';
import { notFound } from '../util/errors';

/** Escape LIKE wildcards (`\`, `%`, `_`) using `ESCAPE '\'`. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

interface CommitRow {
  id: number;
  sha: string;
  parent_sha: string | null;
  ts: number;
  author_id: string;
  author_name: string;
  author_email: string;
}

/** `/api/repositories/:repoId/commits` — commit list + per-commit stats. */
export function commitsRouter(services: Services): Router {
  const { db } = services;
  const router = Router();

  router.get('/:repoId/commits', (req, res) => {
    const repo = requireReadyRepository(services, req.params.repoId);
    const filters = parseMetricFilters(req.query);
    const paging = pagingParams(req.query);
    const q = optionalString(req.query.q);

    const where = buildFiltersSql(repo.id, filters);
    let searchSql = '';
    const searchParams: string[] = [];
    if (q !== undefined) {
      const needle = escapeLike(q.toLowerCase());
      searchSql =
        `AND (c.sha LIKE ? ESCAPE '\\' ` +
        `OR LOWER(${AUTHOR_NAME_SQL}) LIKE ? ESCAPE '\\' ` +
        `OR LOWER(${AUTHOR_EMAIL_SQL}) LIKE ? ESCAPE '\\')`;
      searchParams.push(`${needle}%`, `%${needle}%`, `%${needle}%`);
    }

    const total = (
      db
        .prepare(
          `SELECT COUNT(*) AS n ${COMMIT_SOURCE_SQL} WHERE ${where.sql} ${searchSql}`,
        )
        .get(...where.params, ...searchParams) as { n: number }
    ).n;
    const commitCount = commitSetInfo(db, repo.id, filters).commitCount;

    const rows = db
      .prepare(
        `SELECT c.id AS id, c.sha AS sha, c.parent_sha AS parent_sha, c.ts AS ts,
                ${AUTHOR_KEY_SQL} AS author_id,
                ${AUTHOR_NAME_SQL} AS author_name,
                ${AUTHOR_EMAIL_SQL} AS author_email
         ${COMMIT_SOURCE_SQL}
         WHERE ${where.sql} ${searchSql}
         ORDER BY c.ts DESC, c.id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...where.params, ...searchParams, paging.pageSize, paging.offset) as CommitRow[];

    const items: CommitListItem[] = rows.map((row) => ({
      sha: row.sha,
      parentSha: row.parent_sha,
      ts: row.ts,
      authorId: row.author_id,
      authorName: row.author_name,
      authorEmail: row.author_email,
    }));

    res.json({
      items,
      total,
      page: paging.page,
      pageSize: paging.pageSize,
      commitCount,
    } satisfies ListResponse<CommitListItem>);
  });

  router.get('/:repoId/commits/:sha/stats', (req, res) => {
    const repo = requireReadyRepository(services, req.params.repoId);
    const sha = req.params.sha.toLowerCase();

    const row = db
      .prepare(
        `SELECT c.id AS id, c.sha AS sha, c.parent_sha AS parent_sha, c.ts AS ts,
                ${AUTHOR_KEY_SQL} AS author_id,
                ${AUTHOR_NAME_SQL} AS author_name,
                ${AUTHOR_EMAIL_SQL} AS author_email
         ${COMMIT_SOURCE_SQL}
         WHERE c.repo_id = ? AND c.sha = ?`,
      )
      .get(repo.id, sha) as CommitRow | undefined;
    if (!row) {
      throw notFound(`Commit ${sha} not found in this repository.`, 'COMMIT_NOT_FOUND');
    }

    const files = db
      .prepare(
        'SELECT path, added, removed FROM commit_file_stats WHERE commit_id = ? ORDER BY path',
      )
      .all(row.id) as CommitFileStatDTO[];

    res.json({
      sha: row.sha,
      parentSha: row.parent_sha,
      ts: row.ts,
      authorId: row.author_id,
      authorName: row.author_name,
      authorEmail: row.author_email,
      files,
    } satisfies CommitStatsDTO);
  });

  return router;
}
