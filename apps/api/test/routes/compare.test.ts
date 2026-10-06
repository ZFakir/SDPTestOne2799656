import request from 'supertest';
import { BASE_TS, DAY, fixtureCommits, seedRepository } from '../helpers/seeds';
import { createTestContext, type TestContext } from '../helpers/testApp';

const A_ID = 'repo-a';
const B_ID = 'repo-b';
const DAY_SECONDS = DAY;

/** `/api/metrics/compare` — multi-repository comparison. */
describe('compare API', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
    // A: the full 12-commit fixture. B: only its first 3 commits.
    seedRepository(ctx.db, { repoId: A_ID });
    seedRepository(ctx.db, { repoId: B_ID, commits: fixtureCommits().slice(0, 3) });
  });

  afterEach(() => ctx.cleanup());

  it('returns per-repo metrics equal to the single-repo endpoints', async () => {
    const res = await request(ctx.app).get(`/api/metrics/compare?repoIds=${A_ID},${B_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.repos.map((repo: { id: string }) => repo.id)).toEqual([A_ID, B_ID]);

    for (const entry of res.body.repos as Array<{ id: string; metrics: unknown }>) {
      const single = await request(ctx.app).get(
        `/api/repositories/${entry.id}/metrics/repository`,
      );
      expect(entry.metrics).toEqual(single.body);
    }

    expect(res.body.repos[0].metrics).toMatchObject({
      commitCount: 12,
      added: 35,
      removed: 6,
      growth: 29,
      churn: 41,
      modifications: 9,
    });
    expect(res.body.repos[1].metrics).toMatchObject({
      commitCount: 3,
      added: 20,
      removed: 1,
      growth: 19,
      churn: 21,
      modifications: 3,
      firstTs: BASE_TS,
      lastTs: BASE_TS + 2 * DAY_SECONDS,
    });
  });

  it('applies an absolute timestamp range to every repository', async () => {
    const fromTs = BASE_TS + 6 * DAY_SECONDS;
    const toTs = BASE_TS + 9 * DAY_SECONDS + 1;
    const res = await request(ctx.app).get(
      `/api/metrics/compare?repoIds=${A_ID},${B_ID}&fromTs=${fromTs}&toTs=${toTs}`,
    );
    expect(res.status).toBe(200);

    // A has commits on days 6..9 inside the window; B's history ended earlier.
    expect(res.body.repos[0].metrics.commitCount).toBe(4);
    expect(res.body.repos[1].metrics).toMatchObject({
      commitCount: 0,
      added: 0,
      removed: 0,
      churn: 0,
      modifications: 0,
      firstTs: null,
      lastTs: null,
    });

    for (const entry of res.body.repos as Array<{ id: string; metrics: unknown }>) {
      const single = await request(ctx.app).get(
        `/api/repositories/${entry.id}/metrics/repository?fromTs=${fromTs}&toTs=${toTs}`,
      );
      expect(entry.metrics).toEqual(single.body);
    }
  });

  it('anchors lastDays windows to each repository’s own newest commit', async () => {
    const res = await request(ctx.app).get(
      `/api/metrics/compare?repoIds=${A_ID},${B_ID}&lastDays=7`,
    );
    expect(res.status).toBe(200);

    // A: the final 7 days of a 12-day daily history → 8 commits.
    const aLastTs = BASE_TS + 11 * DAY_SECONDS;
    const aSingle = await request(ctx.app).get(
      `/api/repositories/${A_ID}/metrics/repository?fromTs=${aLastTs - 7 * DAY_SECONDS}&toTs=${aLastTs + 1}`,
    );
    expect(res.body.repos[0].metrics).toEqual(aSingle.body);
    expect(res.body.repos[0].metrics.commitCount).toBe(8);

    // B: all 3 commits fall inside its own final 7 days.
    expect(res.body.repos[1].metrics.commitCount).toBe(3);
  });

  it('validates the request parameters', async () => {
    const missing = await request(ctx.app).get('/api/metrics/compare');
    expect(missing.status).toBe(400);

    const single = await request(ctx.app).get(`/api/metrics/compare?repoIds=${A_ID}`);
    expect(single.status).toBe(400);
    expect(single.body.message).toMatch(/at least two/);

    const duplicated = await request(ctx.app).get(
      `/api/metrics/compare?repoIds=${A_ID},${A_ID}`,
    );
    expect(duplicated.status).toBe(400);

    const tooMany = await request(ctx.app).get(
      `/api/metrics/compare?repoIds=${['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].join(',')}`,
    );
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.message).toMatch(/At most 8/);

    const unknown = await request(ctx.app).get(`/api/metrics/compare?repoIds=${A_ID},nope`);
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe('REPO_NOT_FOUND');

    const withCommitIds = await request(ctx.app).get(
      `/api/metrics/compare?repoIds=${A_ID},${B_ID}&commitIds=aa`,
    );
    expect(withCommitIds.status).toBe(400);

    const mixed = await request(ctx.app).get(
      `/api/metrics/compare?repoIds=${A_ID},${B_ID}&lastDays=7&fromTs=1`,
    );
    expect(mixed.status).toBe(400);

    const zeroDays = await request(ctx.app).get(
      `/api/metrics/compare?repoIds=${A_ID},${B_ID}&lastDays=0`,
    );
    expect(zeroDays.status).toBe(400);

    const hugeDays = await request(ctx.app).get(
      `/api/metrics/compare?repoIds=${A_ID},${B_ID}&lastDays=4000`,
    );
    expect(hugeDays.status).toBe(400);
  });

  it('rejects repositories that are not ready', async () => {
    seedRepository(ctx.db, { repoId: 'busy', status: 'processing' });
    const res = await request(ctx.app).get(`/api/metrics/compare?repoIds=${A_ID},busy`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('REPO_NOT_READY');
  });
});
