import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase, type DB } from '../../src/db/database';

export interface TempDb {
  db: DB;
  dir: string;
  cleanup(): void;
}

/**
 * Create a temporary directory for a test database. Falls back to a
 * workspace-local directory when os.tmpdir() is not writable (sandboxed CI).
 */
function makeTempDir(): string {
  const candidates = [os.tmpdir(), path.resolve(__dirname, '..', '..', '.test-tmp')];
  let lastError: unknown;
  for (const base of candidates) {
    try {
      fs.mkdirSync(base, { recursive: true });
      return fs.mkdtempSync(path.join(base, 'rat-test-'));
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('no writable temp directory');
}

/** Open a fresh SQLite database (schema applied) inside a temp directory. */
export function createTempDb(): TempDb {
  const dir = makeTempDir();
  const db = openDatabase(path.join(dir, 'test.db'));
  let closed = false;
  return {
    db,
    dir,
    cleanup(): void {
      if (!closed) {
        closed = true;
        db.close();
      }
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
