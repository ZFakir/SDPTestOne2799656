import fs from 'node:fs';
import { openDatabase } from './src/db/database';

process.env.RAT_STORAGE_DIR = '/tmp/rollup-debug';
fs.rmSync('/tmp/rollup-debug', { recursive: true, force: true });

const db = openDatabase('/tmp/rollup-debug/test.db');
db.prepare(
  `INSERT INTO repositories (id, name, source_type, source_ref, storage_path, status, created_at)
   VALUES ('r1', 'r', 'zip', 'f.zip', './x', 'ready', 1)`,
).run();
db.prepare(`INSERT INTO raw_idents (repo_id, name, email) VALUES ('r1', 'A', 'a@x')`).run();
db.prepare(
  `INSERT INTO commits (repo_id, sha, parent_sha, ts, raw_ident_id) VALUES ('r1', 'aa', NULL, 1672574400, 1)`,
).run();
db.prepare(
  `INSERT INTO commit_file_stats (repo_id, commit_id, path, added, removed) VALUES ('r1', 1, 'a.c', 3, 0)`,
).run();

const statements: Array<[string, unknown[]]> = [
  [
    `INSERT INTO rollup_repo (repo_id, commit_count, first_ts, last_ts, added, removed, modifications)
     SELECT ?, COUNT(*), MIN(ts), MAX(ts) FROM commits WHERE repo_id = ?`,
    ['r1', 'r1'],
  ],
  [
    `UPDATE rollup_repo
        SET added = (SELECT COALESCE(SUM(added), 0) FROM commit_file_stats WHERE repo_id = ?),
            removed = (SELECT COALESCE(SUM(removed), 0) FROM commit_file_stats WHERE repo_id = ?),
            modifications = (
              SELECT COUNT(DISTINCT CASE WHEN added + removed > 0 THEN commit_id END)
                FROM commit_file_stats WHERE repo_id = ?
            )
      WHERE repo_id = ?`,
    ['r1', 'r1', 'r1', 'r1'],
  ],
  [
    `INSERT INTO rollup_file (repo_id, path, added, removed, modifications)
     SELECT repo_id, path, SUM(added), SUM(removed),
            COUNT(DISTINCT CASE WHEN added + removed > 0 THEN commit_id END)
       FROM commit_file_stats
      WHERE repo_id = ?
      GROUP BY path`,
    ['r1'],
  ],
  [
    `INSERT INTO rollup_day (repo_id, day, commits, added, removed)
     SELECT c.repo_id,
            strftime('%Y-%m-%d', c.ts, 'unixepoch') AS day,
            COUNT(DISTINCT c.id) AS commits,
            COALESCE(SUM(s.added), 0) AS added,
            COALESCE(SUM(s.removed), 0) AS removed
       FROM commits c
       LEFT JOIN commit_file_stats s ON s.commit_id = c.id
      WHERE c.repo_id = ?
      GROUP BY day`,
    ['r1'],
  ],
];

statements.forEach(([sql, params], index) => {
  try {
    db.prepare(sql).run(...params);
    console.log(`stmt${index + 1} OK`);
  } catch (err) {
    console.error(`stmt${index + 1} FAIL:`, err instanceof Error ? err.message : err);
  }
});

console.log('rollup_repo:', db.prepare('SELECT * FROM rollup_repo').all());
console.log('rollup_file:', db.prepare('SELECT * FROM rollup_file').all());
console.log('rollup_day:', db.prepare('SELECT * FROM rollup_day').all());
