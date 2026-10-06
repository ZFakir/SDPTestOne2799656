import request from 'supertest';
import { createTestContext } from './helpers/testApp';
import { REPO_ID, seedRepository } from './helpers/seeds';

it('debug rollup path', async () => {
  const ctx = createTestContext();
  seedRepository(ctx.db);
  const res = await request(ctx.app).get(`/api/repositories/${REPO_ID}/metrics/repository`);
  // eslint-disable-next-line no-console
  console.log('STATUS', res.status, JSON.stringify(res.body));
  ctx.cleanup();
});
