import { Router } from 'express';
import type { CompareRepoDTO, CompareResponse } from '@rat/shared';
import { getRepository } from '../db/repoStore';
import { commitSetInfo, type MetricFilters } from '../metrics/commitSet';
import { ensureRollup, isUnfiltered } from '../metrics/rollup';
import { queryRepoMetrics } from '../metrics/setMetrics';
import { optionalInt, optionalString } from '../middleware/validate';
import type { Services } from '../services';
import { badRequest, conflict, notFound } from '../util/errors';

const MAX_COMPARE_REPOS = 8;
const MAX_LAST_DAYS = 3650;
const DAY = 86400;

/**
 * `/api/metrics/compare` — side-by-side repository metrics for 2..8 repos.
 *
 * The commit set per repository is either:
 *   - a shared absolute range: `fromTs`/`toTs`,
 *   - the final `lastDays` days of each repository's own history, or
 *   - all time (no parameters).
 */
export function compareRouter(services: Services): Router {
  const { db } = services;
  const router = Router();

  router.get('/compare', (req, res) => {
    const raw = optionalString(req.query.repoIds);
    if (raw === undefined) {
      throw badRequest('Query parameter "repoIds" is required (comma-separated list).');
    }
    const repoIds = Array.from(
      new Set(
        raw
          .split(',')
          .map((part) => part.trim())
          .filter((part) => part.length > 0),
      ),
    );
    if (repoIds.length < 2) {
      throw badRequest('Select at least two repositories to compare.');
    }
    if (repoIds.length > MAX_COMPARE_REPOS) {
      throw badRequest(`At most ${MAX_COMPARE_REPOS} repositories can be compared at once.`);
    }
    if (optionalString(req.query.commitIds) !== undefined) {
      throw badRequest('"commitIds" is not supported by the compare endpoint.');
    }

    const lastDays = optionalInt(req.query.lastDays, 'lastDays');
    const fromTs = optionalInt(req.query.fromTs, 'fromTs');
    const toTs = optionalInt(req.query.toTs, 'toTs');
    if (lastDays !== undefined && (fromTs !== undefined || toTs !== undefined)) {
      throw badRequest('"lastDays" cannot be combined with "fromTs"/"toTs".');
    }
    if (lastDays !== undefined && (lastDays < 1 || lastDays > MAX_LAST_DAYS)) {
      throw badRequest(`Query parameter "lastDays" must be between 1 and ${MAX_LAST_DAYS}.`);
    }
    if (fromTs !== undefined && toTs !== undefined && fromTs > toTs) {
      throw badRequest('"fromTs" must be less than or equal to "toTs".');
    }

    const rows = repoIds.map((repoId) => {
      const row = getRepository(db, repoId);
      if (!row) throw notFound(`Repository ${repoId} not found.`, 'REPO_NOT_FOUND');
      if (row.status !== 'ready') {
        throw conflict(
          `Repository "${row.name}" is not ready yet (status: ${row.status}).`,
          'REPO_NOT_READY',
        );
      }
      return row;
    });

    const repos: CompareRepoDTO[] = rows.map((row) => {
      let filters: MetricFilters = { fromTs, toTs };
      if (lastDays !== undefined) {
        // Anchor the window to each repository's own newest commit so
        // repositories with different timelines stay comparable.
        const info = commitSetInfo(db, row.id, {});
        filters =
          info.lastTs === null
            ? {}
            : { fromTs: info.lastTs - lastDays * DAY, toTs: info.lastTs + 1 };
      }
      if (isUnfiltered(filters)) ensureRollup(db, row.id);
      return {
        id: row.id,
        name: row.name,
        sourceType: row.source_type,
        sourceRef: row.source_ref,
        headSha: row.head_sha,
        metrics: queryRepoMetrics(db, row.id, filters),
      };
    });

    res.json({ repos } satisfies CompareResponse);
  });

  return router;
}
