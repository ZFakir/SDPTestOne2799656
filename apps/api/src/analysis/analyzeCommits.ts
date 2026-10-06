import type { DB } from '../db/database';
import { baseGitArgs, runGit } from '../git/gitRunner';
import { LOG_FORMAT, LogStreamParser, type ParsedFileStat } from '../git/logParser';
import { AppError } from '../util/errors';

export interface AnalyzeOptions {
  db: DB;
  gitDir: string;
  repoId: string;
  /** Expected number of non-merge commits (from rev-list --count) for progress. */
  expectedCommitCount: number;
  timeoutMs: number;
  onProgress?: (processedCommits: number, totalCommits: number) => void;
}

export interface AnalyzeResult {
  commitCount: number;
  /** Every directory path seen in the history (ancestors of every file path). */
  dirs: Set<string>;
}

/** Commits buffered before a batched transaction is flushed. */
const BATCH_SIZE = 500;

/**
 * Single-pass streaming analysis of the full history:
 *
 *   git log --no-merges -M50% --numstat --format=... HEAD
 *
 * - Every non-merge commit is stored (empty commits included — they are part
 *   of the |H| denominator);
 * - Binary rows are dropped by the parser (git's own `-` detection);
 * - Renames are attributed to the new path, deletions to the removed path;
 * - Rows with zero changes (pure renames / mode changes) are not stored — they
 *   contribute nothing to any metric in the brief;
 * - Inserts are batched in transactions of BATCH_SIZE commits.
 */
export async function analyzeCommits(options: AnalyzeOptions): Promise<AnalyzeResult> {
  const { db, gitDir, repoId, expectedCommitCount, timeoutMs, onProgress } = options;

  const insertIdent = db.prepare(
    'INSERT OR IGNORE INTO raw_idents (repo_id, name, email) VALUES (?, ?, ?)',
  );
  const selectIdent = db.prepare(
    'SELECT id FROM raw_idents WHERE repo_id = ? AND name = ? AND email = ?',
  );
  const insertCommit = db.prepare(
    `INSERT INTO commits (repo_id, sha, parent_sha, ts, raw_ident_id)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const insertStat = db.prepare(
    `INSERT INTO commit_file_stats (repo_id, commit_id, path, added, removed)
     VALUES (?, ?, ?, ?, ?)`,
  );

  const identCache = new Map<string, number>();
  const getIdentId = (name: string, email: string): number => {
    const key = `${name}\x00${email}`;
    const cached = identCache.get(key);
    if (cached !== undefined) return cached;
    insertIdent.run(repoId, name, email);
    const row = selectIdent.get(repoId, name, email) as { id: number };
    identCache.set(key, row.id);
    return row.id;
  };

  interface BufferedCommit {
    sha: string;
    parentSha: string | null;
    ts: number;
    identId: number;
    files: ParsedFileStat[];
  }

  let buffer: BufferedCommit[] = [];
  const dirs = new Set<string>();
  let commitCount = 0;

  const flushTx = db.transaction((rows: BufferedCommit[]) => {
    for (const row of rows) {
      const info = insertCommit.run(repoId, row.sha, row.parentSha, row.ts, row.identId);
      const commitId = Number(info.lastInsertRowid);
      for (const file of row.files) {
        insertStat.run(repoId, commitId, file.path, file.added, file.removed);
      }
    }
  });

  const flush = (): void => {
    if (buffer.length === 0) return;
    flushTx(buffer);
    buffer = [];
    onProgress?.(commitCount, expectedCommitCount);
  };

  const collectDirs = (filePath: string): void => {
    let idx = filePath.lastIndexOf('/');
    while (idx > 0) {
      dirs.add(filePath.slice(0, idx));
      idx = filePath.lastIndexOf('/', idx - 1);
    }
  };

  const parser = new LogStreamParser({
    onCommit: (commit) => {
      commitCount++;
      const identId = getIdentId(commit.authorName, commit.authorEmail);
      const files: ParsedFileStat[] = [];
      for (const file of commit.files) {
        collectDirs(file.path);
        // Pure renames / mode-only changes carry no metric weight — skip them.
        if (file.added + file.removed > 0) files.push(file);
      }
      buffer.push({
        sha: commit.sha,
        parentSha: commit.parents[0] ?? null,
        ts: commit.ts,
        identId,
        files,
      });
      if (buffer.length >= BATCH_SIZE) flush();
    },
  });

  const args = [
    ...baseGitArgs(gitDir),
    'log',
    '--no-merges',
    '-M50%',
    '--date-order',
    '--numstat',
    `--format=${LOG_FORMAT}`,
    'HEAD',
  ];

  const result = await runGit(args, {
    timeoutMs,
    onStdoutLine: (line) => parser.pushLine(line),
  });
  parser.end();
  flush();

  if (result.code !== 0) {
    throw new AppError(
      'ANALYSIS_FAILED',
      500,
      `Analysis failed: git log exited with code ${result.code}. ${result.stderr.trim().slice(-500)}`,
    );
  }

  return { commitCount, dirs };
}
