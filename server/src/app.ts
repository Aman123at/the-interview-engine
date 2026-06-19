import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { corsOrigins } from '@/config/index.js';
import { logger } from '@/utils/logger.js';
import { requestId } from '@/middleware/requestId.js';
import { errorHandler, notFoundHandler } from '@/middleware/errorHandler.js';
import { healthRouter } from '@/routes/health.js';
import { authRouter } from '@/routes/auth.js';
import { configRouter } from '@/routes/config.js';
import { sessionsRouter } from '@/routes/sessions.js';
import { shareRouter } from '@/routes/share.js';
import { adminRouter } from '@/routes/admin.js';
import { staffSharedRouter } from '@/routes/adminStaff.js';
import { candidatesRouter } from '@/routes/candidates.js';
import { interviewerRouter } from '@/routes/interviewer.js';
import { hrRouter } from '@/routes/hr.js';
import { designDocsRouter } from '@/routes/designDocs.js';
import { designShareRouter } from '@/routes/designShare.js';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).id ?? '',
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  app.use(helmet());
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  app.use(healthRouter);
  app.use(configRouter);
  app.use(authRouter);
  app.use(shareRouter); // public, token-scoped candidate endpoints (no auth)
  app.use(designShareRouter); // public, token-scoped design guest endpoints (no auth)
  app.use(sessionsRouter);
  app.use(designDocsRouter);
  // adminRouter is path-scoped to /admin so its `requireRole('admin')` chain
  // ONLY runs on /admin/* requests (not on every request reaching the app).
  app.use('/admin', adminRouter);
  // Phase 30c: interviewer-mgmt + interview-type catalogue — admin OR hr.
  // The router applies its own `requireAuth, requireRole('admin','hr')`.
  app.use('/admin', staffSharedRouter);
  // Phase 30c: candidates — hr only (router applies its own auth/role guard).
  app.use('/candidates', candidatesRouter);
  // Phase 30d: interviewer-scoped surfaces (candidates filtered by type).
  app.use('/interviewer', interviewerRouter);
  // Phase 30e: HR cross-interviewer reporting + xlsx export.
  app.use('/hr', hrRouter);

  // 404 + global error handler (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
