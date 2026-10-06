import request from 'supertest';
import { REPO_ID, seedRepository } from '../helpers/seeds';
import { createTestContext, type TestContext } from '../helpers/testApp';

/** `/api/repositories` — upload, clone, list, detail, delete. */
describe('repositories API', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
  });

  afterEach(() => ctx.cleanup());

  it('starts with an empty list', async () => {
    const res = await request(ctx.app).get('/api/repositories');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ repositories: [] });
  });

  it('rejects an upload without a file', async () => {
    const res = await request(ctx.app).post('/api/repositories/upload');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UPLOAD_MISSING_FILE');
  });

  it('rejects a non-zip upload', async () => {
    const res = await request(ctx.app)
      .post('/api/repositories/upload')
      .attach('file', Buffer.from('hello'), 'notes.txt');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('UPLOAD_NOT_ZIP');
  });

  it('accepts a zip upload, creates a queued repo and enqueues ingestion', async () => {
    const res = await request(ctx.app)
      .post('/api/repositories/upload')
      .attach('file', Buffer.from('PK\x03\x04fake zip'), 'My Repo!.zip');

    expect(res.status).toBe(202);
    expect(res.body.repository).toMatchObject({
      name: 'My Repo',
      sourceType: 'zip',
      sourceRef: 'My Repo!.zip',
      status: 'queued',
    });
    expect(res.body.job).toMatchObject({ repoId: res.body.repository.id, status: 'queued', phase: 'pending', progress: 0 });
    expect(ctx.pipelineMock.processZip).toHaveBeenCalledTimes(1);
    expect(ctx.pipelineMock.processZip).toHaveBeenCalledWith(
      res.body.repository.id,
      res.body.job.id,
      expect.any(String),
    );

    await ctx.services.queue.idle();

    const list = await request(ctx.app).get('/api/repositories');
    expect(list.status).toBe(200);
    expect(list.body.repositories).toHaveLength(1);
    expect(list.body.repositories[0].latestJob.id).toBe(res.body.job.id);
  });

  it('accepts a clone request and derives the name from the URL', async () => {
    const res = await request(ctx.app)
      .post('/api/repositories/clone')
      .send({ url: 'https://github.com/DaveGamble/cJSON.git' });

    expect(res.status).toBe(202);
    expect(res.body.repository).toMatchObject({ name: 'cJSON', sourceType: 'url' });
    await ctx.services.queue.idle();
    expect(ctx.pipelineMock.processClone).toHaveBeenCalledWith(
      res.body.repository.id,
      res.body.job.id,
      'https://github.com/DaveGamble/cJSON.git',
    );
  });

  it('rejects a clone request with an invalid URL', async () => {
    const res = await request(ctx.app)
      .post('/api/repositories/clone')
      .send({ url: 'not-a-url' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
  });

  it('returns 404 for an unknown repository', async () => {
    const res = await request(ctx.app).get('/api/repositories/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('REPO_NOT_FOUND');
  });

  it('returns a repository with its latest job', async () => {
    seedRepository(ctx.db);
    const res = await request(ctx.app).get(`/api/repositories/${REPO_ID}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: REPO_ID,
      name: 'fixture',
      status: 'ready',
      commitCount: 12,
    });
    expect(res.body.latestJob).toBeNull();
  });

  it('deletes a repository and its data', async () => {
    seedRepository(ctx.db);
    const res = await request(ctx.app).delete(`/api/repositories/${REPO_ID}`);
    expect(res.status).toBe(204);

    const after = await request(ctx.app).get(`/api/repositories/${REPO_ID}`);
    expect(after.status).toBe(404);

    // Cascades removed the commits and stats too.
    const count = ctx.db
      .prepare('SELECT COUNT(*) AS n FROM commit_file_stats WHERE repo_id = ?')
      .get(REPO_ID) as { n: number };
    expect(count.n).toBe(0);
  });

  it('refuses to delete a repository while an ingestion job is queued', async () => {
    const created = await request(ctx.app)
      .post('/api/repositories/clone')
      .send({ url: 'https://github.com/example/keep.git' });
    const repoId = created.body.repository.id;

    const res = await request(ctx.app).delete(`/api/repositories/${repoId}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DELETE_ACTIVE_JOB');

    await ctx.services.queue.idle();
  });
});
