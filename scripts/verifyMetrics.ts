#!/usr/bin/env tsx
/**
 * verifyMetrics.ts — an independent oracle for the RAT metrics engine.
 *
 * The script re-derives metrics straight from git: it spawns
 *   git log --no-merges -M50% --date-order --numstat --format=...
 * on the stored repository and aggregates the numstat stream with its own
 * parser (deliberately NOT importing the API's parser module), then diffs the
 * numbers against a running RAT API instance for an already-ingested repo.
 *
 * It covers: repository totals, commit-set filters (range, commit ids,
 * author), per-file and per-directory metrics, the resolved-author table
 * (including ownership ≈ churn share), the commits listing, the day
 * timeseries, the materialized-rollup agreement (unfiltered reads vs the live
 * fact-table path) and the multi-repository compare endpoint. Merge commits
 * are excluded everywhere (matching the pipeline), empty commits stay in |H|,
 * binary rows and zero-change rows contribute nothing.
 *
 * Usage:
 *   npm run verify -- --repo cJSON
 *   npm run verify -- --repo fixture --api http://localhost:4000
 *   npm run verify -- --repo cJSON --git-dir /abs/path/to/repo.git
 *   npm run verify -- --repo fixture --compare-with cJSON
 *
 * Exit code is 0 when every check passes, 1 otherwise (mismatches are printed
 * with expected vs actual values).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const ROOT = path.resolve(__dirname, '..');
const DAY = 86_400;
const EPS = 1e-9;
const OWNERSHIP_EPS = 1e-6;

interface CliArgs {
  repo: string;
  api: string;
  gitDir: string | null;
  compareWith: string | null;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    repo: '',
    api: process.env.RAT_API_URL?.trim() || 'http://localhost:4000',
    gitDir: null,
    compareWith: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--help' || flag === '-h') args.help = true;
    else if (flag === '--repo') {
      args.repo = value ?? '';
      i++;
    } else if (flag === '--api') {
      if (value) args.api = value;
      i++;
    } else if (flag === '--git-dir') {
      args.gitDir = value ?? null;
      i++;
    } else if (flag === '--compare-with') {
      args.compareWith = value ?? null;
      i++;
    } else {
      throw new Error(`Unknown argument: ${flag}`);
    }
  }
  return args;
}

function printUsage(): void {
  console.log(`RAT metrics oracle

Usage:
  npm run verify -- --repo <name-or-id> [--api <url>] [--git-dir <path>] [--compare-with <name-or-id>]

Options:
  --repo          Repository name or id as shown by GET /api/repositories (required).
  --api           Base URL of the RAT API (default: RAT_API_URL or http://localhost:4000).
  --git-dir       Git directory to audit (default: <storage>/repos/<id>/repo.git or the
                  worktree inside <storage>/repos/<id>/src). Storage defaults to
                  $RAT_STORAGE_DIR or <repo root>/storage.
  --compare-with  Second repository for the multi-repo compare checks (defaults to
                  the first other ready repository when one exists).
`);
}

/* -------------------------------------------------------------------------- */
/* Local API response types (intentionally decoupled from @rat/shared)        */
/* -------------------------------------------------------------------------- */

interface ApiRepository {
  id: string;
  name: string;
  status: string;
  commitCount: number | null;
}

interface ApiObjectMetrics {
  added: number;
  removed: number;
  growth: number;
  churn: number;
  modifications: number;
  modificationFrequency: number;
  churnRate: number;
}

interface ApiRepoMetrics extends ApiObjectMetrics {
  commitCount: number;
  firstTs: number | null;
  lastTs: number | null;
}

interface ApiFileRow extends ApiObjectMetrics {
  path: string;
}

interface ApiDirChild extends ApiObjectMetrics {
  path: string;
  depth: number;
}

interface ApiDirMetrics {
  path: string;
  self: ApiObjectMetrics;
  children: ApiDirChild[];
}

interface ApiAuthorRow {
  id: string;
  name: string;
  email: string;
  commitCount: number;
  added: number;
  removed: number;
  modifications: number;
  churn: number;
  ownership: number;
}

interface ApiAuthorMetrics {
  totalChurn: number;
  authors: ApiAuthorRow[];
}

interface ApiIdentity {
  id: string;
  name: string;
  email: string;
  kind: string;
  commitCount: number;
}

interface ApiTimeseriesPoint {
  bucket: string;
  added: number;
  removed: number;
  growth: number;
  churn: number;
  commits: number;
}

