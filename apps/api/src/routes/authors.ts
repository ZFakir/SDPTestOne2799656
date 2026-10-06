import { Router } from 'express';
import type { AuthorsResponse } from '@rat/shared';
import { resolveAuthors } from '../metrics/authorMetrics';
import { requireReadyRepository, type Services } from '../services';

/** `/api/repositories/:repoId/authors` — resolved authors + raw idents. */
export function authorsRouter(services: Services): Router {
  const { db } = services;
  const router = Router();

  router.get('/:repoId/authors', (req, res) => {
    const repo = requireReadyRepository(services, req.params.repoId);
    const resolved = resolveAuthors(db, repo.id);
    res.json({
      authors: resolved.authors,
      rawIdents: resolved.rawIdents,
    } satisfies AuthorsResponse);
  });

  return router;
}
