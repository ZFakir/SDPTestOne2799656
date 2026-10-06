import { ensureStorageDirs, type Config } from './config';
import type { DB } from './db/database';
import { getRepository, type RepositoryRow } from './db/repoStore';
import { createPipeline, type IngestPipeline } from './ingest/pipeline';
import { createJobStore, type JobStore } from './jobs/jobStore';
import { createQueue, type JobQueue } from './jobs/queue';
import { conflict, notFound } from './util/errors';

/** Everything the routers need, constructed once at bootstrap (or in tests). */
export interface Services {
  config: Config;
  db: DB;
  jobStore: JobStore;
  queue: JobQueue;
  pipeline: IngestPipeline;
}

export function createServices(config: Config, db: DB): Services {
  ensureStorageDirs(config);
  const jobStore = createJobStore(db);
  const queue = createQueue();
  const pipeline = createPipeline({ db, config, jobStore });
  return { config, db, jobStore, queue, pipeline };
}

/** Fetch a repository or fail with a structured 404. */
export function requireRepository(services: Services, repoId: string): RepositoryRow {
  const row = getRepository(services.db, repoId);
  if (!row) throw notFound(`Repository ${repoId} not found.`, 'REPO_NOT_FOUND');
  return row;
}

/** Fetch a repository and require that its ingestion finished successfully. */
export function requireReadyRepository(services: Services, repoId: string): RepositoryRow {
  const row = requireRepository(services, repoId);
  if (row.status !== 'ready') {
    throw conflict(
      `Repository ${repoId} is not ready yet (status: ${row.status}).`,
      'REPO_NOT_READY',
    );
  }
  return row;
}
