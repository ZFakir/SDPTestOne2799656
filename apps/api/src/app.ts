import cors from 'cors';
import express from 'express';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { authorsRouter } from './routes/authors';
import { commitsRouter } from './routes/commits';
import { jobsRouter } from './routes/jobs';
import { metricsRouter } from './routes/metrics';
import { pathsRouter } from './routes/paths';
import { repositoriesRouter } from './routes/repositories';
import type { Services } from './services';

/**
 * Express app factory. Takes the pre-built services so route tests can inject
 * a temp SQLite database and mocked git/ingest services.
 */
export function createApp(services: Services): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'rat-api', time: Date.now() });
  });

  // Repository sub-resources share the `/api/repositories` mount; each route
  // carries its own `:repoId` path parameter.
  app.use('/api/repositories', repositoriesRouter(services));
  app.use('/api/repositories', pathsRouter(services));
  app.use('/api/repositories', commitsRouter(services));
  app.use('/api/repositories', authorsRouter(services));
  app.use('/api/repositories', metricsRouter(services));
  app.use('/api/jobs', jobsRouter(services));

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}
