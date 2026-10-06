import request from 'supertest';
import { BASE_TS, DAY, REPO_ID, seedRepository, sha } from '../helpers/seeds';
import { createTestContext, type TestContext } from '../helpers/testApp';

/** `/api/repositories/:repoId/metrics` — all five metric categories. */
describe('metrics API', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
    seedRepository(ctx.db);
  });

  afterEach(() => ctx.cleanup());

  describe('repository metrics', () => {
    it('returns the full repository metrics', async () => {
      const res = await request(ctx.app).get(`/api/repositories/${REPO_ID}/metrics/repository`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        added: 35,
        removed: 6,
        growth: 29,
        churn: 41,
        modifications: 9,
        modificationFrequency: 0.75,
        commitCount: 12,
        firstTs: BASE_TS,
        lastTs: BASE_TS + 11 * DAY,
      });
      expect(res.body.churnRate).toBeCloseTo(41 / 12, 10);
    });

    it('applies query filters', async () => {
      const res = await request(ctx.app).get(
        `/api/repositories/${REPO_ID}/metrics/repository?fromTs=${BASE_TS + 4 * DAY}&toTs=${BASE_TS + 8 * DAY}`,
      );
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ added: 2, removed: 4, churn: 6, commitCount: 4 });
    });

    it('rejects combining commitIds with a timestamp range', async () => {
      const res = await request(ctx.app).get(
        `/api/repositories/${REPO_ID}/metrics/repository?commitIds=${sha(1)}&fromTs=1`,
      );
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION');
      expect(res.body.message).toMatch(/cannot be combined/);
    });

    it('rejects malformed commit ids', async () => {
      const res = await request(ctx.app).get(
        `/api/repositories/${REPO_ID}/metrics/repository?commitIds=zz`,
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/valid commit SHA/);
    });
  });

  describe('file metrics', () => {
    it('sorts by churn (desc) by default', async () => {
      const res = await request(ctx.app).get(`/api/repositories/${REPO_ID}/metrics/files`);
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(9);
      expect(res.body.commitCount).toBe(12);
      expect(res.body.items.map((row: { path: string }) => row.path)).toEqual([
        'src/main.c',
        'docs/readme.md',
        'README.md',
        'src/util.c',
        'src/feat.c',
        '.mailmap',
        'docs/api/ref.md',
        'docs/notes.txt',
        'src/core/helper.c',
      ]);

      const top = res.body.items[0];
      expect(top).toMatchObject({ added: 10, removed: 1, growth: 9, modifications: 2 });
      expect(top.churnRate).toBeCloseTo(11 / 12, 10);
      expect(top.modificationFrequency).toBeCloseTo(2 / 12, 10);
    });

    it('supports pathPrefix, sorting and pagination', async () => {
      const prefix = await request(ctx.app).get(
        `/api/repositories/${REPO_ID}/metrics/files?pathPrefix=src/&sort=path&order=asc`,
      );
      expect(prefix.body.total).toBe(4);
      expect(prefix.body.items.map((row: { path: string }) => row.path)).toEqual([
        'src/core/helper.c',
        'src/feat.c',
        'src/main.c',
        'src/util.c',
      ]);

      const paged = await request(ctx.app).get(
        `/api/repositories/${REPO_ID}/metrics/files?pageSize=4&page=2`,
      );
      expect(paged.body.items).toHaveLength(4);
      expect(paged.body.page).toBe(2);
    });

    it('reflects the commit-set filter in file rows', async () => {
      const res = await request(ctx.app).get(
        `/api/repositories/${REPO_ID}/metrics/files?fromTs=${BASE_TS + 4 * DAY}&toTs=${BASE_TS + 8 * DAY}`,
      );
      expect(res.body.total).toBe(2);
      expect(res.body.commitCount).toBe(4);
      expect(res.body.items.map((row: { path: string }) => row.path).sort()).toEqual([
        'docs/readme.md',
        'src/core/helper.c',
      ]);
    });

    it('rejects an unknown sort key', async () => {
      const res = await request(ctx.app).get(
        `/api/repositories/${REPO_ID}/metrics/files?sort=bogus`,
      );
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION');
    });

    it('rejects an out-of-range page size', async () => {
      const res = await request(ctx.app).get(
        `/api/repositories/${REPO_ID}/metrics/files?pageSize=999`,
      );
      expect(res.status).toBe(400);
    });
  });

  describe('directory metrics', () => {
    it('returns root children at depth 1', async () => {
      const res = await request(ctx.app).get(
        `/api/repositories/${REPO_ID}/metrics/directories`,
      );
      expect(res.status).toBe(200);
      expect(res.body.path).toBe('');
      expect(res.body.self).toMatchObject({
        added: 35,
        removed: 6,
        modifications: 9,
        modificationFrequency: 0.75,
      });
      expect(res.body.children.map((row: { path: string }) => row.path)).toEqual(['docs', 'src']);

      const docs = res.body.children[0];
      expect(docs).toMatchObject({ depth: 1, added: 8, removed: 4, modifications: 3 });
      const src = res.body.children[1];
      expect(src).toMatchObject({ depth: 1, added: 20, removed: 1, modifications: 5 });
    });

    it('includes deeper descendants when depth grows', async () => {
      const res = await request(ctx.app).get(
        `/api/repositories/${REPO_ID}/metrics/directories?depth=2`,
      );
      expect(res.body.children.map((row: { path: string }) => row.path)).toEqual([
        'docs',
        'docs/api',
        'src',
        'src/core',
      ]);
      const api = res.body.children.find((row: { path: string }) => row.path === 'docs/api');
      expect(api).toMatchObject({ depth: 2, added: 2, removed: 0, modifications: 1 });
      const core = res.body.children.find((row: { path: string }) => row.path === 'src/core');
      expect(core).toMatchObject({ depth: 2, added: 2, removed: 0, modifications: 1 });
    });

    it('drills into a subdirectory', async () => {
      const res = await request(ctx.app).get(
        `/api/repositories/${REPO_ID}/metrics/directories?path=src&depth=2`,
      );
      expect(res.status).toBe(200);
      expect(res.body.path).toBe('src');
      expect(res.body.self).toMatchObject({ added: 20, removed: 1, modifications: 5 });
      expect(res.body.children.map((row: { path: string }) => row.path)).toEqual(['src/core']);
      expect(res.body.children[0]).toMatchObject({ depth: 1, added: 2, removed: 0 });
    });

    it('validates depth and directory existence', async () => {
      const tooShallow = await request(ctx.app).get(
        `/api/repositories/${REPO_ID}/metrics/directories?depth=0`,
      );
      expect(tooShallow.status).toBe(400);

      const tooDeep = await request(ctx.app).get(
        `/api/repositories/${REPO_ID}/metrics/directories?depth=99`,
      );
      expect(tooDeep.status).toBe(400);

      const missing = await request(ctx.app).get(
        `/api/repositories/${REPO_ID}/metrics/directories?path=missing`,
      );
      expect(missing.status).toBe(404);
      expect(missing.body.code).toBe('DIR_NOT_FOUND');

      const file = await request(ctx.app).get(
        `/api/repositories/${REPO_ID}/metrics/directories?path=src/main.c`,
      );
      expect(file.status).toBe(404);
      expect(file.body.code).toBe('DIR_NOT_FOUND');
    });
  });

  describe('author metrics', () => {
    it('returns churn and ownership per resolved author', async () => {
      const res = await request(ctx.app).get(`/api/repositories/${REPO_ID}/metrics/authors`);
      expect(res.status).toBe(200);
      expect(res.body.totalChurn).toBe(41);
      expect(res.body.authors).toHaveLength(2);

      const [bob, alice] = res.body.authors;
      expect(bob).toMatchObject({
        id: 'mailto:bob@example.com',
        name: 'Bob Beta',
        email: 'bob@example.com',
        commitCount: 6,
        added: 17,
        removed: 5,
        churn: 22,
        modifications: 6,
      });
      expect(bob.ownership).toBeCloseTo(22 / 41, 10);
      expect(alice).toMatchObject({
        id: 'mailto:alice@example.com',
        name: 'Alice Smith',
        commitCount: 6,
        added: 18,
        removed: 1,
        churn: 19,
        modifications: 3,
      });
      expect(alice.ownership).toBeCloseTo(19 / 41, 10);
    });

    it('restricts ownership to a path scope', async () => {
      const res = await request(ctx.app).get(
        `/api/repositories/${REPO_ID}/metrics/authors?path=src`,
      );
      expect(res.status).toBe(200);
      expect(res.body.totalChurn).toBe(21);
      expect(res.body.authors[0]).toMatchObject({
        id: 'mailto:alice@example.com',
        churn: 14,
      });
      expect(res.body.authors[1]).toMatchObject({ id: 'mailto:bob@example.com', churn: 7 });
      expect(res.body.authors[0].ownership).toBeCloseTo(14 / 21, 10);
    });

    it('returns 404 for an unknown path', async () => {
      const res = await request(ctx.app).get(
        `/api/repositories/${REPO_ID}/metrics/authors?path=missing/file.c`,
      );
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('PATH_NOT_FOUND');
    });
  });

  describe('timeseries', () => {
    it('buckets by day by default', async () => {
      const res = await request(ctx.app).get(`/api/repositories/${REPO_ID}/metrics/timeseries`);
      expect(res.status).toBe(200);
      expect(res.body.bucket).toBe('day');
      expect(res.body.points).toHaveLength(12);
      expect(res.body.points[0]).toEqual({
        bucket: '2023-01-01',
        added: 13,
        removed: 0,
        growth: 13,
        churn: 13,
        commits: 1,
      });
      const totalAdded = res.body.points.reduce(
        (acc: number, point: { added: number }) => acc + point.added,
        0,
      );
      expect(totalAdded).toBe(35);
    });

    it('buckets by week on request', async () => {
      const res = await request(ctx.app).get(
        `/api/repositories/${REPO_ID}/metrics/timeseries?bucket=week`,
      );
      expect(res.body.bucket).toBe('week');
      expect(
        res.body.points.map((point: { bucket: string; commits: number }) => [
          point.bucket,
          point.commits,
        ]),
      ).toEqual([
        ['2023-W00', 1],
        ['2023-W01', 7],
        ['2023-W02', 4],
      ]);
    });

    it('restricts churn to a path scope', async () => {
      const res = await request(ctx.app).get(
        `/api/repositories/${REPO_ID}/metrics/timeseries?path=src`,
      );
      expect(res.status).toBe(200);
      const totalAdded = res.body.points.reduce(
        (acc: number, point: { added: number }) => acc + point.added,
        0,
      );
      expect(totalAdded).toBe(20);
    });

    it('rejects an unknown bucket size', async () => {
      const res = await request(ctx.app).get(
        `/api/repositories/${REPO_ID}/metrics/timeseries?bucket=month`,
      );
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION');
    });
  });

  describe('error paths', () => {
    it('returns 404 for an unknown repository', async () => {
      const res = await request(ctx.app).get('/api/repositories/nope/metrics/repository');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('REPO_NOT_FOUND');
    });

    it('returns 409 while the repository is not ready', async () => {
      seedRepository(ctx.db, { repoId: 'queued-repo', status: 'queued' });
      const res = await request(ctx.app).get('/api/repositories/queued-repo/metrics/repository');
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('REPO_NOT_READY');
    });
  });
});
