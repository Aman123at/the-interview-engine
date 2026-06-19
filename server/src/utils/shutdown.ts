import type { Server as HttpServer } from 'node:http';
import type { Server as IOServer } from 'socket.io';
import { config } from '@/config/index.js';
import { logger } from '@/utils/logger.js';

export interface ShutdownDeps {
  httpServer: HttpServer;
  io: IOServer;
  closeDb?: () => Promise<void>;
  /**
   * Phase 6: lifecycleService.stop() (unsubscribe Docker events) AND
   * sessionService.handleShutdown() (mark running sessions recoverable,
   * stop their containers cleanly, leave volumes intact). Pass both via
   * this single hook so the order is deterministic.
   */
  stopContainers?: () => Promise<void>;
}

let shuttingDown = false;

export function registerGracefulShutdown(deps: ShutdownDeps): void {
  const handle = (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      logger.warn({ signal }, 'shutdown already in progress');
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, 'graceful shutdown starting');

    const timeout = setTimeout(() => {
      logger.error(
        { timeoutMs: config.SHUTDOWN_TIMEOUT_MS },
        'graceful shutdown timed out — forcing exit',
      );
      process.exit(1);
    }, config.SHUTDOWN_TIMEOUT_MS);
    timeout.unref();

    void (async () => {
      try {
        // 1. Stop accepting new HTTP connections.
        await new Promise<void>((resolve) => {
          deps.httpServer.close((err) => {
            if (err) logger.error({ err }, 'error closing http server');
            resolve();
          });
        });
        logger.info('http server closed');

        // 2. Disconnect sockets + close socket.io.
        await new Promise<void>((resolve) => {
          deps.io.close(() => resolve());
        });
        logger.info('socket.io closed');

        // 3. Stop running containers (Phase 6 will provide this).
        if (deps.stopContainers) {
          try {
            await deps.stopContainers();
            logger.info('containers stopped');
          } catch (err) {
            logger.error({ err }, 'error stopping containers');
          }
        }

        // 4. Drain DB pool (Phase 1 will provide this).
        if (deps.closeDb) {
          try {
            await deps.closeDb();
            logger.info('db pool closed');
          } catch (err) {
            logger.error({ err }, 'error closing db pool');
          }
        }

        clearTimeout(timeout);
        logger.info('graceful shutdown complete');
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'unexpected error during shutdown');
        clearTimeout(timeout);
        process.exit(1);
      }
    })();
  };

  process.on('SIGTERM', handle);
  process.on('SIGINT', handle);

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'unhandledRejection');
  });
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaughtException — exiting');
    process.exit(1);
  });
}
