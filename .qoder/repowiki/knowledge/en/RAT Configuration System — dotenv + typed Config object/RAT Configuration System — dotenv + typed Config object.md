---
kind: configuration_system
name: RAT Configuration System — dotenv + typed Config object
category: configuration_system
scope:
    - '**'
source_files:
    - apps/api/src/config.ts
    - .env.example
    - apps/api/package.json
    - package.json
---

## Overview

The RAT monorepo uses a minimal, code-driven configuration system centered on a single `loadConfig` function in `apps/api/src/config.ts`. It loads environment variables via the `dotenv` package and exposes a strongly-typed `Config` interface consumed by the Express API. The Next.js web app has its own build-time config (`NEXT_PUBLIC_API_URL`) but no runtime config loader of its own.

## Key files

- `apps/api/src/config.ts` — sole source of runtime configuration loading and validation for the API.
- `.env.example` — documented template of all supported environment variables with defaults.
- `apps/api/package.json` — declares the `dotenv` dependency (runtime) and `zod` (available but unused by config).
- `package.json` (root) — defines Node engine requirement (`>=18.18`) which is the only platform-level constraint.
- `apps/web/next.config.mjs` / `apps/web/.env.local` — Next.js build-time env var surface referenced from `.env.example`.

## Architecture and conventions

### Loading order

`loadDotenv()` resolves the repository root relative to the compiled output (`path.resolve(__dirname, '..', '..', '..')`) so it works both under `tsx` and from `dist/`. It then tries `.env` at two locations in priority order:

1. `<repoRoot>/.env`
2. `<process.cwd()>/.env`

It stops at the first file found; if neither exists, no error is thrown — every variable has a fallback default. This makes `.env` optional.

### Typed configuration shape

All runtime configuration is expressed as the exported `Config` interface:

```ts
interface Config {
  repoRoot: string;
  port: number;
  storageDir: string;
  reposDir: string;
  tmpDir: string;
  dbPath: string;
  maxUploadBytes: number;
  cloneTimeoutMs: number;
  gitTimeoutMs: number;
}
```

Derived paths (`reposDir`, `tmpDir`, `dbPath`) are computed from `storageDir` inside `loadConfig`; callers never assemble them themselves. A helper `ensureStorageDirs(config)` creates `reposDir` and `tmpDir` recursively before use.

### Environment variable contract

| Variable | Type | Default | Notes |
|---|---|---|---|
| `API_PORT` | integer | `4000` | Port the Express server listens on |
| `RAT_STORAGE_DIR` | path (relative or absolute) | `./storage` | Resolved against `repoRoot` when relative |
| `MAX_UPLOAD_MB` | integer | `512` | Converted to bytes (`* 1024 * 1024`) |
| `CLONE_TIMEOUT_MS` | integer | `30 * 60_000` (30 min) | Timeout for `git clone` |
| `NEXT_PUBLIC_API_URL` | URL string | `http://localhost:4000` | Build-time only for the Next.js web app |

There is no schema validator (despite `zod` being a dependency); validation is done inline via `intFromEnv`, which parses an integer and falls back to the supplied default when the value is missing, empty, non-finite, or non-positive.

### Hard-coded vs. configurable values

Some timeouts are hard-coded rather than exposed as env vars: `gitTimeoutMs` is fixed at `30 * 60_000` regardless of `CLONE_TIMEOUT_MS`. Secrets (e.g., database credentials) are not present — the SQLite DB lives at `config.dbPath` with no authentication layer.

### Web app configuration

The Next.js dashboard does not load config at runtime. `.env.example` documents that `NEXT_PUBLIC_API_URL` must be set at **build time** (Next.js inlines `NEXT_PUBLIC_*` variables) and suggests putting it in `apps/web/.env.local` rather than the repo-root `.env`. There is no shared config module between the API and web apps.

## Conventions and constraints

- Every environment variable has a sensible default; `.env` is optional. Enforced by the `intFromEnv` fallback behavior and the comment in `.env.example`: "Every variable has a sensible default — a `.env` file is optional."
- Storage-related paths are always resolved relative to the repository root, never to `process.cwd()`, because `loadDotenv` explicitly prefers `<repoRoot>/.env` over `<cwd>/.env`. Enforced by the candidate list in `loadDotenv()`.
- Relative `RAT_STORAGE_DIR` values are resolved against `repoRoot`, not `process.cwd()`. Enforced by `path.isAbsolute(storageRaw) ? storageRaw : path.resolve(repoRoot, storageRaw)`.
- Integer-valued env vars are validated to be finite and positive; invalid values silently fall back to defaults. Enforced by `intFromEnv`.
- Derived filesystem layout is centralized: `reposDir = storageDir/repos`, `tmpDir = storageDir/tmp`, `dbPath = storageDir/rat.db`. Consumers do not construct these paths themselves.
- `ensureStorageDirs(config)` is the single place that materializes `reposDir` and `tmpDir` on disk via `fs.mkdirSync(..., { recursive: true })`.
- The Node engine version is constrained to `>=18.18` in the root `package.json` `engines` field, which is the only platform-level configuration gate.