interface ApiList<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  commitCount?: number;
}

async function apiGet<T>(api: string, routePath: string): Promise<T> {
  const res = await fetch(`${api}${routePath}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GET ${routePath} -> HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/* -------------------------------------------------------------------------- */
/* Independent git parsing                                                    */
/* -------------------------------------------------------------------------- */

interface OracleFileStat {
  added: number;
  removed: number;
}

interface OracleCommit {
  sha: string;
  parents: string[];
  ts: number;
  email: string;
  files: Map<string, OracleFileStat>;
}

const RECORD_START = '\x1e';
const FIELD_SEP = '\x1f';
const LOG_FORMAT = '%x1e%H%x1f%P%x1f%ct%x1f%an%x1f%ae';

/** Decode git's C-quoted path syntax into a UTF-8 string. */
function unquoteCPath(quoted: string): string {
  if (quoted.length < 2 || !quoted.startsWith('"') || !quoted.endsWith('"')) return quoted;
  const inner = quoted.slice(1, -1);
  const bytes: number[] = [];
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch !== '\\') {
      bytes.push(ch.charCodeAt(0));
      continue;
    }
    i++;
    const esc = inner[i];
    if (esc === undefined) break;
    const simple: Record<string, number> = {
      n: 0x0a,
      t: 0x09,
      r: 0x0d,
      a: 0x07,
      b: 0x08,
      f: 0x0c,
      v: 0x0b,
      '"': 0x22,
      '\\': 0x5c,
    };
    if (esc in simple) {
      bytes.push(simple[esc]);
    } else if (/[0-7]/.test(esc)) {
      let oct = esc;
      while (oct.length < 3 && i + 1 < inner.length && /[0-7]/.test(inner[i + 1])) {
        i++;
        oct += inner[i];
      }
      bytes.push(Number.parseInt(oct, 8) & 0xff);
    } else {
      bytes.push(esc.charCodeAt(0));
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

/**
 * Effective (new) path of a numstat path field: handles `old => new`,
 * `pre{a => b}post` and C-quoting. The rename arrow must not sit inside a
 * quoted segment (a filename may contain a literal " => ").
 */
function effectivePath(rawField: string): string {
  let field = rawField;
  if (field.includes(' => ')) {
    const braceMatch = field.match(/^(.*)\{(.*) => (.*)\}(.*)$/s);
    if (braceMatch) {
      const [, prefix, , newPart, suffix] = braceMatch;
      field = prefix + (newPart.startsWith('"') ? unquoteCPath(newPart) : newPart) + suffix;
    } else {
      let inQuotes = false;
      let arrowIdx = -1;
      for (let i = 0; i < field.length; i++) {
        const ch = field[i];
        if (ch === '\\' && inQuotes) {
          i++;
          continue;
        }
        if (ch === '"') {
          inQuotes = !inQuotes;
          continue;
        }
        if (!inQuotes && field.startsWith(' => ', i)) {
          arrowIdx = i;
          break;
        }
      }
      if (arrowIdx !== -1) field = field.slice(arrowIdx + 4);
    }
  }
  return field.startsWith('"') && field.endsWith('"') ? unquoteCPath(field) : field;
}

/** Stream `git log --numstat` and build the oracle's commit list. */
function loadCommits(gitDir: string): Promise<OracleCommit[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'git',
      [
        '-C',
        gitDir,
        '-c',
        `safe.directory=${gitDir}`,
        '-c',
        'core.quotePath=false',
        'log',
        '--no-merges',
        '-M50%',
        '--date-order',
        '--numstat',
        `--format=${LOG_FORMAT}`,
        'HEAD',
      ],
      {
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    if (!child.stdout || !child.stderr) {
      reject(new Error('Failed to spawn git (no stdio pipes).'));
      return;
    }

    const commits: OracleCommit[] = [];
    let current: OracleCommit | null = null;
    let stderr = '';

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    rl.on('line', (line) => {
      if (line.startsWith(RECORD_START)) {
        if (current) commits.push(current);
        const fields = line.slice(1).split(FIELD_SEP);
        const ts = Number.parseInt(fields[2] ?? '', 10);
        if (!Number.isFinite(ts)) {
          throw new Error(`Malformed git log record: ${line.slice(0, 120)}`);
        }
        current = {
          sha: fields[0] ?? '',
          parents: (fields[1] ?? '').split(' ').filter(Boolean),
          ts,
          email: fields[4] ?? '',
          files: new Map(),
        };
        return;
      }
      if (!current) return;
      const match = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
      if (!match) return;
      if (match[1] === '-' || match[2] === '-') return; // binary row
      const filePath = effectivePath(match[3]);
      const added = Number(match[1]);
      const removed = Number(match[2]);
      const existing = current.files.get(filePath);
      if (existing) {
        existing.added += added;
        existing.removed += removed;
      } else {
        current.files.set(filePath, { added, removed });
      }
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (current) commits.push(current);
      if (code !== 0) {
        reject(new Error(`git log failed (exit ${code}): ${stderr.trim().slice(-500)}`));
        return;
      }
      resolve(commits);
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Oracle aggregation                                                         */
/* -------------------------------------------------------------------------- */

interface OracleFilters {
  fromTs?: number;
  toTs?: number;
  commitIds?: Set<string>;
  /** Commit author email (case-insensitive exact match). */
  authorEmail?: string;
}

interface OracleAggregate {
  commitCount: number;
  added: number;
  removed: number;
  modifications: number;
  firstTs: number | null;
  lastTs: number | null;
}

/**
 * Recompute the five metric families for a commit set, optionally scoped to an
 * object (file or directory subtree) via `object`.
 *
 * Semantics mirrored from the brief:
 * - `H` is filtered by ts range `[fromTs, toTs)`, commit ids and author;
 * - `modifications` counts commits in `H` that changed the object;
 * - zero-change rows (pure renames) never affect a metric.
 */
function aggregate(
  commits: OracleCommit[],
  filters: OracleFilters = {},
  object?: (filePath: string) => boolean,
): OracleAggregate {
  let commitCount = 0;
  let added = 0;
  let removed = 0;
  let modifications = 0;
  let firstTs: number | null = null;
  let lastTs: number | null = null;

  for (const commit of commits) {
    if (filters.fromTs !== undefined && commit.ts < filters.fromTs) continue;
    if (filters.toTs !== undefined && commit.ts >= filters.toTs) continue;
    if (filters.commitIds && !filters.commitIds.has(commit.sha)) continue;
    if (filters.authorEmail && commit.email.toLowerCase() !== filters.authorEmail) continue;

    commitCount++;
    if (firstTs === null || commit.ts < firstTs) firstTs = commit.ts;
    if (lastTs === null || commit.ts > lastTs) lastTs = commit.ts;

    let touched = false;
    for (const [filePath, stat] of commit.files) {
      if (object && !object(filePath)) continue;
      added += stat.added;
      removed += stat.removed;
      if (stat.added + stat.removed > 0) touched = true;
    }
    if (touched) modifications++;
  }

  return { commitCount, added, removed, modifications, firstTs, lastTs };
}

function frequency(agg: OracleAggregate): number {
  return agg.commitCount === 0 ? 0 : agg.modifications / agg.commitCount;
}

function churnRate(agg: OracleAggregate): number {
  return agg.commitCount === 0 ? 0 : (agg.added + agg.removed) / agg.commitCount;
}

function dayBucket(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/* Check reporting                                                            */
/* -------------------------------------------------------------------------- */

let totalChecks = 0;
let failedChecks = 0;

function fmt(value: unknown): string {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(6);
  }
  return JSON.stringify(value);
}

function report(label: string, expected: unknown, actual: unknown, eps = 0): void {
  totalChecks++;
  let ok: boolean;
  if (typeof expected === 'number' && typeof actual === 'number') {
    ok = Math.abs(expected - actual) <= eps;
  } else {
    ok = expected === actual;
  }
  if (ok) {
    console.log(`  PASS  ${label}`);
  } else {
    failedChecks++;
    console.log(`  FAIL  ${label}`);
    console.log(`          expected: ${fmt(expected)}`);
    console.log(`          actual:   ${fmt(actual)}`);
  }
}

function section(title: string): void {
  console.log(`\n== ${title} ==`);
}

/* -------------------------------------------------------------------------- */
/* Storage helpers                                                            */
/* -------------------------------------------------------------------------- */

function findGitRepoIn(dir: string, maxDepth = 3): string | null {
  const queue: Array<{ dir: string; depth: number }> = [{ dir, depth: 0 }];
  while (queue.length > 0) {
    const { dir: current, depth } = queue.shift()!;
    if (
      fs.existsSync(path.join(current, 'HEAD')) &&
      fs.existsSync(path.join(current, 'objects'))
    ) {
      return current; // bare layout
    }
    const dotGit = path.join(current, '.git');
    if (fs.existsSync(dotGit) && fs.statSync(dotGit).isDirectory()) return current;
    if (depth >= maxDepth) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === '__MACOSX') continue;
      queue.push({ dir: path.join(current, entry.name), depth: depth + 1 });
    }
  }
  return null;
}

function resolveGitDir(explicit: string | null, repoId: string): string {
  if (explicit) {
    if (!fs.existsSync(explicit)) throw new Error(`--git-dir does not exist: ${explicit}`);
    return path.resolve(explicit);
  }

  const storageRaw = process.env.RAT_STORAGE_DIR?.trim() || './storage';
  const storage = path.isAbsolute(storageRaw) ? storageRaw : path.resolve(ROOT, storageRaw);
  const repoDir = path.join(storage, 'repos', repoId);

  const mirror = path.join(repoDir, 'repo.git');
  if (fs.existsSync(mirror)) return mirror;

  const srcDir = path.join(repoDir, 'src');
  if (fs.existsSync(srcDir)) {
    const found = findGitRepoIn(srcDir);
    if (found) return found;
  }

  throw new Error(
    `Could not locate the stored git repository for "${repoId}". Tried:\n` +
      `  - ${mirror}\n` +
      `  - a git repository inside ${srcDir}\n` +
      `Pass --git-dir <path> to override.`,
  );
}

/* -------------------------------------------------------------------------- */
/* Individual check groups                                                    */
/* -------------------------------------------------------------------------- */

function checkIngestMetadata(repo: ApiRepository, commits: OracleCommit[]): void {
  section('Ingestion metadata');
  report('repository DTO commitCount equals git non-merge commit count', commits.length, repo.commitCount ?? -1);
}

async function checkRepositoryMetrics(
  api: string,
  repoId: string,
  full: OracleAggregate,
): Promise<ApiRepoMetrics> {
  const metrics = await apiGet<ApiRepoMetrics>(api, `/api/repositories/${repoId}/metrics/repository`);
  section('Repository metrics (full history)');
  report('|H|', full.commitCount, metrics.commitCount);
  report('added l+', full.added, metrics.added);
  report('removed l-', full.removed, metrics.removed);
  report('growth d', full.added - full.removed, metrics.growth);
  report('churn lambda', full.added + full.removed, metrics.churn);
  report('modifications n', full.modifications, metrics.modifications);
  report('frequency eta', frequency(full), metrics.modificationFrequency, EPS);
  report('churn rate rho', churnRate(full), metrics.churnRate, EPS);
  report('firstTs', full.firstTs ?? -1, metrics.firstTs ?? -1);
  report('lastTs', full.lastTs ?? -1, metrics.lastTs ?? -1);
  return metrics;
}

async function checkCommitListing(api: string, repoId: string, full: OracleAggregate): Promise<void> {
  const page = await apiGet<ApiList<{ sha: string; ts: number }>>(
    api,
    `/api/repositories/${repoId}/commits?page=1&pageSize=1`,
  );
  section('Commits listing');
  report('listing total equals |H|', full.commitCount, page.total);
  if (page.commitCount !== undefined) {
    report('listing commitCount (|H| denominator)', full.commitCount, page.commitCount);
  }
}

async function checkRangeFilter(
  api: string,
  repoId: string,
  commits: OracleCommit[],
  full: OracleAggregate,
): Promise<void> {
  section('Commit-set filter: ts range [from, to)');
  if (full.lastTs === null || full.firstTs === null) {
    console.log('  SKIP  repository has no commits');
    return;
  }

  // Last 90 days of recorded history.
  const from = Math.max(full.firstTs, full.lastTs - 90 * DAY);
  const to = full.lastTs + 1;
  const rangeAgg = aggregate(commits, { fromTs: from, toTs: to });
  const rangeMetrics = await apiGet<ApiRepoMetrics>(
    api,
    `/api/repositories/${repoId}/metrics/repository?fromTs=${from}&toTs=${to}`,
  );
  report(`range [${dayBucket(from)}, ${dayBucket(to)}) |H|`, rangeAgg.commitCount, rangeMetrics.commitCount);
  report('range added', rangeAgg.added, rangeMetrics.added);
  report('range removed', rangeAgg.removed, rangeMetrics.removed);
  report('range churn', rangeAgg.added + rangeAgg.removed, rangeMetrics.churn);
  report('range modifications', rangeAgg.modifications, rangeMetrics.modifications);

  // Boundary check: toTs is exclusive — a window holding exactly the newest
  // commit timestamp must contain only the commits sharing that timestamp.
  const boundaryAgg = aggregate(commits, { fromTs: full.lastTs, toTs: full.lastTs + 1 });
  const boundaryMetrics = await apiGet<ApiRepoMetrics>(
    api,
    `/api/repositories/${repoId}/metrics/repository?fromTs=${full.lastTs}&toTs=${full.lastTs + 1}`,
  );
  report('exclusive toTs boundary |H|', boundaryAgg.commitCount, boundaryMetrics.commitCount);
}

async function checkCommitIdSelection(
  api: string,
  repoId: string,
  commits: OracleCommit[],
): Promise<void> {
  section('Commit-set filter: explicit commit ids');
  const list = await apiGet<ApiList<{ sha: string }>>(
    api,
    `/api/repositories/${repoId}/commits?page=1&pageSize=5`,
  );
  const ids = list.items.map((item) => item.sha);
  if (ids.length === 0) {
    console.log('  SKIP  no commits returned by the listing');
    return;
  }

  const selection = aggregate(commits, { commitIds: new Set(ids) });
  const metrics = await apiGet<ApiRepoMetrics>(
    api,
    `/api/repositories/${repoId}/metrics/repository?commitIds=${ids.join(',')}`,
  );
  report('selection |H|', ids.length, metrics.commitCount);
  report('selection |H| (oracle)', selection.commitCount, metrics.commitCount);
  report('selection added', selection.added, metrics.added);
  report('selection removed', selection.removed, metrics.removed);
  report('selection churn', selection.added + selection.removed, metrics.churn);
  report('selection modifications', selection.modifications, metrics.modifications);
}

async function checkTopFile(
  api: string,
  repoId: string,
  commits: OracleCommit[],
  full: OracleAggregate,
): Promise<void> {
  section('File metrics (top churn file)');
  const page = await apiGet<ApiList<ApiFileRow>>(
    api,
    `/api/repositories/${repoId}/metrics/files?sort=churn&order=desc&pageSize=1`,
  );
  const top = page.items[0];
  if (!top) {
    console.log('  SKIP  no files in the analysed history');
    return;
  }

  const fileAgg = aggregate(commits, {}, (filePath) => filePath === top.path);
  console.log(`  info  top file: ${top.path}`);
  report('file added', fileAgg.added, top.added);
  report('file removed', fileAgg.removed, top.removed);
  report('file churn', fileAgg.added + fileAgg.removed, top.churn);
  report('file modifications', fileAgg.modifications, top.modifications);
  report('file frequency eta', fileAgg.modifications / full.commitCount, top.modificationFrequency, EPS);
  report(
    'file churn rate rho',
    (fileAgg.added + fileAgg.removed) / full.commitCount,
    top.churnRate,
    EPS,
  );
}

async function checkDirectories(
  api: string,
  repoId: string,
  commits: OracleCommit[],
  full: OracleAggregate,
  fullMetrics: ApiRepoMetrics,
): Promise<void> {
  section('Directory metrics (root, depth 1)');
  const dirs = await apiGet<ApiDirMetrics>(api, `/api/repositories/${repoId}/metrics/directories?depth=1`);

  const selfChurn = dirs.self.added + dirs.self.removed;
  report('root self equals repository totals (churn)', fullMetrics.churn, selfChurn);

  const top = [...dirs.children].sort((a, b) => b.churn - a.churn)[0];
  if (!top) {
    console.log('  SKIP  no child directories');
    return;
  }

  const matcher = (filePath: string): boolean =>
    filePath === top.path || filePath.startsWith(`${top.path}/`);
  const dirAgg = aggregate(commits, {}, matcher);
  console.log(`  info  top directory: ${top.path}/`);
  report('directory added', dirAgg.added, top.added);
  report('directory removed', dirAgg.removed, top.removed);
  report('directory churn', dirAgg.added + dirAgg.removed, top.churn);
  report('directory modifications', dirAgg.modifications, top.modifications);

  // The subtree sums of children must not exceed the parent's totals.
  const childrenChurn = dirs.children.reduce((sum, child) => sum + child.churn, 0);
  report(
    'children churn sum <= root subtree churn (sanity)',
    true,
    childrenChurn <= selfChurn + EPS,
  );
}

async function checkAuthorMetrics(
  api: string,
  repoId: string,
  commits: OracleCommit[],
  full: OracleAggregate,
): Promise<void> {
  section('Author metrics (resolved identities)');
  const authorMetrics = await apiGet<ApiAuthorMetrics>(api, `/api/repositories/${repoId}/metrics/authors`);
  report('totalChurn equals repository churn', full.added + full.removed, authorMetrics.totalChurn);

  if (authorMetrics.totalChurn > 0 && authorMetrics.authors.length > 0) {
    const ownershipSum = authorMetrics.authors.reduce((sum, row) => sum + row.ownership, 0);
    report('ownership omega sums to 1', 1, ownershipSum, OWNERSHIP_EPS);
  }

  const identities = await apiGet<{ authors: ApiIdentity[] }>(api, `/api/repositories/${repoId}/authors`);

  // A single-ident author is one whose commit count matches the number of git
  // commits carrying its email — safe to recompute by email alone.
  const verifiable = identities.authors
    .filter((identity) => {
      const byEmail = commits.filter(
        (commit) => commit.email.toLowerCase() === identity.email.toLowerCase(),
      ).length;
      return byEmail > 0 && byEmail === identity.commitCount;
    })
    .slice(0, 3);

  if (verifiable.length === 0) {
    console.log('  SKIP  no single-identity author to verify by email');
    return;
  }

  for (const identity of verifiable) {
    const authorAgg = aggregate(commits, { authorEmail: identity.email.toLowerCase() });
    const metrics = await apiGet<ApiRepoMetrics>(
      api,
      `/api/repositories/${repoId}/metrics/repository?authorId=${encodeURIComponent(identity.id)}`,
    );
    console.log(`  info  verifying author: ${identity.name} <${identity.email}>`);
    report(`author |H| (${identity.name})`, authorAgg.commitCount, metrics.commitCount);
    report(`author added (${identity.name})`, authorAgg.added, metrics.added);
    report(`author removed (${identity.name})`, authorAgg.removed, metrics.removed);
    report(`author churn (${identity.name})`, authorAgg.added + authorAgg.removed, metrics.churn);
    report(`author modifications (${identity.name})`, authorAgg.modifications, metrics.modifications);

    const row = authorMetrics.authors.find((candidate) => candidate.id === identity.id);
    if (row) {
      report(`author row churn (${identity.name})`, authorAgg.added + authorAgg.removed, row.churn);
      report(
        `author row ownership (${identity.name})`,
        authorMetrics.totalChurn === 0 ? 0 : row.churn / authorMetrics.totalChurn,
        row.ownership,
        EPS,
      );
    }
  }
}

async function checkTimeseries(
  api: string,
  repoId: string,
  commits: OracleCommit[],
  full: OracleAggregate,
): Promise<void> {
  section('Timeseries (day buckets)');
  const series = await apiGet<{ bucket: string; points: ApiTimeseriesPoint[] }>(
    api,
    `/api/repositories/${repoId}/metrics/timeseries?bucket=day`,
  );

  const sums = series.points.reduce(
    (acc, point) => ({
      added: acc.added + point.added,
      removed: acc.removed + point.removed,
      churn: acc.churn + point.churn,
      commits: acc.commits + point.commits,
    }),
    { added: 0, removed: 0, churn: 0, commits: 0 },
  );
  report('bucketed added equals repository added', full.added, sums.added);
  report('bucketed churn equals repository churn', full.added + full.removed, sums.churn);
  report('bucketed commits equals |H|', full.commitCount, sums.commits);

  const top = [...series.points].sort((a, b) => b.churn - a.churn)[0];
  if (!top) {
    console.log('  SKIP  no buckets');
    return;
  }

  const dayStart = Math.floor(Date.parse(`${top.bucket}T00:00:00Z`) / 1000);
  const dayAgg = aggregate(commits, { fromTs: dayStart, toTs: dayStart + DAY });
  console.log(`  info  busiest day: ${top.bucket}`);
  report('day added', dayAgg.added, top.added);
  report('day removed', dayAgg.removed, top.removed);
  report('day churn', dayAgg.added + dayAgg.removed, top.churn);
  report('day commits', dayAgg.commitCount, top.commits);
}

/** Field-by-field comparison of two repository metric vectors. */
function reportRepoMetrics(label: string, expected: ApiRepoMetrics, actual: ApiRepoMetrics): void {
  report(`${label}: |H|`, expected.commitCount, actual.commitCount);
  report(`${label}: added l+`, expected.added, actual.added);
  report(`${label}: removed l-`, expected.removed, actual.removed);
  report(`${label}: growth d`, expected.growth, actual.growth);
  report(`${label}: churn lambda`, expected.churn, actual.churn);
  report(`${label}: modifications n`, expected.modifications, actual.modifications);
  report(
    `${label}: frequency eta`,
    expected.modificationFrequency,
    actual.modificationFrequency,
    EPS,
  );
  report(`${label}: churn rate rho`, expected.churnRate, actual.churnRate, EPS);
  report(`${label}: firstTs`, expected.firstTs ?? -1, actual.firstTs ?? -1);
  report(`${label}: lastTs`, expected.lastTs ?? -1, actual.lastTs ?? -1);
}

/**
 * The materialized rollups must agree with the live fact-table engine. The
 * unfiltered request is served from the rollup once it is materialized (the
 * API builds it on demand); `fromTs=0` selects the same commit set through
 * the live path — no commit has a negative timestamp — so both responses must
 * be identical.
 */
async function checkRollupAgreement(api: string, repoId: string): Promise<void> {
  section('Materialized rollups (unfiltered vs live path)');
  const rolled = await apiGet<ApiRepoMetrics>(api, `/api/repositories/${repoId}/metrics/repository`);
  const live = await apiGet<ApiRepoMetrics>(
    api,
    `/api/repositories/${repoId}/metrics/repository?fromTs=0`,
  );
  reportRepoMetrics('repository rollup vs live', live, rolled);

  const rolledFiles = await apiGet<ApiList<ApiFileRow>>(
    api,
    `/api/repositories/${repoId}/metrics/files?sort=churn&order=desc&pageSize=25`,
  );
  const liveFiles = await apiGet<ApiList<ApiFileRow>>(
    api,
    `/api/repositories/${repoId}/metrics/files?sort=churn&order=desc&pageSize=25&fromTs=0`,
  );
  report('files rollup vs live: total', liveFiles.total, rolledFiles.total);
  report(
    'files rollup vs live: rows',
    JSON.stringify(liveFiles.items),
    JSON.stringify(rolledFiles.items),
  );

  const rolledSeries = await apiGet<{ points: ApiTimeseriesPoint[] }>(
    api,
    `/api/repositories/${repoId}/metrics/timeseries?bucket=day`,
  );
  const liveSeries = await apiGet<{ points: ApiTimeseriesPoint[] }>(
    api,
    `/api/repositories/${repoId}/metrics/timeseries?bucket=day&fromTs=0`,
  );
  report(
    'day timeseries rollup vs live',
    JSON.stringify(liveSeries.points),
    JSON.stringify(rolledSeries.points),
  );

  const rolledWeek = await apiGet<{ points: ApiTimeseriesPoint[] }>(
    api,
    `/api/repositories/${repoId}/metrics/timeseries?bucket=week`,
  );
  const liveWeek = await apiGet<{ points: ApiTimeseriesPoint[] }>(
    api,
    `/api/repositories/${repoId}/metrics/timeseries?bucket=week&fromTs=0`,
  );
  report(
    'week timeseries rollup vs live',
    JSON.stringify(liveWeek.points),
    JSON.stringify(rolledWeek.points),
  );
}

/** The multi-repository compare endpoint must mirror the single-repo reads. */
async function checkCompare(
  api: string,
  primary: ApiRepository,
  all: ApiRepository[],
  compareWith: string | null,
): Promise<void> {
  section('Multi-repository compare');
  let other: ApiRepository | undefined;
  if (compareWith) {
    other =
      all.find((candidate) => candidate.id === compareWith) ??
      all.find((candidate) => candidate.name === compareWith) ??
      all.find((candidate) => candidate.name.toLowerCase() === compareWith.toLowerCase());
    if (!other) throw new Error(`--compare-with: no repository named "${compareWith}"`);
  } else {
    other = all.find((candidate) => candidate.id !== primary.id && candidate.status === 'ready');
  }
  if (!other) {
    console.log('  SKIP  no second ready repository (pass --compare-with <name-or-id>)');
    return;
  }
  if (other.status !== 'ready') {
    console.log(`  SKIP  "${other.name}" is in status "${other.status}"`);
    return;
  }
  console.log(`  info  comparing ${primary.name} vs ${other.name}`);

  const compare = await apiGet<{ repos: Array<{ id: string; metrics: ApiRepoMetrics }> }>(
    api,
    `/api/metrics/compare?repoIds=${primary.id},${other.id}`,
  );
  report(
    'compare returns two columns in request order',
    `${primary.id},${other.id}`,
    compare.repos.map((entry) => entry.id).join(','),
  );

  for (const entry of compare.repos) {
    const single = await apiGet<ApiRepoMetrics>(
      api,
      `/api/repositories/${entry.id}/metrics/repository`,
    );
    reportRepoMetrics(`compare ${entry.id}`, single, entry.metrics);
  }

  // lastDays windows must anchor to each repository's own newest commit.
  const lastDays = 30;
  const windowed = await apiGet<{ repos: Array<{ id: string; metrics: ApiRepoMetrics }> }>(
    api,
    `/api/metrics/compare?repoIds=${primary.id},${other.id}&lastDays=${lastDays}`,
  );
  for (const entry of windowed.repos) {
    const base = await apiGet<ApiRepoMetrics>(
      api,
      `/api/repositories/${entry.id}/metrics/repository`,
    );
    const expected =
      base.lastTs === null
        ? base
        : await apiGet<ApiRepoMetrics>(
            api,
            `/api/repositories/${entry.id}/metrics/repository?fromTs=${base.lastTs - lastDays * DAY}&toTs=${base.lastTs + 1}`,
          );
    reportRepoMetrics(`compare lastDays anchored ${entry.id}`, expected, entry.metrics);
  }
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.repo) {
    printUsage();
    if (!args.help) process.exitCode = 1;
    return;
  }

  const api = args.api.replace(/\/+$/, '');
  console.log('RAT metrics oracle');
  console.log(`  API:  ${api}`);
  console.log(`  Repo: ${args.repo}`);

  const list = await apiGet<{ repositories: ApiRepository[] }>(api, '/api/repositories');
  const repo =
    list.repositories.find((candidate) => candidate.id === args.repo) ??
    list.repositories.find((candidate) => candidate.name === args.repo) ??
    list.repositories.find(
      (candidate) => candidate.name.toLowerCase() === args.repo.toLowerCase(),
    );
  if (!repo) {
    throw new Error(
      `No repository named "${args.repo}" is ingested. Known repositories: ${
        list.repositories.map((candidate) => candidate.name).join(', ') || '(none)'
      }`,
    );
  }
  if (repo.status !== 'ready') {
    throw new Error(`Repository "${repo.name}" is in status "${repo.status}" — wait for "ready".`);
  }
  console.log(`  Found: ${repo.name} (${repo.id})`);

  const gitDir = resolveGitDir(args.gitDir, repo.id);
  console.log(`  Git:  ${gitDir}`);
  const commits = await loadCommits(gitDir);
  console.log(`  Parsed ${commits.length} non-merge commits from git (merges excluded)`);
  if (commits.length === 0) throw new Error('git log returned no commits.');

  const full = aggregate(commits);

  checkIngestMetadata(repo, commits);
  const fullMetrics = await checkRepositoryMetrics(api, repo.id, full);
  await checkCommitListing(api, repo.id, full);
  await checkRangeFilter(api, repo.id, commits, full);
  await checkCommitIdSelection(api, repo.id, commits);
  await checkTopFile(api, repo.id, commits, full);
  await checkDirectories(api, repo.id, commits, full, fullMetrics);
  await checkAuthorMetrics(api, repo.id, commits, full);
  await checkTimeseries(api, repo.id, commits, full);
  await checkRollupAgreement(api, repo.id);
  await checkCompare(api, repo, list.repositories, args.compareWith);

  console.log(`\n${totalChecks - failedChecks}/${totalChecks} checks passed`);
  if (failedChecks > 0) {
    console.error(`${failedChecks} check(s) FAILED — the API disagrees with the git oracle.`);
    process.exitCode = 1;
  } else {
    console.log('All metric checks passed — API matches the git oracle.');
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  if (/fetch failed|ECONNREFUSED|ENOTFOUND/i.test(message)) {
    console.error(
      '\nverifyMetrics failed: cannot reach the RAT API — start it first (npm run dev:api) and check --api.',
    );
  } else {
    console.error(`\nverifyMetrics failed: ${message}`);
  }
  process.exitCode = 1;
});
