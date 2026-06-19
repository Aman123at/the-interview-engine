import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '@/errors/index.js';
import { isProd } from '@/config/index.js';
import { logger } from '@/utils/logger.js';

interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: unknown;
    stack?: string;
  };
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`,
      requestId: String(req.id),
    },
  } satisfies ErrorResponseBody);
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = String(req.id);

  let appErr: AppError;
  if (err instanceof AppError) {
    appErr = err;
  } else if (err instanceof ZodError) {
    appErr = new AppError('Validation failed', 400, {
      code: 'VALIDATION',
      details: err.flatten(),
    });
  } else {
    appErr = new AppError(
      err instanceof Error ? err.message : 'Internal server error',
      500,
      { code: 'INTERNAL', isOperational: false, cause: err },
    );
  }

  const log = (req.log ?? logger).child({ requestId });
  const logPayload = {
    err,
    statusCode: appErr.statusCode,
    code: appErr.code,
    path: req.originalUrl,
    method: req.method,
  };
  if (appErr.statusCode >= 500 || !appErr.isOperational) {
    log.error(logPayload, appErr.message);
  } else {
    log.warn(logPayload, appErr.message);
  }

  const body: ErrorResponseBody = {
    error: {
      code: appErr.code,
      message: appErr.message,
      requestId,
    },
  };
  if (appErr.details !== undefined) body.error.details = appErr.details;
  if (!isProd && appErr.stack) body.error.stack = appErr.stack;

  res.status(appErr.statusCode).json(body);
};
