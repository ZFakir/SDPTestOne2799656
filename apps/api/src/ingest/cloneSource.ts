import { AppError } from '../util/errors';
import { runGit } from '../git/gitRunner';

export interface CloneProgress {
  /** Overall fraction of the clone phase in [0, 1]. */
  fraction: number;
  label: string;
}

/**
 * Map `git clone --progress` stderr lines onto a coarse overall progress:
 *   Counting objects   0.00 – 0.10
 *   Compressing       0.10 – 0.20
 *   Receiving objects 0.20 – 0.90
 *   Resolving deltas  0.90 – 1.00
 */
export function parseCloneProgress(line: string): CloneProgress | null {
  const match = /([A-Za-z ]+?):\s+(\d+)%/.exec(line);
  if (!match) return null;
  const stage = match[1].trim().toLowerCase();
  const pct = Number.parseInt(match[2], 10) / 100;
  if (!Number.isFinite(pct)) return null;

  const label = `${match[1].trim()} ${match[2]}%`;
  if (stage.startsWith('counting')) return { fraction: pct * 0.1, label };
  if (stage.startsWith('compressing')) return { fraction: 0.1 + pct * 0.1, label };
  if (stage.startsWith('receiving')) return { fraction: 0.2 + pct * 0.7, label };
  if (stage.startsWith('resolving')) return { fraction: 0.9 + pct * 0.1, label };
  return null;
}

export interface CloneOptions {
  timeoutMs: number;
  onProgress?: (progress: CloneProgress) => void;
}

/**
 * Full (non-shallow) mirror clone. Mirrors keep every ref and the full history,
 * which is required for analysis and works without a worktree.
 */
export async function cloneMirror(url: string, targetDir: string, options: CloneOptions): Promise<void> {
  const result = await runGit(['clone', '--mirror', '--progress', '--', url, targetDir], {
    timeoutMs: options.timeoutMs,
    onStderrLine: (line) => {
      const progress = parseCloneProgress(line);
      if (progress) options.onProgress?.(progress);
    },
  });

  if (result.code !== 0) {
    const detail = result.stderr
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .slice(-4)
      .join('; ');
    throw new AppError(
      'CLONE_FAILED',
      400,
      `git clone failed (exit code ${result.code})${detail ? `: ${detail}` : '.'}`,
    );
  }
}
