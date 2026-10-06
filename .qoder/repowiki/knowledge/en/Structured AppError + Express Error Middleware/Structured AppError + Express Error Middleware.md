---
kind: error_handling
name: Structured AppError + Express Error Middleware
category: error_handling
scope:
    - '**'
source_files:
    - apps/api/src/util/errors.ts
    - apps/api/src/middleware/errorHandler.ts
    - apps/api/src/middleware/validate.ts
    - apps/web/src/components/common/ErrorBanner.tsx
---

## Approach

The RAT monorepo uses a single, centralized error-handling strategy in the Express API (`apps/api`), with a small shared UI banner component on the Next.js dashboard.

- **Custom error class**: `AppError` (in `apps/api/src/util/errors.ts`) carries three fields — `code: string`, `status: number`, `message: string` — and is extended by four factory helpers: `badRequest`, `notFound`, `conflict`, `payloadTooLarge`. Every domain/business error thrown inside route handlers or services is an `AppError`.
- **Centralized HTTP mapping**: `apps/api/src/middleware/errorHandler.ts` is the single place where errors cross the HTTP boundary. It converts any thrown value into a JSON body of shape `{ code, message }`.
- **Validation layer**: `apps/api/src/middleware/validate.ts` provides typed query-parameter helpers (`optionalInt`, `optionalEnum`, `pagingParams`) and a Zod-based `parseBody` helper; all validation failures throw `badRequest(...)` so they flow through the same pipeline.
- **Client-side presentation**: `apps/web/src/components/common/ErrorBanner.tsx` renders a simple inline alert banner with an optional retry button; it consumes human-readable messages produced by the API.

## Key Files

| File | Role |
|---|---|
| `apps/api/src/util/errors.ts` | Defines `AppError` and the `badRequest` / `notFound` / `conflict` / `payloadTooLarge` factories plus `errorMessage(err)` for generic logging. |
| `apps/api/src/middleware/errorHandler.ts` | Express error middleware: maps `AppError`, `multer.MulterError`, body-parser-style objects, and falls back to 500 `INTERNAL`. Also defines the 404 `notFoundHandler` for unmatched routes. |
| `apps/api/src/middleware/validate.ts` | Query-string and body validators that throw structured `badRequest` errors. |
| `apps/web/src/components/common/ErrorBanner.tsx` | Reusable client-side error banner component used across pages. |

## Architecture & Conventions

1. **Throw, don't return.** Route handlers and service functions propagate problems by throwing `AppError` instances rather than returning error objects. The central middleware catches them and serializes to JSON.
2. **Every HTTP error has a stable machine-readable `code`**. Examples observed across the codebase include `VALIDATION`, `NOT_FOUND`, `CONFLICT`, `UPLOAD_TOO_LARGE`, `UPLOAD_INVALID`, `UPLOAD_NOT_ZIP`, `PATH_NOT_FOUND`, `COMMIT_NOT_FOUND`, `JOB_NOT_FOUND`, `REPO_NOT_FOUND`, `DIR_NOT_FOUND`, `BAD_REQUEST`, `INTERNAL`. Codes are chosen per-error-site and documented via the constructor default values in `errors.ts`.
3. **HTTP status codes come from the error, not the caller.** `AppError.status` is set at construction time; the middleware never guesses a status for `AppError` instances.
4. **Multer and body-parser errors are explicitly mapped.** Multer's `LIMIT_FILE_SIZE` becomes 413 `UPLOAD_TOO_LARGE`; other multer errors become 400 `UPLOAD_INVALID`. Plain objects carrying `status` or `statusCode` in the 4xx range are coerced to 400 `BAD_REQUEST`.
5. **Unknown/unhandled errors are logged and turned into 500 `INTERNAL`.** The fallback path logs via `console.error('[rat] unhandled error:', err)` and returns `{ code: 'INTERNAL', message: 'Internal server error.' }`.
6. **Route-level 404s are separate from handler errors.** `notFoundHandler` handles unmatched Express routes and returns its own `{ code: 'NOT_FOUND', message }` payload.
7. **Validation helpers centralize parameter parsing.** Instead of ad-hoc `req.query` checks, routes use `optionalInt`, `optionalEnum`, `pagingParams`, and `parseBody(schema, body)` from `validate.ts`; all violations throw `badRequest` with a descriptive message.
8. **Web UI treats errors as user-facing strings.** The dashboard does not inspect `code` for rendering logic beyond displaying the message; `ErrorBanner` is a presentational wrapper around a `message` prop and optional `onRetry` callback.

## Observed Conventions (descriptive)

- Domain errors in route handlers and services consistently call `throw badRequest(...)` or `throw notFound(...)` / `throw conflict(...)` / `throw payloadTooLarge(...)` from `util/errors.ts` (e.g. `routes/repositories.ts`, `routes/jobs.ts`, `routes/commits.ts`, `routes/metrics.ts`, `ingest/zipSource.ts`, `metrics/commitSet.ts`, `services.ts`).
- Validation logic lives in `middleware/validate.ts` and throws `badRequest` with messages prefixed by the failing query parameter name (e.g. `Query parameter "page" must be >= 1.`).
- Zod schema validation failures are collapsed to the first issue and re-thrown as `badRequest(path: message)`.
- The web side does not define custom error types; it relies on the API's `{ code, message }` contract and displays the message through `ErrorBanner`.

## Rules Enforced by the Code

- **Rule:** Any error crossing the HTTP boundary is serialized as `{ code: string, message: string }`. This is enforced by the single `errorHandler` middleware, which is the only place `res.json(...)` is called for error responses.
- **Rule:** Business/validation errors are represented as `AppError` instances with explicit `status` and `code`, created exclusively through the `badRequest` / `notFound` / `conflict` / `payloadTooLarge` factories in `util/errors.ts`.
- **Rule:** Multer upload failures are normalized to either 413 `UPLOAD_TOO_LARGE` or 400 `UPLOAD_INVALID` regardless of the underlying multer error code.
- **Rule:** Unmatched Express routes respond with 404 `NOT_FOUND` via `notFoundHandler`.
- **Rule:** Any error not recognized by the above branches results in a 500 response with `code: 'INTERNAL'` and a fixed English message, after being logged to stderr.
- **Rule:** Query parameters parsed through `optionalInt` / `optionalEnum` / `pagingParams` must satisfy their type and range constraints, otherwise a `badRequest` is thrown.