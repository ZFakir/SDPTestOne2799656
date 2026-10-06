import path from 'node:path';
import type { Config } from '../config';

/** Root directory owned by a single ingested repository. */
export function repoDir(config: Config, repoId: string): string {
  return path.join(config.reposDir, repoId);
}

/** Extraction target for a zip upload (a worktree or bare repo lives inside). */
export function zipSrcDir(config: Config, repoId: string): string {
  return path.join(repoDir(config, repoId), 'src');
}

/** Target of `git clone --mirror` for URL sources (a bare repository). */
export function mirrorDir(config: Config, repoId: string): string {
  return path.join(repoDir(config, repoId), 'repo.git');
}
