export type ErrorCode =
  | 'INTERNAL'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'CONTAINER_ERROR'
  | 'BAD_REQUEST'
  | 'VOLUME_UNAVAILABLE'
  | 'ROOM_FULL';

export interface AppErrorOptions {
  code?: ErrorCode;
  details?: unknown;
  cause?: unknown;
  isOperational?: boolean;
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly isOperational: boolean;
  readonly details?: unknown;

  constructor(message: string, statusCode = 500, opts: AppErrorOptions = {}) {
    super(message, opts.cause ? { cause: opts.cause } : undefined);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = opts.code ?? 'INTERNAL';
    this.isOperational = opts.isOperational ?? true;
    this.details = opts.details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(message, 400, { code: 'VALIDATION', details });
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details?: unknown) {
    super(message, 400, { code: 'BAD_REQUEST', details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, { code: 'UNAUTHORIZED' });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403, { code: 'FORBIDDEN' });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, 404, { code: 'NOT_FOUND' });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', details?: unknown) {
    super(message, 409, { code: 'CONFLICT', details });
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429, { code: 'RATE_LIMITED' });
  }
}

/**
 * Phase 23: the past session's Docker volume is gone (manually deleted,
 * pruned, or `volume_deleted=true`). 410 is the right code — the resource
 * existed but no longer does, and the client uses `code` to render the
 * "code no longer available" fallback rather than retrying.
 */
export class VolumeUnavailableError extends AppError {
  constructor(message = 'Session volume is no longer available', details?: unknown) {
    super(message, 410, { code: 'VOLUME_UNAVAILABLE', details });
  }
}

/**
 * Multi-user design-canvas room hit its DESIGN_ROOM_MAX_PEERS cap. Surfaced as
 * 409 with a top-level `code: 'ROOM_FULL'` so the client can branch directly
 * on the code without poking into `details`.
 */
export class RoomFullError extends AppError {
  constructor(message = 'Room is full', details?: unknown) {
    super(message, 409, { code: 'ROOM_FULL', details });
  }
}

export class ContainerError extends AppError {
  constructor(message = 'Container error', details?: unknown, cause?: unknown) {
    super(message, 500, { code: 'CONTAINER_ERROR', details, cause });
  }
}
