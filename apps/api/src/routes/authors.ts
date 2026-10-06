import { Router } from 'express';
import { z } from 'zod';
import type { AuthorsResponse, CanonicalAuthorsResponse } from '@rat/shared';
import {
  createCanonicalAuthor,
  deleteCanonicalAuthor,
  listCanonicalAuthors,
  updateCanonicalAuthor,
} from '../db/canonicalStore';
import { resolveAuthors } from '../metrics/authorMetrics';
import { parseBody } from '../middleware/validate';
import { requireReadyRepository, type Services } from '../services';
import { notFound } from '../util/errors';

const NameSchema = z.string().trim().min(1, 'name is required.').max(200, 'name is too long.');
const EmailSchema = z
  .string()
  .trim()
  .min(3, 'email is required.')
  .max(320, 'email is too long.')
  .refine((value) => /\S+@\S+/.test(value), 'email must look like an address.');
const IdentIdsSchema = z
  .array(z.number().int().positive(), { required_error: 'identIds is required.' })
  .min(1, 'select at least one raw identity.')
  .max(100_000, 'too many identities.');

const CreateCanonicalSchema = z.object({
  name: NameSchema,
  email: EmailSchema,
  identIds: IdentIdsSchema,
});

const UpdateCanonicalSchema = z
  .object({
    name: NameSchema.optional(),
    email: EmailSchema.optional(),
    // An empty list unmerges everything (and deletes the canonical author).
    identIds: z.array(z.number().int().positive()).max(100_000).optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined || value.email !== undefined || value.identIds !== undefined,
    'Provide at least one of "name", "email" or "identIds".',
  );

/**
 * `/api/repositories/:repoId/authors` — resolved authors + raw idents,
 * plus the manual canonical-author (merge) layer under `/authors/canonical`.
 */
export function authorsRouter(services: Services): Router {
  const { db } = services;
  const router = Router();

  router.get('/:repoId/authors', (req, res) => {
    const repo = requireReadyRepository(services, req.params.repoId);
    const resolved = resolveAuthors(db, repo.id);
    res.json({
      authors: resolved.authors,
      rawIdents: resolved.rawIdents,
    } satisfies AuthorsResponse);
  });

  router.get('/:repoId/authors/canonical', (req, res) => {
    const repo = requireReadyRepository(services, req.params.repoId);
    res.json({ authors: listCanonicalAuthors(db, repo.id) } satisfies CanonicalAuthorsResponse);
  });

  router.post('/:repoId/authors/canonical', (req, res) => {
    const repo = requireReadyRepository(services, req.params.repoId);
    const body = parseBody(CreateCanonicalSchema, req.body);
    createCanonicalAuthor(db, repo.id, body);
    res.status(201).json({ authors: listCanonicalAuthors(db, repo.id) } satisfies CanonicalAuthorsResponse);
  });

  router.patch('/:repoId/authors/canonical/:canonicalId', (req, res) => {
    const repo = requireReadyRepository(services, req.params.repoId);
    const body = parseBody(UpdateCanonicalSchema, req.body);
    const authors = updateCanonicalAuthor(db, repo.id, req.params.canonicalId, body);
    if (authors === undefined) {
      throw notFound(
        `Canonical author ${req.params.canonicalId} not found in this repository.`,
        'CANONICAL_NOT_FOUND',
      );
    }
    res.json({ authors } satisfies CanonicalAuthorsResponse);
  });

  router.delete('/:repoId/authors/canonical/:canonicalId', (req, res) => {
    const repo = requireReadyRepository(services, req.params.repoId);
    const authors = deleteCanonicalAuthor(db, repo.id, req.params.canonicalId);
    if (authors === undefined) {
      throw notFound(
        `Canonical author ${req.params.canonicalId} not found in this repository.`,
        'CANONICAL_NOT_FOUND',
      );
    }
    res.json({ authors } satisfies CanonicalAuthorsResponse);
  });

  return router;
}
