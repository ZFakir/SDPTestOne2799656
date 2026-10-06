import { createApp } from './app';
import { loadConfig } from './config';
import { openDatabase } from './db/database';
import { createServices } from './services';

/** Bootstrap: config -> storage -> database -> services -> HTTP server. */
function main(): void {
  const config = loadConfig();
  const db = openDatabase(config.dbPath);
  const services = createServices(config, db);

  const interrupted = services.jobStore.failStale();
  if (interrupted > 0) {
    console.warn(
      `[rat] marked ${interrupted} interrupted job(s) as failed (server restart).`,
    );
  }

  const app = createApp(services);
  const server = app.listen(config.port, () => {
    console.log(`[rat] API listening on http://localhost:${config.port}`);
    console.log(`[rat] storage directory: ${config.storageDir}`);
  });

  const shutdown = (signal: string): void => {
    console.log(`[rat] ${signal} received — shutting down.`);
    server.close(() => {
      try {
        db.close();
      } catch {
        // Closing twice is harmless; nothing actionable.
      }
      process.exit(0);
    });
    // Do not wait forever for lingering connections.
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
