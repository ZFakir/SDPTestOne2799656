import { Router } from 'express';
import type { PathsResponse } from '@rat/shared';
import { requireReadyRepository, type Services } from '../services';

/** `/api/repositories/:id/paths` — files and directories for the path picker. */
export function pathsRouter(services: Services): Router {
  const { db } = services;
  const router = Router();

  router.get('/:id/paths', (req, res) => {
    const repo = requireReadyRepository(services, req.params.id);
    const files = db
      .prepare(
        `SELECT DISTINCT path FROM commit_file_stats WHERE repo_id = ? ORDER BY path`,
      )
      .all(repo.id) as Array<{ path: string }>;
    const dirs = db
      .prepare('SELECT path FROM repo_dirs WHERE repo_id = ? ORDER BY path')
      .all(repo.id) as Array<{ path: string }>;
    res.json({
      files: files.map((row) => row.path),
      dirs: dirs.map((row) => row.path),
    } satisfies PathsResponse);
  });

  return router;
}
