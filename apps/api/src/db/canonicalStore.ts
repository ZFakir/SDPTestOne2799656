import crypto from 'node:crypto';
import type { CanonicalAuthorDTO, CanonicalAuthorInput } from '@rat/shared';
import type { DB } from './database';
import { badRequest, conflict } from '../util/errors';

/**
 * Manual canonical-author layer: CRUD over `canonical_authors` +
 * `author_merges`. Resolution precedence at query time stays
 * manual merge (canonical) > mailmap > raw ident.
 */

interface CanonicalRow {
  id: string;
  display_name: string;
  display_email: string;
}

/** All canonical authors of a repository with their merged ident ids. */
export function listCanonicalAuthors(db: DB, repoId: string): CanonicalAuthorDTO[] {
  const rows = db
    .prepare(
      `SELECT ca.id AS id, ca.display_name AS display_name, ca.display_email AS display_email,
              am.ident_id AS ident_id
         FROM canonical_authors ca
         LEFT JOIN author_merges am ON am.canonical_author_id = ca.id
        WHERE ca.repo_id = ?
        ORDER BY ca.display_name, ca.id, am.ident_id`,
    )
    .all(repoId) as Array<CanonicalRow & { ident_id: number | null }>;

  const byId = new Map<string, CanonicalAuthorDTO>();
  for (const row of rows) {
    let author = byId.get(row.id);
    if (!author) {
      author = { id: row.id, name: row.display_name, email: row.display_email, identIds: [] };
      byId.set(row.id, author);
    }
    if (row.ident_id !== null) author.identIds.push(row.ident_id);
  }
  return Array.from(byId.values());
}

/** Fetch a single canonical author (or undefined if it does not exist). */
export function getCanonicalAuthor(
  db: DB,
  repoId: string,
  id: string,
): CanonicalAuthorDTO | undefined {
  return listCanonicalAuthors(db, repoId).find((author) => author.id === id);
}

function uniqueIds(identIds: number[]): number[] {
  return Array.from(new Set(identIds));
}

/** Every ident id must belong to this repository. */
function assertIdentsExist(db: DB, repoId: string, identIds: number[]): void {
  const placeholders = identIds.map(() => '?').join(', ');
  const rows = db
    .prepare(`SELECT id FROM raw_idents WHERE repo_id = ? AND id IN (${placeholders})`)
    .all(repoId, ...identIds) as Array<{ id: number }>;
  if (rows.length === identIds.length) return;
  const found = new Set(rows.map((row) => row.id));
  const missing = identIds.filter((id) => !found.has(id));
  throw badRequest(`Unknown raw identity ids for this repository: ${missing.join(', ')}.`);
}

/**
 * No ident may already be merged into a different canonical author.
 * `allowedId` is the author being updated (its own current merges are fine).
 */
function assertIdentsFree(
  db: DB,
  repoId: string,
  identIds: number[],
  allowedId?: string,
): void {
  const placeholders = identIds.map(() => '?').join(', ');
  const rows = db
    .prepare(
      `SELECT ident_id FROM author_merges
        WHERE repo_id = ? AND ident_id IN (${placeholders})
          AND (? IS NULL OR canonical_author_id != ?)`,
    )
    .all(repoId, ...identIds, allowedId ?? null, allowedId ?? '') as Array<{ ident_id: number }>;
  if (rows.length === 0) return;
  throw conflict(
    `Raw identities already merged into another author: ${rows
      .map((row) => row.ident_id)
      .join(', ')}. Unmerge them first.`,
    'IDENT_ALREADY_MERGED',
  );
}

/** Create a canonical author and merge the given raw idents into it. */
export function createCanonicalAuthor(
  db: DB,
  repoId: string,
  input: CanonicalAuthorInput,
): CanonicalAuthorDTO {
  const identIds = uniqueIds(input.identIds);
  assertIdentsExist(db, repoId, identIds);
  assertIdentsFree(db, repoId, identIds);

  const id = crypto.randomUUID();
  const tx = db.transaction(() => {
    db.prepare(
      'INSERT INTO canonical_authors (id, repo_id, display_name, display_email) VALUES (?, ?, ?, ?)',
    ).run(id, repoId, input.name, input.email);
    const insert = db.prepare(
      'INSERT INTO author_merges (repo_id, ident_id, canonical_author_id) VALUES (?, ?, ?)',
    );
    for (const identId of identIds) insert.run(repoId, identId, id);
  });
  tx();
  return { id, name: input.name, email: input.email, identIds };
}

/**
 * Update a canonical author: display name/email and/or replace its set of
 * merged idents. A canonical author left with no merged idents is deleted.
 * Returns the remaining canonical authors, or undefined if the author did not
 * exist.
 */
export function updateCanonicalAuthor(
  db: DB,
  repoId: string,
  id: string,
  patch: { name?: string; email?: string; identIds?: number[] },
): CanonicalAuthorDTO[] | undefined {
  const existing = getCanonicalAuthor(db, repoId, id);
  if (!existing) return undefined;

  const identIds = patch.identIds !== undefined ? uniqueIds(patch.identIds) : undefined;
  if (identIds !== undefined && identIds.length > 0) {
    assertIdentsExist(db, repoId, identIds);
    assertIdentsFree(db, repoId, identIds, id);
  }

  const tx = db.transaction(() => {
    if (patch.name !== undefined) {
      db.prepare('UPDATE canonical_authors SET display_name = ? WHERE id = ? AND repo_id = ?').run(
        patch.name,
        id,
        repoId,
      );
    }
    if (patch.email !== undefined) {
      db.prepare('UPDATE canonical_authors SET display_email = ? WHERE id = ? AND repo_id = ?').run(
        patch.email,
        id,
        repoId,
      );
    }
    if (identIds !== undefined) {
      db.prepare('DELETE FROM author_merges WHERE repo_id = ? AND canonical_author_id = ?').run(
        repoId,
        id,
      );
      const insert = db.prepare(
        'INSERT INTO author_merges (repo_id, ident_id, canonical_author_id) VALUES (?, ?, ?)',
      );
      for (const identId of identIds) insert.run(repoId, identId, id);
      if (identIds.length === 0) {
        // An empty merge is meaningless — drop the canonical author entirely.
        db.prepare('DELETE FROM canonical_authors WHERE id = ? AND repo_id = ?').run(id, repoId);
      }
    }
  });
  tx();
  return listCanonicalAuthors(db, repoId);
}

/** Delete a canonical author and unmerge all of its idents. */
export function deleteCanonicalAuthor(db: DB, repoId: string, id: string): CanonicalAuthorDTO[] | undefined {
  const existing = getCanonicalAuthor(db, repoId, id);
  if (!existing) return undefined;
  db.prepare('DELETE FROM canonical_authors WHERE id = ? AND repo_id = ?').run(id, repoId);
  return listCanonicalAuthors(db, repoId);
}
