import path from 'node:path';

/**
 * Zip entry validation helpers.
 *
 * Extracted entries must never escape the extraction root: absolute paths,
 * drive letters, `..` segments and (belt-and-braces) a final containment check
 * on the resolved path are all enforced.
 */

export function assertSafeEntryName(fileName: string): void {
  if (!fileName || fileName.includes('\0')) {
    throw new Error(`Zip contains an invalid entry name.`);
  }
  if (fileName.startsWith('/') || fileName.startsWith('\\')) {
    throw new Error(`Zip contains an absolute path entry ("${fileName}") — refusing to extract.`);
  }
  if (/^[a-zA-Z]:/.test(fileName)) {
    throw new Error(`Zip contains a drive-letter entry ("${fileName}") — refusing to extract.`);
  }
  const segments = fileName.split(/[\\/]+/);
  if (segments.includes('..')) {
    throw new Error(`Zip contains a path traversal entry ("${fileName}") — refusing to extract.`);
  }
}

/** Resolve the on-disk destination and verify it stays inside `destDir`. */
export function safeJoin(destDir: string, entryName: string): string {
  const normalized = path.normalize(entryName).replace(/^([/\\])+/, '');
  const dest = path.resolve(destDir, normalized);
  const root = path.resolve(destDir);
  if (dest !== root && !dest.startsWith(root + path.sep)) {
    throw new Error(`Zip entry "${entryName}" escapes the extraction directory — refusing.`);
  }
  return dest;
}

/** True when the entry's Unix mode marks it as a symbolic link. */
export function isSymlinkEntry(externalFileAttributes: number): boolean {
  const mode = (externalFileAttributes >>> 16) & 0xffff;
  return (mode & 0xf000) === 0xa000;
}
