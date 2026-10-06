---
kind: logging_system
name: Console-based logging with no structured framework
category: logging_system
scope:
    - '**'
source_files:
    - apps/api/src/index.ts
    - apps/api/src/middleware/errorHandler.ts
    - apps/api/src/ingest/pipeline.ts
    - scripts/verifyMetrics.ts
---

## What system/approach is used

The RAT monorepo has **no dedicated logging framework**. There are no imports of Winston, Pino, Bunyan, log4js, Morgan, or any other logger. All output goes through Node's built-in `console` methods (`console.log`, `console.warn`, `console.error`). The only HTTP-specific logging is the default Express/Morgan behavior (none configured), and process lifecycle / error reporting is done via raw console calls.

## Key files and packages

- `apps/api/src/index.ts` — bootstrap and shutdown messages; marks stale jobs on restart.
- `apps/api/src/middleware/errorHandler.ts` — central Express error middleware; logs unhandled errors to stderr.
- `apps/api/src/ingest/pipeline.ts` — ingestion progress and failure warnings.
- `scripts/verifyMetrics.ts` — standalone metrics oracle script that uses `console.log` as its entire output/reporting mechanism.

No file in `packages/shared`, `apps/web`, or `scripts` introduces a logger abstraction.

## Architecture and conventions

- **Prefix convention**: Every API-side console message starts with `[rat]`, e.g. `[rat] API listening on ...`, `[rat] marked N interrupted job(s) as failed (server restart).`, `[rat] ingestion failed for ${repoId}: ${message}`. This is the only cross-file naming convention for log lines.
- **Level usage**:
  - `console.log` — startup, shutdown, and informational status messages (server listen address, storage dir, signal received).
  - `console.warn` — non-fatal conditions such as mailmap resolution being skipped or interrupted jobs being marked failed.
  - `console.error` — fatal/unhandled paths: ingestion failures and the catch-all branch in `errorHandler.ts` (`console.error('[rat] unhandled error:', err)`).
- **Structured fields**: None. Messages are plain template strings; there is no JSON payload, no request ID, no correlation id, no timestamp field attached by the application.
- **Sinks**: Directly to stdout/stderr of the Node process. No file rotation, no external collector, no environment-driven level filtering.
- **Error handling vs. logging**: The `errorHandler` middleware does not return a logger instance — it both responds to the client (`res.status(500).json({ code: 'INTERNAL', message: 'Internal server error.' })`) and emits a single `console.error`. Other routes throw typed `AppError` instances (from `util/errors.ts`) rather than logging directly.

## Conventions and constraints

- **Observed convention**: All runtime diagnostics from the API service are emitted via `console.*` prefixed with `[rat]`. This is descriptive of what the code does; it is not enforced by a linter or type system.
- **No framework dependency**: A grep across all `.ts` files for `winston|pino|bunyan|log4js|morgan` returns zero matches, confirming no third-party logger is imported anywhere in the repo.
- **No log-level configuration**: There is no config key for log verbosity, no `LOG_LEVEL` env var, and no conditional branching around log statements based on an environment variable.
- **No structured schema**: Log lines are free-form strings; consumers cannot parse them into fields without ad-hoc parsing.
- **Process signals**: Shutdown is logged via `console.log` before closing the server and database, then `process.exit(0)` is called after a 5-second timeout (`.unref()`ed) so lingering connections do not block termination.
- **Test/oracle scripts**: `scripts/verifyMetrics.ts` uses `console.log` exclusively for pass/fail reporting and human-readable diffs — this is expected for a CLI oracle, not part of the service logging strategy.