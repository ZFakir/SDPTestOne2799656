import { baseGitArgs, runGit } from '../git/gitRunner';
import { AppError } from '../util/errors';

export interface RepoValidation {
  headSha: string;
  /** Number of non-merge commits reachable from HEAD (= |H-bar|). */
  commitCount: number;
}

/**
 * Cheap sanity checks performed before the full analysis: HEAD must resolve and
 * the history must contain at least one non-merge commit. Produces actionable
 * errors instead of failing midway through the analysis stream.
 */
export async function validateGitRepo(gitDir: string, timeoutMs: number): Promise<RepoValidation> {
  const head = await runGit([...baseGitArgs(gitDir), 'rev-parse', 'HEAD'], { timeoutMs });
  if (head.code !== 0) {
    throw new AppError(
      'NOT_A_REPO',
      400,
      'The ingested source is not a git repository with at least one commit (git rev-parse HEAD failed).',
    );
  }
  const headSha = head.stdout.trim();

  const count = await runGit([...baseGitArgs(gitDir), 'rev-list', '--count', '--no-merges', 'HEAD'], {
    timeoutMs,
  });
  if (count.code !== 0) {
    throw new AppError('NOT_A_REPO', 400, 'Could not enumerate the repository history (git rev-list failed).');
  }
  const commitCount = Number.parseInt(count.stdout.trim(), 10);
  if (!Number.isFinite(commitCount) || commitCount < 1) {
    throw new AppError(
      'EMPTY_REPO',
      400,
      'The repository has no non-merge commits to analyse.',
    );
  }

  return { headSha, commitCount };
}
