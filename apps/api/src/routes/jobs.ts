import { Router } from 'express';
import type { JobDTO } from '@rat/shared';
import type { JobRow } from '../jobs/jobStore';
import type { Services } from '../services';
import { notFound } from '../util/errors';

export function toJobDTO(row: JobRow): JobDTO {
  return {
    id: row.id,
    repoId: row.repo_id,
    type: 'ingest',
    status: row.status,
    phase: row.phase,
    progress: row.progress,
    error: row.error,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

/** `/api/jobs` — ingestion job polling. */
export function jobsRouter(services: Services): Router {
  const router = Router();

  router.get('/:id', (req, res) => {
    const job = services.jobStore.get(req.params.id);
    if (!job) throw notFound(`Job ${req.params.id} not found.`, 'JOB_NOT_FOUND');
    res.json(toJobDTO(job));
  });

  return router;
}
