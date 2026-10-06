import type { DB } from '../../src/db/database';
import { markReady } from '../../src/db/repoStore';

/**
 * Hand-computed seed scenario that mirrors scripts/makeFixtureRepo.sh:
 * 12 non-merge commits, 2 resolved authors (one via .mailmap), a rename-only
 * commit, a binary-only commit, an empty commit, a deletion and nested dirs.
 *
 * Expected repository metrics over all commits:
 *   added=35 removed=6 growth=29 churn=41 modifications=9 |H|=12
 */
export const REPO_ID = 'seed-repo-1';
/** 2023-01-01T12:00:00Z */
export const BASE_TS = 1672574400;
export const DAY = 86400;

export interface SeedFileStat {
  path: string;
  added: number;
  removed: number;
}

export interface SeedCommit {
  sha: string;
  ts: number;
  name: string;
  email: string;
  files: SeedFileStat[];
}

export interface SeedMailmapEntry {
  name: string;
  email: string;
  resolvedName: string;
  resolvedEmail: string;
}

export interface SeedOptions {
  repoId?: string;
  status?: 'queued' | 'processing' | 'ready' | 'error';
  commits?: SeedCommit[];
  mailmap?: SeedMailmapEntry[];
}

/** Deterministic 40-char hex sha for commit number n (1-based). */
export function sha(n: number): string {
  return n.toString(16).padStart(2, '0').repeat(20);
}

const ALICE = { name: 'Alice Smith', email: 'alice@example.com' };
const ALICE_VARIANT = { name: 'Alice', email: 'alice@wits.ac.za' };
const BOB = { name: 'Bob Beta', email: 'bob@example.com' };

/** The 12 non-merge commits of the fixture scenario, in chronological order. */
export function fixtureCommits(): SeedCommit[] {
  const commits: Array<{ author: { name: string; email: string }; files: SeedFileStat[] }> = [
    {
      author: ALICE,
      files: [
        { path: '.mailmap', added: 2, removed: 0 },
        { path: 'README.md', added: 3, removed: 0 },
        { path: 'src/main.c', added: 8, removed: 0 },
      ],
    },
    { author: BOB, files: [{ path: 'src/util.c', added: 5, removed: 0 }] },
    { author: ALICE_VARIANT, files: [{ path: 'src/main.c', added: 2, removed: 1 }] },
    {
      author: BOB,
      files: [
        { path: 'docs/readme.md', added: 4, removed: 0 },
        { path: 'docs/api/ref.md', added: 2, removed: 0 },
      ],
    },
    { author: ALICE, files: [] }, // rename-only commit
    { author: BOB, files: [{ path: 'src/core/helper.c', added: 2, removed: 0 }] },
    { author: ALICE, files: [] }, // binary-only commit
    { author: BOB, files: [{ path: 'docs/readme.md', added: 0, removed: 4 }] },
    { author: ALICE, files: [] }, // empty commit
    { author: BOB, files: [{ path: 'README.md', added: 2, removed: 1 }] },
    { author: ALICE, files: [{ path: 'src/feat.c', added: 3, removed: 0 }] },
    { author: BOB, files: [{ path: 'docs/notes.txt', added: 2, removed: 0 }] },
  ];
  return commits.map((commit, index) => ({
    sha: sha(index + 1),
    ts: BASE_TS + index * DAY,
    name: commit.author.name,
    email: commit.author.email,
    files: commit.files,
  }));
}

/** Default .mailmap of the fixture: the variant ident resolves to Alice. */
export function fixtureMailmap(): SeedMailmapEntry[] {
  return [
    {
      name: ALICE_VARIANT.name,
      email: ALICE_VARIANT.email,
      resolvedName: ALICE.name,
      resolvedEmail: ALICE.email,
    },
  ];
}

function collectDirs(filePath: string, dirs: Set<string>): void {
  let idx = filePath.lastIndexOf('/');
  while (idx > 0) {
    dirs.add(filePath.slice(0, idx));
    idx = filePath.lastIndexOf('/', idx - 1);
  }
}

/**
 * Insert a fully-analysed repository directly into the database (bypassing
 * git), so metric expectations are hand-computed and git-independent.
 */
export function seedRepository(db: DB, options: SeedOptions = {}): string {
  const repoId = options.repoId ?? REPO_ID;
  const commits = options.commits ?? fixtureCommits();
  const mailmap = options.mailmap ?? fixtureMailmap();

  db.prepare(
    `INSERT INTO repositories (id, name, source_type, source_ref, storage_path, status, created_at)
     VALUES (?, ?, 'zip', 'fixture.zip', './storage/seed', ?, ?)`,
  ).run(repoId, 'fixture', options.status ?? 'ready', Date.now());

  const insertIdent = db.prepare(
    'INSERT OR IGNORE INTO raw_idents (repo_id, name, email) VALUES (?, ?, ?)',
  );
  const selectIdent = db.prepare(
    'SELECT id FROM raw_idents WHERE repo_id = ? AND name = ? AND email = ?',
  );
  const insertCommit = db.prepare(
    `INSERT INTO commits (repo_id, sha, parent_sha, ts, raw_ident_id) VALUES (?, ?, ?, ?, ?)`,
  );
  const insertStat = db.prepare(
    `INSERT INTO commit_file_stats (repo_id, commit_id, path, added, removed) VALUES (?, ?, ?, ?, ?)`,
  );
  const insertMailmap = db.prepare(
    `INSERT OR REPLACE INTO mailmap_map (repo_id, ident_id, resolved_name, resolved_email)
     VALUES (?, ?, ?, ?)`,
  );
  const insertDir = db.prepare('INSERT OR IGNORE INTO repo_dirs (repo_id, path) VALUES (?, ?)');

  const dirs = new Set<string>();
  const tx = db.transaction(() => {
    commits.forEach((commit, index) => {
      insertIdent.run(repoId, commit.name, commit.email);
      const identId = (selectIdent.get(repoId, commit.name, commit.email) as { id: number }).id;
      const parentSha = index === 0 ? null : commits[index - 1].sha;
      const info = insertCommit.run(repoId, commit.sha, parentSha, commit.ts, identId);
      const commitId = Number(info.lastInsertRowid);
      for (const file of commit.files) {
        insertStat.run(repoId, commitId, file.path, file.added, file.removed);
        collectDirs(file.path, dirs);
      }
    });
    for (const entry of mailmap) {
      insertIdent.run(repoId, entry.name, entry.email);
      const identId = (selectIdent.get(repoId, entry.name, entry.email) as { id: number }).id;
      insertMailmap.run(repoId, identId, entry.resolvedName, entry.resolvedEmail);
    }
    for (const dir of dirs) insertDir.run(repoId, dir);
  });
  tx();

  if ((options.status ?? 'ready') === 'ready') {
    markReady(db, repoId, commits[commits.length - 1]?.sha ?? sha(1), commits.length);
  }
  return repoId;
}
