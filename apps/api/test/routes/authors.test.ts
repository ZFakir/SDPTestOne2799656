import request from 'supertest';
import { REPO_ID, seedRepository } from '../helpers/seeds';
import { createTestContext, type TestContext } from '../helpers/testApp';

/** `/api/repositories/:repoId/authors` — resolved authors and raw idents. */
describe('authors API', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
    seedRepository(ctx.db);
  });

  afterEach(() => ctx.cleanup());

  it('resolves authors through the mailmap and folds idents', async () => {
    const res = await request(ctx.app).get(`/api/repositories/${REPO_ID}/authors`);
    expect(res.status).toBe(200);
    expect(res.body.authors).toHaveLength(2);

    const [alice, bob] = res.body.authors;
    expect(alice).toMatchObject({
      id: 'mailto:alice@example.com',
      name: 'Alice Smith',
      email: 'alice@example.com',
      kind: 'mailmap',
      commitCount: 6,
      rawIdentCount: 2,
    });
    expect(bob).toMatchObject({
      id: 'mailto:bob@example.com',
      name: 'Bob Beta',
      email: 'bob@example.com',
      kind: 'raw',
      commitCount: 6,
      rawIdentCount: 1,
    });
  });

  it('returns every raw ident', async () => {
    const res = await request(ctx.app).get(`/api/repositories/${REPO_ID}/authors`);
    expect(res.body.rawIdents).toHaveLength(3);
    expect(res.body.rawIdents).toEqual([
      { id: expect.any(Number), name: 'Alice', email: 'alice@wits.ac.za' },
      { id: expect.any(Number), name: 'Alice Smith', email: 'alice@example.com' },
      { id: expect.any(Number), name: 'Bob Beta', email: 'bob@example.com' },
    ]);
  });

  it('returns 404 for an unknown repository', async () => {
    const res = await request(ctx.app).get('/api/repositories/nope/authors');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('REPO_NOT_FOUND');
  });
});
