import request from 'supertest';
import { deleteRepository } from '../src/db/repoStore';
import { ensureRollup, hasRollup, isUnfiltered } from '../src/metrics/rollup';
import { queryRepoMetrics } from '../src/metrics/setMetrics';
import { BASE_TS, DAY, REPO_ID, seedRepository } from './helpers/seeds';
import { createTestContext, type TestContext } from './helpers/testApp';

/**
 * The materialized rollups must always agree with the live fact-table
 * computations. Every test loads the same query twice — once served from the
 * rollup (unfiltered) and once computed live (`fromTs=0` selects the same
 * commit set through the filtered path) — and asserts the responses are
 * identical.
 */
describe('materialized rollups', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
    seedRepository(ctx.db);
  });

  afterEach(() => ctx.cleanup());

  it('builds lazily and equals the live engine for repository metrics', () => {
    expect(isUnfiltered({})).toBe(true);
    expect(isUnfiltered({ fromTs: 0 })).toBe(false);
    expect(isUnfiltered({ commitIds: ['aaaa'] })).toBe(false);
    expect(isUnfiltered({ authorId: 'mailto:x@y.z' })).toBe(false);

    const live = queryRepoMetrics(ctx.db, REPO_ID, {});
    expect(hasRollup(ctx.db, REPO_ID)).toBe(false);

    expect(ensureRollup(ctx.db, REPO_ID)).toBe(true);
    expect(ensureRollup(ctx.db, REPO_ID)).toBe(true); // idempotent
    expect(hasRollup(ctx.db, REPO_ID)).toBe(true);

    const rolled = queryRepoMetrics(ctx.db, REPO_ID, {});
    expect(rolled).toEqual(live);
    expect(rolled).toMatchObject({
      commitCount: 12,
      added: 35,
      removed: 6,
      growth: 29,
      churn: 41,
      modifications: 9,
      firstTs: BASE_TS,
      lastTs: BASE_TS + 11 * DAY,
    });
  });

  it('serves the repository endpoint identically from both paths', async () => {
    const rolled = await request(ctx.app).get(`/api/repositories/${REPO_ID}/metrics/repository`);
    const live = await request(ctx.app).get(
      `/api/repositories/${REPO_ID}/metrics/repository?fromTs=0`,
    );
    expect(rolled.status).toBe(200);
    expect(rolled.body).toEqual(live.body);
  });

  it('serves the file table identically from both paths (all sort keys)', async () => {
    for (const sort of ['path', 'added', 'removed', 'growth', 'churn', 'modifications']) {
      const query = `sort=${sort}&pageSize=200`;
      const rolled = await request(ctx.app).get(
        `/api/repositories/${REPO_ID}/metrics/files?${query}`,
      );
      const live = await request(ctx.app).get(
        `/api/repositories/${REPO_ID}/metrics/files?${query}&fromTs=0`,
      );
      expect(rolled.status).toBe(200);
      expect(rolled.body.items).toEqual(live.body.items);
      expect(rolled.body.total).toBe(live.body.total);
      expect(rolled.body.commitCount).toBe(live.body.commitCount);
    }
    // 9 distinct file paths ever touched in the fixture.
    const first = await request(ctx.app).get(
      `/api/repositories/${REPO_ID}/metrics/files?sort=path&pageSize=200`,
    );
    expect(first.body.total).toBe(9);
  });

  it('honours pathPrefix on the rollup path', async () => {
    const rolled = await request(ctx.app).get(
      `/api/repositories/${REPO_ID}/metrics/files?pathPrefix=docs/&sort=path&pageSize=200`,
    );
    const live = await request(ctx.app).get(
      `/api/repositories/${REPO_ID}/metrics/files?pathPrefix=docs/&sort=path&pageSize=200&fromTs=0`,
    );
    expect(rolled.status).toBe(200);
    expect(rolled.body.items).toEqual(live.body.items);
    expect(rolled.body.total).toBe(3);
    for (const item of rolled.body.items as Array<{ path: string }>) {
      expect(item.path.startsWith('docs/')).toBe(true);
    }
  });

  it('serves the day and week timeseries identically from both paths', async () => {
    const day = await request(ctx.app).get(`/api/repositories/${REPO_ID}/metrics/timeseries`);
    const dayLive = await request(ctx.app).get(
      `/api/repositories/${REPO_ID}/metrics/timeseries?fromTs=0`,
    );
    expect(day.body.points).toEqual(dayLive.body.points);
    expect(day.body.points).toHaveLength(12);

    const week = await request(ctx.app).get(
      `/api/repositories/${REPO_ID}/metrics/timeseries?bucket=week`,
    );
    const weekLive = await request(ctx.app).get(
      `/api/repositories/${REPO_ID}/metrics/timeseries?bucket=week&fromTs=0`,
    );
    expect(week.status).toBe(200);
    expect(week.body.points).toEqual(weekLive.body.points);
  });

  it('keeps scoped timeseries on the live path', async () => {
    // Trigger rollup materialization, then request a directory-scoped series.
    await request(ctx.app).get(`/api/repositories/${REPO_ID}/metrics/timeseries`);
    const scoped = await request(ctx.app).get(
      `/api/repositories/${REPO_ID}/metrics/timeseries?path=docs`,
    );
    expect(scoped.status).toBe(200);

    // Every commit-day appears (commits carry no path scope), but only the
    // three days whose commits touched docs/ carry churn.
    const points = scoped.body.points as Array<{ churn: number }>;
    expect(points).toHaveLength(12);
    expect(points.filter((point) => point.churn > 0)).toHaveLength(3);
  });

  it('materializes one row per file and day, and cascades on delete', () => {
    ensureRollup(ctx.db, REPO_ID);
    const count = (table: string) =>
      (ctx.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE repo_id = ?`).get(REPO_ID) as {
        n: number;
      }).n;
    expect(count('rollup_repo')).toBe(1);
    expect(count('rollup_file')).toBe(9);
    expect(count('rollup_day')).toBe(12);

    deleteRepository(ctx.db, REPO_ID);
    expect(count('rollup_repo')).toBe(0);
    expect(count('rollup_file')).toBe(0);
    expect(count('rollup_day')).toBe(0);
  });

  it('does nothing for repositories that do not exist', () => {
    expect(ensureRollup(ctx.db, 'missing')).toBe(false);
    expect(hasRollup(ctx.db, 'missing')).toBe(false);
  });
});
