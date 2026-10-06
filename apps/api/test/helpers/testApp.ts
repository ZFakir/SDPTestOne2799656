import path from 'node:path';
import type express from 'express';
import { createApp } from '../../src/app';
import { ensureStorageDirs, type Config } from '../../src/config';
import type { DB } from '../../src/db/database';
import type { IngestPipeline } from '../../src/ingest/pipeline';
import { createJobStore } from '../../src/jobs/jobStore';
import { createQueue } from '../../src/jobs/queue';
import type { Services } from '../../src/services';
import { createTempDb } from './testDb';

export interface TestContext {
  app: express.Express;
  services: Services;
  db: DB;
  /** Mocked pipeline — no git is ever executed by route tests. */
  pipelineMock: {
    processZip: jest.Mock<Promise<void>, [string, string, string]>;
    processClone: jest.Mock<Promise<void>, [string, string, string]>;
  };
  cleanup(): void;
}

/**
 * Build an Express app over a fresh temp SQLite DB whose ingest pipeline is a
 * jest mock, so route tests assert routing/persistence/serialisation without
 * touching git or the real filesystem layout.
 */
export function createTestContext(): TestContext {
  const temp = createTempDb();
  const config: Config = {
    repoRoot: temp.dir,
    port: 0,
    storageDir: temp.dir,
    reposDir: path.join(temp.dir, 'repos'),
    tmpDir: path.join(temp.dir, 'tmp'),
    dbPath: path.join(temp.dir, 'test.db'),
    maxUploadBytes: 16 * 1024 * 1024,
    cloneTimeoutMs: 10_000,
    gitTimeoutMs: 10_000,
  };
  ensureStorageDirs(config);

  const pipelineMock = {
    processZip: jest.fn<Promise<void>, [string, string, string]>(async () => undefined),
    processClone: jest.fn<Promise<void>, [string, string, string]>(async () => undefined),
  };
  const services: Services = {
    config,
    db: temp.db,
    jobStore: createJobStore(temp.db),
    queue: createQueue(),
    pipeline: pipelineMock as unknown as IngestPipeline,
  };

  return {
    app: createApp(services),
    services,
    db: temp.db,
    pipelineMock,
    cleanup: () => temp.cleanup(),
  };
}
