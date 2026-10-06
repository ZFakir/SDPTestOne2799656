import request from 'supertest';
import { REPO_ID, seedRepository } from '../helpers/seeds';
import { createTestContext, type TestContext } from '../helpers/testApp';

/** `/api/repositories/:repoId/authors/canonical` — the manual author-merge API. */
describe('canonical authors API', () => {
  let ctx: TestContext;

  /** Raw ident ids of the seed: [Alice (wits), Alice Smith, Bob Beta]. */
  let aliceWits: number;
  let aliceSmith: number;
  let bob: number;

  beforeEach(async () => {
    ctx = createTestContext();
    seedRepository(ctx.db);
    const res = await request(ctx.app).get(`/api/repositories/${REPO_ID}/authors`);
    const byEmail = new Map<string, number>(
      (res.body.rawIdents as Array<{ id: number; email: string }>).map((ident) => [
        ident.email,
        ident.id,
      ]),
    );
    aliceWits = byEmail.get('alice@wits.ac.za')!;
    aliceSmith = byEmail.get('alice@example.com')!;
    bob = byEmail.get('bob@example.com')!;
  });

  afterEach(() => ctx.cleanup());

  const canonicalUrl = `/api/repositories/${REPO_ID}/authors/canonical`;

  async function mergeAlice(): Promise<string> {
    const res = await request(ctx.app).post(canonicalUrl).send({
      name: 'Alice Smith',
      email: 'alice@example.com',
      identIds: [aliceWits, aliceSmith],
    });
    expect(res.status).toBe(201);
    return res.body.authors[0].id as string;
  }

  it('starts empty and lists created merges', async () => {
    const empty = await request(ctx.app).get(canonicalUrl);
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({ authors: [] });

    const id = await mergeAlice();
    const list = await request(ctx.app).get(canonicalUrl);
    expect(list.body.authors).toEqual([
      { id, name: 'Alice Smith', email: 'alice@example.com', identIds: [aliceSmith, aliceWits] },
    ]);
  });

  it('folds the merged idents into one canonical author', async () => {
    await mergeAlice();

    const res = await request(ctx.app).get(`/api/repositories/${REPO_ID}/authors`);
    expect(res.status).toBe(200);
    expect(res.body.authors).toHaveLength(2);

    const canonical = res.body.authors.find((a: { kind: string }) => a.kind === 'canonical');
    expect(canonical).toMatchObject({
      name: 'Alice Smith',
      email: 'alice@example.com',
      kind: 'canonical',
      commitCount: 6,
      rawIdentCount: 2,
    });
    expect(canonical.id).toMatch(/^canonical:/);
  });

  it('attributes metrics to the canonical author and supports authorId filters', async () => {
    const id = await mergeAlice();
    const canonicalKey = `canonical:${id}`;

    const metrics = await request(ctx.app).get(
      `/api/repositories/${REPO_ID}/metrics/authors`,
    );
    const row = (metrics.body.authors as Array<{ id: string }>).find(
      (a) => a.id === canonicalKey,
    );
    expect(row).toMatchObject({
      name: 'Alice Smith',
      email: 'alice@example.com',
      commitCount: 6,
      added: 18,
      removed: 1,
      churn: 19,
    });

    const repo = await request(ctx.app).get(
      `/api/repositories/${REPO_ID}/metrics/repository?authorId=${encodeURIComponent(canonicalKey)}`,
    );
    expect(repo.body).toMatchObject({ commitCount: 6, added: 18, removed: 1, churn: 19 });
  });

  it('rejects unknown idents, empty selections and missing fields', async () => {
    const unknown = await request(ctx.app)
      .post(canonicalUrl)
      .send({ name: 'X', email: 'x@example.com', identIds: [99_999] });
    expect(unknown.status).toBe(400);
    expect(unknown.body.message).toMatch(/Unknown raw identity ids/);

    const empty = await request(ctx.app)
      .post(canonicalUrl)
      .send({ name: 'X', email: 'x@example.com', identIds: [] });
    expect(empty.status).toBe(400);

    const noName = await request(ctx.app)
      .post(canonicalUrl)
      .send({ email: 'x@example.com', identIds: [aliceSmith] });
    expect(noName.status).toBe(400);

    const badEmail = await request(ctx.app)
      .post(canonicalUrl)
      .send({ name: 'X', email: 'not-an-email', identIds: [aliceSmith] });
    expect(badEmail.status).toBe(400);
  });

  it('refuses to steal an ident that is already merged', async () => {
    await mergeAlice();
    const res = await request(ctx.app)
      .post(canonicalUrl)
      .send({ name: 'Other', email: 'other@example.com', identIds: [aliceWits] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('IDENT_ALREADY_MERGED');
  });

  it('updates display fields and replaces the merged ident set', async () => {
    const id = await mergeAlice();

    const renamed = await request(ctx.app)
      .patch(`${canonicalUrl}/${id}`)
      .send({ name: 'Alice S.', email: 'alice.s@example.com' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.authors[0]).toMatchObject({
      name: 'Alice S.',
      email: 'alice.s@example.com',
      identIds: [aliceSmith, aliceWits],
    });

    // Move Bob's ident into the same canonical author (drops the wits ident,
    // which falls back to the mailmap layer).
    const widened = await request(ctx.app)
      .patch(`${canonicalUrl}/${id}`)
      .send({ identIds: [aliceSmith, bob] });
    expect(widened.status).toBe(200);
    expect(widened.body.authors[0].identIds).toEqual([aliceSmith, bob]);

    const authors = await request(ctx.app).get(`/api/repositories/${REPO_ID}/authors`);
    expect(authors.body.authors).toHaveLength(2);
    const canonical = authors.body.authors.find(
      (a: { id: string }) => a.id === `canonical:${id}`,
    );
    expect(canonical).toMatchObject({ commitCount: 11, rawIdentCount: 2 });

    // Shrinking back to one ident unmerges Bob (he becomes a raw author again).
    const narrowed = await request(ctx.app)
      .patch(`${canonicalUrl}/${id}`)
      .send({ identIds: [aliceSmith] });
    expect(narrowed.status).toBe(200);
    expect(narrowed.body.authors[0].identIds).toEqual([aliceSmith]);

    const after = await request(ctx.app).get(`/api/repositories/${REPO_ID}/authors`);
    expect(after.body.authors).toHaveLength(3);
    expect(after.body.authors.some((a: { id: string }) => a.id === 'mailto:bob@example.com')).toBe(
      true,
    );
  });

  it('deletes the canonical author when no idents remain merged', async () => {
    const id = await mergeAlice();
    const res = await request(ctx.app).patch(`${canonicalUrl}/${id}`).send({ identIds: [] });
    expect(res.status).toBe(200);
    expect(res.body.authors).toEqual([]);

    // Resolution falls back to the mailmap layer.
    const authors = await request(ctx.app).get(`/api/repositories/${REPO_ID}/authors`);
    const alice = authors.body.authors.find(
      (a: { id: string }) => a.id === 'mailto:alice@example.com',
    );
    expect(alice.kind).toBe('mailmap');
  });

  it('deletes a canonical author explicitly', async () => {
    const id = await mergeAlice();
    const res = await request(ctx.app).delete(`${canonicalUrl}/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.authors).toEqual([]);

    const again = await request(ctx.app).delete(`${canonicalUrl}/${id}`);
    expect(again.status).toBe(404);
    expect(again.body.code).toBe('CANONICAL_NOT_FOUND');
  });

  it('patch/delete return 404 for unknown canonical ids', async () => {
    const patch = await request(ctx.app).patch(`${canonicalUrl}/nope`).send({ name: 'X' });
    expect(patch.status).toBe(404);
    expect(patch.body.code).toBe('CANONICAL_NOT_FOUND');
  });

  it('requires a ready repository', async () => {
    seedRepository(ctx.db, { repoId: 'busy', status: 'processing' });
    const res = await request(ctx.app).get('/api/repositories/busy/authors/canonical');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('REPO_NOT_READY');
  });
});
