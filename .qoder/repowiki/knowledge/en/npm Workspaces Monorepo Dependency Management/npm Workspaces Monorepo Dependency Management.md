---
kind: dependency_management
name: npm Workspaces Monorepo Dependency Management
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - package-lock.json
    - apps/api/package.json
    - apps/web/package.json
    - packages/shared/package.json
    - scripts/fix-native.js
---

## Approach

RAT is an **npm workspaces monorepo** (Node.js, TypeScript). All third-party dependencies are declared in per-package `package.json` files and resolved through a single root `package-lock.json`. There is no vendoring of JS libraries; native binaries (e.g. `better-sqlite3`) are installed at workspace resolution time.

## Key Files

- `package.json` — workspace root: declares `workspaces: ["apps/*", "packages/*"]`, top-level scripts that delegate to `--workspace @rat/api` / `@rat/web`, pins Node engine `>=18.18`, and lists shared devDependencies (`concurrently`, `tsx`, `typescript`).
- `package-lock.json` — lockfile for the entire workspace graph.
- `apps/api/package.json` — runtime deps: `express`, `better-sqlite3`, `cors`, `dotenv`, `multer`, `yauzl`, `zod`; test/dev deps include Jest + ts-jest, Supertest, and `@types/*` packages.
- `apps/web/package.json` — runtime deps: `next`, `react`, `react-dom`, `recharts`, `swr`, `@fontsource-variable/mona-sans`.
- `packages/shared/package.json` — type-only package exposing DTO contracts via `exports` pointing at `./src/index.ts`.
- `scripts/fix-native.js` — post-install recovery script for `better-sqlite3` native bindings.

## Architecture & Conventions

- **Workspace layout**: `apps/*` holds executable apps (`api`, `web`); `packages/*` holds internal libraries (`shared`). The root `package.json` auto-discovers them via glob patterns.
- **Internal dependency wiring**: Both `@rat/api` and `@rat/web` depend on `@rat/shared` using the version specifier `*`, relying on npm workspaces hoisting/resolution rather than a published registry. `@rat/shared` is marked `private: true` and uses `exports` to expose only its entry point.
- **Versioning strategy**: Third-party dependencies use caret ranges (e.g. `^4.19.2`, `^14.2.5`, `^18.3.1`), allowing minor/patch updates within the major version. Internal packages (`@rat/shared`) are pinned across consumers with `*`.
- **Type safety boundary**: Runtime code lives under `apps/*/src`; `packages/shared/src` contains only TypeScript types/DTOs consumed as types by both apps, keeping the shared package lightweight.
- **Native binding handling**: `better-sqlite3` requires platform-specific native modules. A custom `scripts/fix-native.js` is used to recover/rebuild these bindings after install (likely triggered from a postinstall hook or manual step).
- **Engine constraint**: The root `engines.node >=18.18` enforces a minimum Node version across all workspaces.

## Conventions & Constraints

- Dependencies are declared per-workspace in each package's own `package.json`; there is no centralized dependency manifest beyond the root `package.json`'s workspace declaration.
- Internal packages (`@rat/shared`) are kept `private: true` and are not intended for publication; they are consumed via workspace resolution.
- Type definitions for third-party packages are co-located alongside their runtime counterparts in each package's `devDependencies` (e.g. `@types/express`, `@types/better-sqlite3`, `@types/react`).
- No private npm registry, `.npmrc`, or `GOPRIVATE` configuration is present — all packages come from the public npm registry.
- Lockfile usage: `package-lock.json` at the repo root governs deterministic installs for the whole workspace.