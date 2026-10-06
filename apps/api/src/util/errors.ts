/**
 * Application error types. Every error crossing the HTTP boundary is mapped by
 * the error middleware to a structured `{ code, message }` body.
 */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
  }
}

export const badRequest = (message: string, code = 'VALIDATION'): AppError =>
  new AppError(code, 400, message);

export const notFound = (message: string, code = 'NOT_FOUND'): AppError =>
  new AppError(code, 404, message);

export const conflict = (message: string, code = 'CONFLICT'): AppError =>
  new AppError(code, 409, message);

export const payloadTooLarge = (message: string, code = 'UPLOAD_TOO_LARGE'): AppError =>
  new AppError(code, 413, message);

/** Human-readable message for any thrown value. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
