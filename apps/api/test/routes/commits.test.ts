import request from 'supertest';
import { BASE_TS, REPO_ID, seedRepository, sha } from '../helpers/seeds';
import { createTestContext, type TestContext } from '../helpers/testApp';

/** `/api/repositories/:repoId/commits` — list, search, pagination, stats. */
describe('commits API', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
    seedRepository(ctx.db);
  });

  afterEach(() => ctx.cleanup());

  it('lists commits newest first with resolved authors', async () => {
    const res = await request(ctx.app).get(`/api/repositories/${REPO_ID}/commits`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(12);
    expect(res.body.commitCount).toBe(12);
    expect(res.body.items).toHaveLength(12);

    const [newest] = res.body.items;
    expect(newest).toMatchObject({
      sha: sha(12),
      ts: BASE_TS + 11 * 86400,
      authorId: 'mailto:bob@example.com',
      authorName: 'Bob Beta',
      authorEmail: 'bob@example.com',
    });

    const oldest = res.body.items[11];
    expect(oldest).toMatchObject({
      sha: sha(1),
      parentSha: null,
      authorId: 'mailto:alice@example.com',
      authorName: 'Alice Smith',
    });
  });

  it('paginates', async () => {
    const page1 = await request(ctx.app).get(
      `/api/repositories/${REPO_ID}/commits?page=1&pageSize=3`,
    );
    expect(page1.body.items).toHaveLength(3);
    expect(page1.body.total).toBe(12);
    expect(page1.body.page).toBe(1);
    expect(page1.body.pageSize).toBe(3);
    expect(page1.body.items.map((item: { sha: string }) => item.sha)).toEqual([
      sha(12),
      sha(11),
      sha(10),
    ]);

    const page2 = await request(ctx.app).get(
      `/api/repositories/${REPO_ID}/commits?page=2&pageSize=3`,
    );
    expect(page2.body.items.map((item: { sha: string }) => item.sha)).toEqual([
      sha(9),
      sha(8),
      sha(7),
    ]);
  });

  it('searches by sha prefix', async () => {
    const res = await request(ctx.app).get(
      `/api/repositories/${REPO_ID}/commits?q=${sha(1).slice(0, 4)}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].sha).toBe(sha(1));
  });

  it('searches by resolved author name/email', async () => {
    const alice = await request(ctx.app).get(`/api/repositories/${REPO_ID}/commits?q=alice`);
    expect(alice.body.total).toBe(6);
    expect(alice.body.commitCount).toBe(12);

    const bob = await request(ctx.app).get(`/api/repositories/${REPO_ID}/commits?q=bob`);
    expect(bob.body.total).toBe(6);

    const none = await request(ctx.app).get(`/api/repositories/${REPO_ID}/commits?q=zed`);
    expect(none.body.total).toBe(0);
    expect(none.body.items).toEqual([]);
  });

  it('applies commit-set filters to the list', async () => {
    const res = await request(ctx.app).get(
      `/api/repositories/${REPO_ID}/commits?authorId=mailto:bob@example.com`,
    );
    expect(res.body.total).toBe(6);

    const ranged = await request(ctx.app).get(
      `/api/repositories/${REPO_ID}/commits?fromTs=${BASE_TS}&toTs=${BASE_TS + 2 * 86400}`,
    );
    expect(ranged.body.commitCount).toBe(2);
    expect(ranged.body.items.map((item: { sha: string }) => item.sha)).toEqual([sha(2), sha(1)]);
  });

  it('returns per-commit file stats', async () => {
    const res = await request(ctx.app).get(
      `/api/repositories/${REPO_ID}/commits/${sha(1)}/stats`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      sha: sha(1),
      parentSha: null,
      authorName: 'Alice Smith',
      authorEmail: 'alice@example.com',
    });
    expect(res.body.files).toEqual([
      { path: '.mailmap', added: 2, removed: 0 },
      { path: 'README.md', added: 3, removed: 0 },
      { path: 'src/main.c', added: 8, removed: 0 },
    ]);
  });

  it('accepts an upper-case sha and returns empty stats for empty commits', async () => {
    const res = await request(ctx.app).get(
      `/api/repositories/${REPO_ID}/commits/${sha(9).toUpperCase()}/stats`,
    );
    expect(res.status).toBe(200);
    expect(res.body.sha).toBe(sha(9));
    expect(res.body.files).toEqual([]);
  });

  it('returns 404 for an unknown commit', async () => {
    const res = await request(ctx.app).get(
      `/api/repositories/${REPO_ID}/commits/${'f'.repeat(40)}/stats`,
    );
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('COMMIT_NOT_FOUND');
  });

  it('returns 409 for a repository that is not ready', async () => {
    seedRepository(ctx.db, { repoId: 'queued-repo', status: 'queued' });
    const res = await request(ctx.app).get('/api/repositories/queued-repo/commits');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('REPO_NOT_READY');
  });
});
