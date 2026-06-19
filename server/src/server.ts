import { createServer } from 'node:http';
import { config, corsOrigins } from '@/config/index.js';
import { logger } from '@/utils/logger.js';
import { createApp } from '@/app.js';
import { createSocketServer } from '@/ws/index.js';
import { registerGracefulShutdown } from '@/utils/shutdown.js';
import { closeDb, pingDb } from '@/db/connection.js';
import { pingDocker } from '@/services/containerService.js';
import { portPool } from '@/services/portPool.js';
import { lifecycleService } from '@/services/lifecycleService.js';
import { sessionService } from '@/services/sessionService.js';
import { reaperService } from '@/services/reaperService.js';

async function main(): Promise<void> {
  const app = createApp();
  const httpServer = createServer(app);
  const io = createSocketServer(httpServer);

  const dbOk = await pingDb();
  if (!dbOk) logger.warn('database ping failed at boot — continuing, /readyz will reflect this');

  const dockerOk = await pingDocker();
  if (!dockerOk) logger.warn('docker ping failed at boot — orchestration will fail until docker is up');

  // Hydrate the port pool from currently-allocated sessions BEFORE we open
  // the API so a /sessions POST that lands during boot can't double-allocate.
  await portPool.hydrate();

  // Start docker event subscription + stats poller.
  lifecycleService.start();

  // Reaper runs boot reconciliation then periodic cleanup. Awaited so
  // the recovery scan finishes before we accept traffic.
  await reaperService.start();

  registerGracefulShutdown({
    httpServer,
    io,
    closeDb,
    stopContainers: async () => {
      await reaperService.stop();
      await sessionService.handleShutdown();
      await lifecycleService.stop();
    },
  });

  httpServer.listen(config.PORT, () => {
    logger.info(
      { port: config.PORT, env: config.NODE_ENV, previewMode: config.PREVIEW_MODE, corsOrigins },
      'interview-sandbox-server listening',
    );
  });
}

void main();
