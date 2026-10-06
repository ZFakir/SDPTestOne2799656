import crypto from 'node:crypto';
import type { DB } from '../db/database';

export type JobStatus = 'queued' | 'running' | 'done' | 'failed';

export type JobPhase =
  | 'pending'
  | 'extracting'
  | 'cloning'
  | 'validating'
  | 'analyzing'
  | 'finalizing'
  | 'complete';

export interface JobRow {
  id: string;
  repo_id: string;
  type: string;
  status: JobStatus;
  phase: JobPhase;
  progress: number;
  error: string | null;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
}

export interface JobStore {
  create(repoId: string): JobRow;
  get(id: string): JobRow | undefined;
  /** Most recent job for a repository (for the repository DTO). */
  latestForRepo(repoId: string): JobRow | undefined;
  /** Mark the job as running, entering the given phase. */
  start(id: string, phase: JobPhase, progress: number): void;
  setPhase(id: string, phase: JobPhase, progress: number): void;
  setProgress(id: string, phase: JobPhase, progress: number): void;
  succeed(id: string): void;
  fail(id: string, error: string): void;
  hasActiveJob(repoId: string): boolean;
  /** On server restart, mark interrupted jobs and their repositories as failed. */
  failStale(): number;
}

export function createJobStore(db: DB): JobStore {
  const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

  return {
    create(repoId: string): JobRow {
      const id = crypto.randomUUID();
      db.prepare(
        `INSERT INTO jobs (id, repo_id, type, status, phase, progress, created_at)
         VALUES (?, ?, 'ingest', 'queued', 'pending', 0, ?)`,
      ).run(id, repoId, Date.now());
      return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as JobRow;
    },

    get(id: string): JobRow | undefined {
      return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as JobRow | undefined;
    },

    latestForRepo(repoId: string): JobRow | undefined {
      return db
        .prepare('SELECT * FROM jobs WHERE repo_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1')
        .get(repoId) as JobRow | undefined;
    },

    start(id: string, phase: JobPhase, progress: number): void {
      db.prepare(
        `UPDATE jobs SET status = 'running', phase = ?, progress = ?, started_at = ? WHERE id = ?`,
      ).run(phase, clamp01(progress), Date.now(), id);
    },

    setPhase(id: string, phase: JobPhase, progress: number): void {
      db.prepare(`UPDATE jobs SET phase = ?, progress = ? WHERE id = ?`).run(
        phase,
        clamp01(progress),
        id,
      );
    },

    setProgress(id: string, phase: JobPhase, progress: number): void {
      db.prepare(`UPDATE jobs SET phase = ?, progress = ? WHERE id = ?`).run(
        phase,
        clamp01(progress),
        id,
      );
    },

    succeed(id: string): void {
      db.prepare(
        `UPDATE jobs SET status = 'done', phase = 'complete', progress = 1, finished_at = ? WHERE id = ?`,
      ).run(Date.now(), id);
    },

    fail(id: string, error: string): void {
      db.prepare(
        `UPDATE jobs SET status = 'failed', error = ?, finished_at = ? WHERE id = ?`,
      ).run(error, Date.now(), id);
    },

    hasActiveJob(repoId: string): boolean {
      const row = db
        .prepare(
          `SELECT COUNT(*) AS n FROM jobs WHERE repo_id = ? AND status IN ('queued', 'running')`,
        )
        .get(repoId) as { n: number };
      return row.n > 0;
    },

    failStale(): number {
      const now = Date.now();
      const jobs = db
        .prepare(
          `UPDATE jobs
              SET status = 'failed', error = 'Interrupted by server restart.', finished_at = ?
            WHERE status IN ('queued', 'running')`,
        )
        .run(now);
      db.prepare(
        `UPDATE repositories
            SET status = 'error',
                error = 'Ingestion was interrupted by a server restart. Delete this repository and re-ingest it.'
          WHERE status IN ('queued', 'processing')`,
      ).run();
      return jobs.changes;
    },
  };
}
