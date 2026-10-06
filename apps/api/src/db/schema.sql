-- RAT database schema (SQLite).
-- Every table is keyed by repo_id so multiple repositories are supported
-- without schema changes. See Design plan "Data Model".

CREATE TABLE IF NOT EXISTS repositories (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  source_type   TEXT NOT NULL CHECK (source_type IN ('zip', 'url')),
  source_ref    TEXT NOT NULL,
  storage_path  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued', 'processing', 'ready', 'error')),
  error         TEXT,
  head_sha      TEXT,
  commit_count  INTEGER,
  created_at    INTEGER NOT NULL,
  ready_at      INTEGER
);

CREATE TABLE IF NOT EXISTS jobs (
  id           TEXT PRIMARY KEY,
  repo_id      TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  type         TEXT NOT NULL DEFAULT 'ingest',
  status       TEXT NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed')),
  phase        TEXT NOT NULL DEFAULT 'pending',
  progress     REAL NOT NULL DEFAULT 0,
  error        TEXT,
  created_at   INTEGER NOT NULL,
  started_at   INTEGER,
  finished_at  INTEGER
);

-- Raw git author identities (name, email) exactly as they appear in commits.
CREATE TABLE IF NOT EXISTS raw_idents (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id  TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  name     TEXT NOT NULL,
  email    TEXT NOT NULL,
  UNIQUE (repo_id, name, email)
);

-- Non-merge commits reachable from the ingested HEAD. `ts` = committer date.
CREATE TABLE IF NOT EXISTS commits (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id       TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  sha           TEXT NOT NULL,
  parent_sha    TEXT,
  ts            INTEGER NOT NULL,
  raw_ident_id  INTEGER NOT NULL REFERENCES raw_idents(id),
  UNIQUE (repo_id, sha)
);

-- Single fact table: per-commit line statistics per file path.
-- created = added lines, removed = removed lines (numstat semantics).
-- Binary files produce no rows; rename-only changes (0/0) produce no rows.
-- Deleted files are recorded as (0, N) on the deleted path.
CREATE TABLE IF NOT EXISTS commit_file_stats (
  repo_id    TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  commit_id  INTEGER NOT NULL REFERENCES commits(id) ON DELETE CASCADE,
  path       TEXT NOT NULL,
  added      INTEGER NOT NULL,
  removed    INTEGER NOT NULL,
  PRIMARY KEY (commit_id, path)
) WITHOUT ROWID;

-- Resolved ident -> canonical (name, email) from the repository .mailmap.
-- Only idents whose identity actually changes are stored.
-- Author resolution precedence at query time: author_merges > mailmap_map > raw idents.
CREATE TABLE IF NOT EXISTS mailmap_map (
  repo_id         TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  ident_id        INTEGER NOT NULL REFERENCES raw_idents(id) ON DELETE CASCADE,
  resolved_name   TEXT NOT NULL,
  resolved_email  TEXT NOT NULL,
  PRIMARY KEY (repo_id, ident_id)
);

-- Manually created canonical authors (used by the author-merge tier).
CREATE TABLE IF NOT EXISTS canonical_authors (
  id             TEXT PRIMARY KEY,
  repo_id        TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  display_name   TEXT NOT NULL,
  display_email  TEXT NOT NULL
);

-- Manual merges of raw idents into a canonical author.
CREATE TABLE IF NOT EXISTS author_merges (
  repo_id             TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  ident_id            INTEGER NOT NULL REFERENCES raw_idents(id) ON DELETE CASCADE,
  canonical_author_id TEXT NOT NULL REFERENCES canonical_authors(id) ON DELETE CASCADE,
  PRIMARY KEY (repo_id, ident_id)
);

-- Derived cache: every directory path that ever existed in the history
-- (the repository root, "", is implicit and not stored).
CREATE TABLE IF NOT EXISTS repo_dirs (
  repo_id  TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  path     TEXT NOT NULL,
  PRIMARY KEY (repo_id, path)
);

CREATE INDEX IF NOT EXISTS idx_commits_repo_ts     ON commits (repo_id, ts);
CREATE INDEX IF NOT EXISTS idx_commits_repo_ident  ON commits (repo_id, raw_ident_id);
CREATE INDEX IF NOT EXISTS idx_file_stats_repo_path ON commit_file_stats (repo_id, path);
CREATE INDEX IF NOT EXISTS idx_file_stats_commit    ON commit_file_stats (commit_id);
CREATE INDEX IF NOT EXISTS idx_jobs_repo            ON jobs (repo_id, created_at);
