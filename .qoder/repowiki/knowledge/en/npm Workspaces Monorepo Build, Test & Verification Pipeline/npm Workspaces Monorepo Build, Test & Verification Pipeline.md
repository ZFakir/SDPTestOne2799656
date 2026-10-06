---
kind: build_system
name: npm Workspaces Monorepo Build, Test & Verification Pipeline
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - apps/api/package.json
    - apps/web/package.json
    - packages/shared/package.json
    - apps/api/jest.config.js
    - scripts/makeFixtureRepo.sh
    - scripts/verifyMetrics.ts
    - scripts/fix-native.js
---

# Build System Overview

RAT is an npm workspaces monorepo with no Makefile, Dockerfile, CI YAML, or release pipeline. The build surface is entirely defined by `package.json` scripts and a handful of standalone helper scripts under `scripts/`.

## Toolchain

- **Package manager**: npm (workspaces enabled at the root). Node.js version is pinned via the `engines` field to `>=18.18`.
- **TypeScript compilation**: `tsc -p tsconfig.json` for `@rat/api`; Next.js handles its own build (`next build`) for `@rat/web`. A shared `tsconfig.base.json` is referenced by workspace configs.
- **Runtime / dev server**: `tsx` (direct TS execution) for both API dev (`tsx watch src/index.ts`) and the top-level `dev` script that launches API + web concurrently via `concurrently -k -n api,web`.
- **Testing**: Jest (with `ts-jest`, `supertest`) runs only against `apps/api`; the web app has no test runner configured.
- **Native binding recovery**: `scripts/fix-native.js` side-loads prebuilt `better-sqlite3` binaries when `prebuild-install` cannot fetch them.

## Workspace Layout

```text
package.json          # root: workspaces ["apps/*", "packages/*"]
├── apps/api/package.json   # @rat/api — Express + TypeScript + SQLite
├── apps/web/package.json   # @rat/web — Next.js App Router
└── packages/shared/package.json # @rat/shared — type-only DTO package
```

The root `package.json` exposes composite scripts that delegate to workspaces:

| Script | Behavior |
|---|---|
| `npm run dev` | Runs API and web concurrently (`concurrently -k -n api,web`) |
| `npm run build` | Builds `@rat/api` then `@rat/web` in sequence |
| `npm run start:api` / `start:web` | Starts each workspace independently |
| `npm run test` | Runs `jest` inside `@rat/api` |
| `npm run typecheck` | Runs `tsc --noEmit` in both workspaces |
| `npm run fixture` | Invokes `bash scripts/makeFixtureRepo.sh` |
| `npm run verify` | Runs `tsx scripts/verifyMetrics.ts` |

## Build Artifacts

- **API**: compiled JavaScript lives next to source files (TSC default output); there is no explicit `outDir` in the provided config snippet, so artifacts are emitted into `apps/api/src/`.
- **Web**: Next.js emits `.next/` (already present in the tree).
- **Shared package**: published as TypeScript sources directly (`main` and `types` point at `./src/index.ts`); consumers import it as a TS module rather than a compiled artifact.

## Testing & Verification

### Unit tests (`apps/api/test/`)
Jest configuration (`apps/api/jest.config.js`) sets:
- `testEnvironment: 'node'`
- `roots: ['<rootDir>/test']`
- `testMatch: ['**/*.test.ts']`
- `moduleNameMapper` rewrites `^@rat/shared$` to `<rootDir>/../../packages/shared/src/index.ts` (bypassing the workspace resolution path for tests)
- `ts-jest` transform with `strict: true`, `skipLibCheck: true`, `isolatedModules: true`, target `ES2022`, CommonJS modules
- `testTimeout: 20000`, `clearMocks: true`

Tests cover route handlers (`routes/*.test.ts`), `logParser.test.ts`, and `metrics.test.ts`, using `supertest` against a seeded test database.

### Metrics oracle (`scripts/verifyMetrics.ts`)
A standalone verification tool that:
- Spawns `git log --no-merges -M50% --date-order --numstat --format=...` on the stored repository.
- Re-parses numstat output with its own parser (deliberately NOT importing the API's parser module).
- Calls the running RAT API and diffs every metric family (repository totals, commit-set filters, per-file/directory metrics, resolved authors, commit listing, day timeseries).
- Uses epsilon comparison for floating-point fields (`EPS = 1e-9`, `OWNERSHIP_EPS = 1e-6`).
- Exits 0 only when all checks pass; mismatches print expected vs actual.

### Fixture generator (`scripts/makeFixtureRepo.sh`)
Deterministically builds a mini git repo exercising every metric edge case (multiple authors, `.mailmap` normalization, rename-only, rename+edit, deletion, binary file, nested dirs, empty commit, merge commit). It asserts invariants (exactly 12 non-merge commits) and prints expected metric values for manual comparison. Optional second argument zips the repo (including `.git`) for upload through `POST /api/repositories/upload`.

## Conventions Observed

- All workspace scripts are declared in each package's `package.json` and composed from the root via `npm run ... --workspace <pkg>`.
- Development uses `tsx` for hot-reloading TypeScript without a separate compile step; production-style builds use `tsc` (API) and `next build` (web).
- The shared DTO package is consumed as a TypeScript source dependency (`"@rat/shared": "*"`) — no build step is needed for it.
- Tests live alongside their feature code under `apps/api/test/` and are discovered by Jest's glob pattern.
- There is no CI pipeline, Docker image, or release automation present in the repository; local development and verification are performed via the npm scripts above.
- Native dependencies (`better-sqlite3`) require a platform-specific binary; `scripts/fix-native.js` is the documented recovery path when the standard `prebuild-install` flow fails.