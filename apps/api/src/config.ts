import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

/**
 * Repository root, resolved from this file's location so that it works both
 * when running from source (tsx) and from the compiled `dist/` output.
 * src/config.ts -> apps/api -> apps -> <repo root>
 * dist/config.js -> apps/api -> apps -> <repo root>
 */
const repoRoot = path.resolve(__dirname, '..', '..', '..');

/** Load `.env` from the repo root (preferred) or the current working directory. */
function loadDotenv(): void {
  const candidates = [path.join(repoRoot, '.env'), path.resolve(process.cwd(), '.env')];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate });
      return;
    }
  }
}

loadDotenv();

export interface Config {
  repoRoot: string;
  port: number;
  /** Absolute path of the storage root (uploads, repos, SQLite DB). */
  storageDir: string;
  /** Absolute path of `storage/repos` — one directory per ingested repository. */
  reposDir: string;
  /** Absolute path of `storage/tmp` — staging area for uploaded zips. */
  tmpDir: string;
  /** Absolute path of the SQLite database file. */
  dbPath: string;
  maxUploadBytes: number;
  cloneTimeoutMs: number;
  /** Timeout for analysis commands (git log over the whole history). */
  gitTimeoutMs: number;
}

function intFromEnv(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = intFromEnv(env.API_PORT, 4000);
  const storageRaw = env.RAT_STORAGE_DIR?.trim() || './storage';
  const storageDir = path.isAbsolute(storageRaw) ? storageRaw : path.resolve(repoRoot, storageRaw);
  const maxUploadBytes = intFromEnv(env.MAX_UPLOAD_MB, 512) * 1024 * 1024;
  const cloneTimeoutMs = intFromEnv(env.CLONE_TIMEOUT_MS, 30 * 60_000);

  return {
    repoRoot,
    port,
    storageDir,
    reposDir: path.join(storageDir, 'repos'),
    tmpDir: path.join(storageDir, 'tmp'),
    dbPath: path.join(storageDir, 'rat.db'),
    maxUploadBytes,
    cloneTimeoutMs,
    gitTimeoutMs: 30 * 60_000,
  };
}

export function ensureStorageDirs(config: Config): void {
  fs.mkdirSync(config.reposDir, { recursive: true });
  fs.mkdirSync(config.tmpDir, { recursive: true });
}
