import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { RepositoriesResponse, RepositoryDTO } from '@rat/shared';
import type { RepositoryRow } from '../db/repoStore';
import {
  createRepository,
  deleteRepository,
  getRepository,
  listRepositories,
} from '../db/repoStore';
import { enqueueIngest } from '../ingest/pipeline';
import type { JobRow } from '../jobs/jobStore';
import { parseBody } from '../middleware/validate';
import type { Services } from '../services';
import { badRequest, conflict, notFound } from '../util/errors';
import { repoDir } from '../util/paths';
import { toJobDTO } from './jobs';

function toRepositoryDTO(row: RepositoryRow, latestJob: JobRow | null): RepositoryDTO {
  return {
    id: row.id,
    name: row.name,
    sourceType: row.source_type,
    sourceRef: row.source_ref,
    status: row.status,
    error: row.error,
    headSha: row.head_sha,
    commitCount: row.commit_count,
    createdAt: row.created_at,
    readyAt: row.ready_at,
    latestJob: latestJob ? toJobDTO(latestJob) : null,
  };
}

/** Filesystem-safe repository display name. */
function sanitizeRepoName(raw: string): string {
  const cleaned = raw
    .replace(/[\\/]+/g, '-')
    .replace(/[^\w .()@+-]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+/, '')
    .trim()
    .slice(0, 120);
  return cleaned === '' ? 'repository' : cleaned;
}

/** Derive a display name from a clone URL (last path segment, minus .git). */
function deriveNameFromUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  const lastSegment = trimmed.split(/[/:]/).pop() ?? '';
  return lastSegment.replace(/\.git$/i, '');
}

const CloneBodySchema = z.object({
  url: z
    .string({ required_error: 'url is required.' })
    .trim()
    .min(1, 'url is required.')
    .max(2048, 'url is too long.')
    .refine(
      (value) => /^(https?:\/\/|git:\/\/|ssh:\/\/|git@)/.test(value),
      'url must be an http(s)://, git://, ssh:// or git@ URL.',
    ),
  name: z.string().trim().max(120).optional(),
});

/** `/api/repositories` — ingest (zip upload / clone), list, detail, delete. */
export function repositoriesRouter(services: Services): Router {
  const { db, config, jobStore, queue, pipeline } = services;
  const upload = multer({ dest: config.tmpDir, limits: { fileSize: config.maxUploadBytes } });
  const router = Router();

  router.get('/', (_req, res) => {
    const repositories = listRepositories(db).map((row) =>
      toRepositoryDTO(row, jobStore.latestForRepo(row.id) ?? null),
    );
    res.json({ repositories } satisfies RepositoriesResponse);
  });

  router.post('/upload', upload.single('file'), (req, res) => {
    const file = req.file;
    if (!file) {
      throw badRequest(
        'Attach the repository archive as the "file" form field.',
        'UPLOAD_MISSING_FILE',
      );
    }
    if (!file.originalname.toLowerCase().endsWith('.zip')) {
      fs.rmSync(file.path, { force: true });
      throw badRequest('Only .zip archives are accepted.', 'UPLOAD_NOT_ZIP');
    }

    const id = crypto.randomUUID();
    const name = sanitizeRepoName(
      path.basename(file.originalname, path.extname(file.originalname)),
    );
    const row = createRepository(db, {
      id,
      name,
      sourceType: 'zip',
      sourceRef: file.originalname,
      storagePath: repoDir(config, id),
    });
    const job = jobStore.create(id);
    enqueueIngest(queue, pipeline, {
      repoId: id,
      jobId: job.id,
      source: { kind: 'zip', zipPath: file.path },
    });
    res.status(202).json({ repository: toRepositoryDTO(row, job), job: toJobDTO(job) });
  });

  router.post('/clone', (req, res) => {
    const body = parseBody(CloneBodySchema, req.body);
    const id = crypto.randomUUID();
    const name = sanitizeRepoName(body.name ?? deriveNameFromUrl(body.url));
    const row = createRepository(db, {
      id,
      name,
      sourceType: 'url',
      sourceRef: body.url,
      storagePath: repoDir(config, id),
    });
    const job = jobStore.create(id);
    enqueueIngest(queue, pipeline, {
      repoId: id,
      jobId: job.id,
      source: { kind: 'clone', url: body.url },
    });
    res.status(202).json({ repository: toRepositoryDTO(row, job), job: toJobDTO(job) });
  });

  router.get('/:id', (req, res) => {
    const row = getRepository(db, req.params.id);
    if (!row) throw notFound(`Repository ${req.params.id} not found.`, 'REPO_NOT_FOUND');
    res.json(toRepositoryDTO(row, jobStore.latestForRepo(row.id) ?? null));
  });

  router.delete('/:id', (req, res) => {
    const row = getRepository(db, req.params.id);
    if (!row) throw notFound(`Repository ${req.params.id} not found.`, 'REPO_NOT_FOUND');
    if (jobStore.hasActiveJob(row.id)) {
      throw conflict(
        'Cannot delete a repository while its ingestion is running.',
        'DELETE_ACTIVE_JOB',
      );
    }

    deleteRepository(db, row.id);

    // Remove on-disk data; guard the path stays inside the repos directory.
    const dir = path.resolve(row.storage_path);
    const base = path.resolve(config.reposDir);
    if (dir !== base && dir.startsWith(base + path.sep)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    res.status(204).end();
  });

  return router;
}
