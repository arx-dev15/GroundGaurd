import { buildApp } from './app';
import { config } from './config/env';
import { dbManager } from './plugins/database';
import { redisManager } from './plugins/redis';
import { runMigrations } from './plugins/migrate';

const app = buildApp();

async function start() {
  try {
    // Verify/initialize DB connection and run migrations
    const dbHealth = await dbManager.checkHealth();
    if (!dbHealth.ok) {
      throw new Error(`FATAL: Database connection check failed: ${dbHealth.error}`);
    }

    // Run pending canonical schema migrations
    app.log.info('Running database migrations...');
    await runMigrations(dbManager.getPool());
    app.log.info('Database migrations verified and up to date');

    const address = await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info(`M3 API server listening at ${address}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown handling
const shutdown = async () => {
  app.log.info('Shutting down server...');
  await app.close();
  await dbManager.close();
  await redisManager.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

if (require.main === module) {
  start();
}
