import type { DB } from '../db/database';
import { markReady } from '../db/repoStore';
import { ensureRollup } from '../metrics/rollup';

/**
 * Finalize step of the ingest pipeline: materialize the derived directory list
 * and the metric rollups, then mark the repository ready. All other data
 * derived from the fact table is computed at query time; `repo_dirs` powers
 * the path picker and directory listings, the rollup tables serve the common
 * unfiltered dashboard reads without scanning the fact table.
 */
export function finalizeRepo(
  db: DB,
  repoId: string,
  dirs: Iterable<string>,
  headSha: string,
  commitCount: number,
): void {
  const insertDir = db.prepare('INSERT OR IGNORE INTO repo_dirs (repo_id, path) VALUES (?, ?)');
  const rows = Array.from(dirs).sort();
  const tx = db.transaction(() => {
    for (const dir of rows) insertDir.run(repoId, dir);
  });
  tx();
  ensureRollup(db, repoId);
  markReady(db, repoId, headSha, commitCount);
}
