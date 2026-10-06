import request from 'supertest';
import { REPO_ID, seedRepository } from '../helpers/seeds';
import { createTestContext, type TestContext } from '../helpers/testApp';

/** `/api/jobs` — ingestion job polling. */
describe('jobs API', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
  });

  afterEach(() => ctx.cleanup());

  it('returns a freshly created job', async () => {
    seedRepository(ctx.db);
    const job = ctx.services.jobStore.create(REPO_ID);

    const res = await request(ctx.app).get(`/api/jobs/${job.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: job.id,
      repoId: REPO_ID,
      type: 'ingest',
      status: 'queued',
      phase: 'pending',
      progress: 0,
      error: null,
      startedAt: null,
      finishedAt: null,
    });
    expect(typeof res.body.createdAt).toBe('number');
  });

  it('reflects progress updates', async () => {
    seedRepository(ctx.db);
    const job = ctx.services.jobStore.create(REPO_ID);
    ctx.services.jobStore.start(job.id, 'cloning', 0.1);
    ctx.services.jobStore.setProgress(job.id, 'analyzing', 0.5);
    ctx.services.jobStore.succeed(job.id);

    const res = await request(ctx.app).get(`/api/jobs/${job.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'done',
      phase: 'complete',
      progress: 1,
    });
    expect(typeof res.body.startedAt).toBe('number');
    expect(typeof res.body.finishedAt).toBe('number');
  });

  it('returns 404 for an unknown job', async () => {
    const res = await request(ctx.app).get('/api/jobs/nope');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('JOB_NOT_FOUND');
  });
});
