import type { DB } from '../db/database';
import type { Config } from '../config';
import { baseGitArgs, runGit } from './gitRunner';

/**
 * Resolve raw author identities through the repository's .mailmap.
 *
 * `git check-mailmap --stdin` is fed every distinct raw ident and the resolved
 * identities are compared with the inputs. Only idents whose (name, email)
 * actually changes are stored in `mailmap_map`; resolution at query time then
 * prefers: manual merges > mailmap map > raw ident.
 *
 * Works for both extracted worktrees and bare mirror clones by reading the
 * mailmap blob from HEAD (`mailmap.blob`). Non-fatal by design: if mailmap
 * resolution fails, metrics still work with raw identities.
 */
export async function resolveMailmap(
  config: Config,
  gitDir: string,
  db: DB,
  repoId: string,
): Promise<number> {
  const idents = db
    .prepare('SELECT id, name, email FROM raw_idents WHERE repo_id = ?')
    .all(repoId) as Array<{ id: number; name: string; email: string }>;
  if (idents.length === 0) return 0;

  // Only invoke git when HEAD actually contains a .mailmap.
  const exists = await runGit([...baseGitArgs(gitDir), 'cat-file', '-e', 'HEAD:.mailmap'], {
    timeoutMs: 60_000,
  });
  if (exists.code !== 0) return 0;

  const stdin = idents.map((i) => `${i.name} <${i.email}>`).join('\n') + '\n';
  const res = await runGit(
    [...baseGitArgs(gitDir), '-c', 'mailmap.blob=HEAD:.mailmap', 'check-mailmap', '--stdin'],
    { stdin, timeoutMs: 120_000 },
  );
  if (res.code !== 0) return 0;

  const outLines = res.stdout.split('\n').filter((l) => l.trim().length > 0);
  if (outLines.length !== idents.length) return 0;

  const insert = db.prepare(
    `INSERT OR REPLACE INTO mailmap_map (repo_id, ident_id, resolved_name, resolved_email)
     VALUES (?, ?, ?, ?)`,
  );

  let mapped = 0;
  const tx = db.transaction(() => {
    idents.forEach((ident, idx) => {
      const parsed = parseIdentLine(outLines[idx]);
      if (!parsed) return;
      if (parsed.name !== ident.name || parsed.email !== ident.email) {
        insert.run(repoId, ident.id, parsed.name, parsed.email);
        mapped++;
      }
    });
  });
  tx();
  return mapped;
}

/** Parse `Name <email>` taking the LAST '<' so names containing '<' still work. */
export function parseIdentLine(line: string): { name: string; email: string } | null {
  const trimmed = line.trim();
  if (!trimmed.endsWith('>')) return null;
  const open = trimmed.lastIndexOf('<');
  if (open === -1) return null;
  const name = trimmed.slice(0, open).trim();
  const email = trimmed.slice(open + 1, -1).trim();
  if (email === '') return null;
  return { name, email };
}
