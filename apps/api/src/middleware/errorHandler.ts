import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { AppError } from '../util/errors';

/** 404 handler for unknown API routes. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    code: 'NOT_FOUND',
    message: `Route not found: ${req.method} ${req.path}`,
  });
}

/**
 * Central error middleware. Every failure crossing the HTTP boundary becomes a
 * structured `{ code, message }` body: AppErrors keep their code/status,
 * multer and body-parser errors are mapped, everything else is a 500.
 */
export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({ code: err.code, message: err.message });
    return;
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        code: 'UPLOAD_TOO_LARGE',
        message: 'The uploaded file exceeds the configured size limit (MAX_UPLOAD_MB).',
      });
      return;
    }
    res.status(400).json({
      code: 'UPLOAD_INVALID',
      message: `Upload failed: ${err.message}`,
    });
    return;
  }

  // body-parser style errors carry `status`/`statusCode` on a plain object.
  const candidate = err as { status?: unknown; statusCode?: unknown } | null;
  const status =
    typeof candidate?.status === 'number'
      ? candidate.status
      : typeof candidate?.statusCode === 'number'
        ? candidate.statusCode
        : undefined;
  if (status !== undefined && status >= 400 && status < 500) {
    res.status(status).json({
      code: 'BAD_REQUEST',
      message: err instanceof Error ? err.message : 'Bad request.',
    });
    return;
  }

  console.error('[rat] unhandled error:', err);
  res.status(500).json({ code: 'INTERNAL', message: 'Internal server error.' });
}
