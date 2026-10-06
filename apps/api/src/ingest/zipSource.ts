import fs from 'node:fs';
import path from 'node:path';
import yauzl from 'yauzl';
import { badRequest } from '../util/errors';
import { assertSafeEntryName, isSymlinkEntry, safeJoin } from '../util/zipSafe';

export interface ExtractOptions {
  /** Hard cap on total uncompressed bytes (zip-bomb protection). */
  maxTotalBytes: number;
  maxEntries: number;
  onProgress?: (processedEntries: number, totalEntries: number) => void;
}

function openZip(zipPath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) reject(badRequest(`Could not open the uploaded zip: ${err?.message ?? 'unknown error'}`, 'ZIP_INVALID'));
      else resolve(zipfile);
    });
  });
}

/**
 * Stream-extract a repository zip into `destDir` with per-entry validation
 * (no absolute paths, no traversal, symlinks skipped, size-capped).
 */
export async function extractZip(
  zipPath: string,
  destDir: string,
  options: ExtractOptions,
): Promise<{ entries: number; skippedSymlinks: number }> {
  await fs.promises.mkdir(destDir, { recursive: true });
  const zipfile = await openZip(zipPath);
  const total = zipfile.entryCount;

  let processed = 0;
  let writtenBytes = 0;
  let skippedSymlinks = 0;

  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      zipfile.close();
      reject(err);
    };

    zipfile.on('error', (err) => fail(badRequest(`Zip read error: ${err.message}`, 'ZIP_INVALID')));

    zipfile.on('end', () => {
      if (settled) return;
      settled = true;
      resolve({ entries: processed, skippedSymlinks });
    });

    zipfile.on('entry', (entry: yauzl.Entry) => {
      void (async () => {
        try {
          processed++;
          if (processed > options.maxEntries) {
            throw badRequest(`Zip contains more than ${options.maxEntries} entries — refusing.`, 'ZIP_TOO_LARGE');
          }

          const name = entry.fileName;
          if (name.startsWith('__MACOSX/')) {
            zipfile.readEntry();
            return;
          }
          assertSafeEntryName(name);

          if (isSymlinkEntry(entry.externalFileAttributes)) {
            skippedSymlinks++;
            zipfile.readEntry();
            return;
          }

          const dest = safeJoin(destDir, name);

          if (name.endsWith('/')) {
            await fs.promises.mkdir(dest, { recursive: true });
            options.onProgress?.(processed, total);
            zipfile.readEntry();
            return;
          }

          await fs.promises.mkdir(path.dirname(dest), { recursive: true });
          await new Promise<void>((res, rej) => {
            zipfile.openReadStream(entry, (err, readStream) => {
              if (err || !readStream) {
                rej(badRequest(`Could not read zip entry "${name}": ${err?.message ?? 'unknown error'}`, 'ZIP_INVALID'));
                return;
              }
              const writeStream = fs.createWriteStream(dest);
              let entryBytes = 0;
              readStream.on('data', (chunk: Buffer) => {
                entryBytes += chunk.length;
                writtenBytes += chunk.length;
                if (writtenBytes > options.maxTotalBytes) {
                  readStream.destroy();
                  writeStream.destroy();
                  rej(
                    badRequest(
                      'The zip expands beyond the allowed size — refusing to extract (possible zip bomb).',
                      'ZIP_TOO_LARGE',
                    ),
                  );
                }
              });
              readStream.on('error', (e) => rej(badRequest(`Zip stream error on "${name}": ${e.message}`, 'ZIP_INVALID')));
              writeStream.on('error', (e) => rej(e));
              writeStream.on('close', () => res());
              readStream.pipe(writeStream);
            });
          });

          options.onProgress?.(processed, total);
          zipfile.readEntry();
        } catch (err) {
          fail(err);
        }
      })();
    });

    zipfile.readEntry();
  });
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function isBareRepo(p: string): boolean {
  return isFile(path.join(p, 'HEAD')) && isDir(path.join(p, 'objects')) && isDir(path.join(p, 'refs'));
}

/**
 * Locate the usable git directory inside the extraction root, breadth-first
 * (shallowest match wins), up to depth 3 to tolerate wrapper folders.
 *
 * Accepts:
 *  - a worktree containing a `.git` directory (returns the worktree root);
 *  - a bare repository layout (HEAD + objects/ + refs/).
 *
 * Rejects with an actionable message:
 *  - `.git` as a FILE (worktree pointer / submodule checkout) — unsupported;
 *  - no git directory found at all.
 */
export function findGitDir(extractRoot: string): string {
  const queue: Array<{ dir: string; depth: number }> = [{ dir: extractRoot, depth: 0 }];

  while (queue.length > 0) {
    const { dir, depth } = queue.shift()!;

    const gitEntry = path.join(dir, '.git');
    if (isDir(gitEntry)) return dir;
    if (isFile(gitEntry)) {
      const rel = path.relative(extractRoot, dir) || '.';
      throw badRequest(
        `Found a ".git" *file* (worktree pointer) at "${rel}" instead of a full repository. ` +
          'Please upload a zip produced from a full git clone (the .git directory must be included).',
        'ZIP_GIT_FILE',
      );
    }
    if (isBareRepo(dir)) return dir;

    if (depth >= 3) continue;
    let children: fs.Dirent[] = [];
    try {
      children = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      children = [];
    }
    for (const child of children) {
      if (!child.isDirectory()) continue;
      if (child.name === '.git' || child.name === '__MACOSX') continue;
      queue.push({ dir: path.join(dir, child.name), depth: depth + 1 });
    }
  }

  throw badRequest(
    'No git repository found inside the uploaded zip: the archive must contain either a ".git" directory or a bare repository layout (HEAD, objects/, refs/).',
    'ZIP_NO_GIT_DIR',
  );
}

/**
 * Extract a repository zip and return the git directory to analyse.
 */
export async function extractRepoZip(
  zipPath: string,
  destDir: string,
  options: ExtractOptions,
): Promise<string> {
  await extractZip(zipPath, destDir, options);
  return findGitDir(destDir);
}
