import fs from 'node:fs';
import type { Config } from '../config';
import type { DB } from '../db/database';
import { markError, markProcessing } from '../db/repoStore';
import { resolveMailmap } from '../git/identResolver';
import type { JobStore } from '../jobs/jobStore';
import type { JobQueue } from '../jobs/queue';
import { errorMessage } from '../util/errors';
import { mirrorDir, zipSrcDir } from '../util/paths';
import { analyzeCommits } from '../analysis/analyzeCommits';
import { finalizeRepo } from '../analysis/finalize';
import { cloneMirror } from './cloneSource';
import { validateGitRepo } from './validateRepo';
import { extractRepoZip } from './zipSource';

export interface PipelineDeps {
  db: DB;
  config: Config;
  jobStore: JobStore;
}

export interface IngestPipeline {
  processZip(repoId: string, jobId: string, zipPath: string): Promise<void>;
  processClone(repoId: string, jobId: string, url: string): Promise<void>;
}

type Source = { kind: 'zip'; zipPath: string } | { kind: 'clone'; url: string };

/** Phase boundaries of overall job progress. */
const PROGRESS = {
  SOURCE_START: 0.02,
  SOURCE_END: 0.42,
  VALIDATING: 0.45,
  ANALYZING_START: 0.45,
  ANALYZING_END: 0.95,
  FINALIZING: 0.97,
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function createPipeline(deps: PipelineDeps): IngestPipeline {
  const { db, config, jobStore } = deps;

  async function run(repoId: string, jobId: string, source: Source): Promise<void> {
    try {
      markProcessing(db, repoId);

      let gitDir: string;

      if (source.kind === 'zip') {
        jobStore.start(jobId, 'extracting', PROGRESS.SOURCE_START);
        const dest = zipSrcDir(config, repoId);
        gitDir = await extractRepoZip(source.zipPath, dest, {
          // Allow generous headroom over the zip limit for uncompressed content.
          maxTotalBytes: Math.max(config.maxUploadBytes * 6, 1024 * 1024 * 1024),
          maxEntries: 1_000_000,
          onProgress: (processed, total) => {
            const fraction = total > 0 ? processed / total : 0;
            jobStore.setProgress(
              jobId,
              'extracting',
              PROGRESS.SOURCE_START + (PROGRESS.SOURCE_END - PROGRESS.SOURCE_START) * fraction,
            );
          },
        });
      } else {
        jobStore.start(jobId, 'cloning', PROGRESS.SOURCE_START);
        let last = 0;
        gitDir = mirrorDir(config, repoId);
        await cloneMirror(source.url, gitDir, {
          timeoutMs: config.cloneTimeoutMs,
          onProgress: (progress) => {
            last = Math.max(last, progress.fraction);
            jobStore.setProgress(
              jobId,
              'cloning',
              PROGRESS.SOURCE_START + (PROGRESS.SOURCE_END - PROGRESS.SOURCE_START) * last,
            );
          },
        });
      }

      jobStore.setPhase(jobId, 'validating', PROGRESS.VALIDATING);
      const validation = await validateGitRepo(gitDir, config.gitTimeoutMs);

      jobStore.setPhase(jobId, 'analyzing', PROGRESS.ANALYZING_START);
      const analysis = await analyzeCommits({
        db,
        gitDir,
        repoId,
        expectedCommitCount: validation.commitCount,
        timeoutMs: config.gitTimeoutMs,
        onProgress: (processed, total) => {
          const fraction = total > 0 ? clamp01(processed / total) : 0;
          jobStore.setProgress(
            jobId,
            'analyzing',
            PROGRESS.ANALYZING_START + (PROGRESS.ANALYZING_END - PROGRESS.ANALYZING_START) * fraction,
          );
        },
      });

      jobStore.setPhase(jobId, 'finalizing', PROGRESS.FINALIZING);

      // Mailmap resolution is best-effort: failures fall back to raw idents.
      try {
        await resolveMailmap(config, gitDir, db, repoId);
      } catch (err) {
        console.warn(`[rat] mailmap resolution skipped for ${repoId}: ${errorMessage(err)}`);
      }

      finalizeRepo(db, repoId, analysis.dirs, validation.headSha, analysis.commitCount);
      jobStore.succeed(jobId);
    } catch (err) {
      const message = errorMessage(err);
      console.error(`[rat] ingestion failed for ${repoId}: ${message}`);
      markError(db, repoId, message);
      jobStore.fail(jobId, message);
    } finally {
      if (source.kind === 'zip') {
        // Uploaded zips are staged copies — never needed after extraction.
        await fs.promises.rm(source.zipPath, { force: true }).catch(() => undefined);
      }
    }
  }

  return {
    processZip: (repoId, jobId, zipPath) => run(repoId, jobId, { kind: 'zip', zipPath }),
    processClone: (repoId, jobId, url) => run(repoId, jobId, { kind: 'clone', url }),
  };
}

/** Wire the pipeline to a queue: returns an enqueue function for routes. */
export function enqueueIngest(
  queue: JobQueue,
  pipeline: IngestPipeline,
  task: { repoId: string; jobId: string; source: Source },
): void {
  queue.enqueue(() => {
    if (task.source.kind === 'zip') {
      return pipeline.processZip(task.repoId, task.jobId, task.source.zipPath);
    }
    return pipeline.processClone(task.repoId, task.jobId, task.source.url);
  });
}
