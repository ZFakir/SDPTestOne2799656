import type { DB } from './database';

export interface RepositoryRow {
  id: string;
  name: string;
  source_type: 'zip' | 'url';
  source_ref: string;
  storage_path: string;
  status: 'queued' | 'processing' | 'ready' | 'error';
  error: string | null;
  head_sha: string | null;
  commit_count: number | null;
  created_at: number;
  ready_at: number | null;
}

export interface CreateRepositoryInput {
  id: string;
  name: string;
  sourceType: 'zip' | 'url';
  sourceRef: string;
  storagePath: string;
}

export function createRepository(db: DB, input: CreateRepositoryInput): RepositoryRow {
  db.prepare(
    `INSERT INTO repositories (id, name, source_type, source_ref, storage_path, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'queued', ?)`,
  ).run(input.id, input.name, input.sourceType, input.sourceRef, input.storagePath, Date.now());
  return getRepository(db, input.id)!;
}

export function getRepository(db: DB, id: string): RepositoryRow | undefined {
  return db.prepare('SELECT * FROM repositories WHERE id = ?').get(id) as RepositoryRow | undefined;
}

export function listRepositories(db: DB): RepositoryRow[] {
  return db
    .prepare('SELECT * FROM repositories ORDER BY created_at DESC')
    .all() as RepositoryRow[];
}

export function deleteRepository(db: DB, id: string): void {
  // Foreign keys cascade to jobs, idents, commits, file stats, maps and dirs.
  db.prepare('DELETE FROM repositories WHERE id = ?').run(id);
}

export function markProcessing(db: DB, id: string): void {
  db.prepare(`UPDATE repositories SET status = 'processing', error = NULL WHERE id = ?`).run(id);
}

export function markReady(db: DB, id: string, headSha: string, commitCount: number): void {
  db.prepare(
    `UPDATE repositories
        SET status = 'ready', head_sha = ?, commit_count = ?, error = NULL, ready_at = ?
      WHERE id = ?`,
  ).run(headSha, commitCount, Date.now(), id);
}

export function markError(db: DB, id: string, message: string): void {
  db.prepare(`UPDATE repositories SET status = 'error', error = ? WHERE id = ?`).run(message, id);
}
