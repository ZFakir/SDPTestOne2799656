# Getting Started

<cite>
**Referenced Files in This Document**
- [README.md](file://README.md)
- [package.json](file://package.json)
- [apps/api/package.json](file://apps/api/package.json)
- [apps/web/package.json](file://apps/web/package.json)
- [apps/api/src/config.ts](file://apps/api/src/config.ts)
- [apps/api/src/index.ts](file://apps/api/src/index.ts)
- [scripts/makeFixtureRepo.sh](file://scripts/makeFixtureRepo.sh)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [System Requirements](#system-requirements)
3. [Installation](#installation)
4. [Environment Configuration](#environment-configuration)
5. [Quick Start](#quick-start)
6. [First-Time Workflow](#first-time-workflow)
7. [Dashboard Navigation](#dashboard-navigation)
8. [Deterministic Fixture Examples](#deterministic-fixture-examples)
9. [Troubleshooting](#troubleshooting)
10. [Next Steps](#next-steps)

## Introduction
RAT (Repo Analysis Tool) is a self-hosted web application that ingests git repositories and computes commit-level metrics. You can ingest repositories by uploading a `.zip` archive containing a `.git` directory or by cloning a repository URL. RAT then analyzes the full history, excludes merge commits, and exposes repository, file, directory, author, and timeseries metrics through a Next.js dashboard.

At a high level:
- The backend is an Express + TypeScript API backed by SQLite.
- The frontend is a Next.js 14 dashboard.
- Ingestion runs asynchronously through an in-process job queue with visible phases.
- Metrics are computed at query time from a fact table of per-file-per-commit changes.

**Section sources**
- [README.md:1-13](file://README.md#L1-L13)
- [README.md:176-239](file://README.md#L176-L239)

## System Requirements
Before installing RAT, ensure your machine meets these requirements:

| Requirement | Minimum version | Notes |
|---|---:|---|
| Node.js | ≥ 18.18 | The project pins `node >= 18.18`. |
| npm | ≥ 9 | Required for npm workspaces support. |
| git CLI | ≥ 2.30 | Must be available on `PATH`; used for ingestion and analysis. |
| Build tools | Optional | Only needed if `better-sqlite3` cannot download a prebuilt binary. |
| Network access | Optional | Required only when using clone-URL ingestion. |

The root workspace declares the Node engine requirement and defines shared scripts for development, building, testing, and verification.

**Section sources**
- [README.md:17-26](file://README.md#L17-L26)
- [package.json:27-29](file://package.json#L27-L29)

## Installation
RAT uses npm workspaces to manage the API, web app, and shared types.

### Step-by-step installation
1. Open a terminal in the repository root.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Verify that both workspaces are installed:
   - `@rat/api` — Express API with SQLite persistence and ingestion pipeline.
   - `@rat/web` — Next.js dashboard.
   - `@rat/shared` — Shared DTO types.

The root `package.json` defines workspace scripts such as `dev`, `build`, `test`, and `verify`.

**Section sources**
- [README.md:8-13](file://README.md#L8-L13)
- [package.json:1-21](file://package.json#L1-L21)

## Environment Configuration
RAT reads configuration from environment variables. By default, the API loads `.env` from the repository root or the current working directory.

### Key environment variables
| Variable | Default | Purpose |
|---|---:|---|
| `API_PORT` | `4000` | Port where the API listens. |
| `RAT_STORAGE_DIR` | `./storage` | Storage root for uploaded zips, cloned mirrors, and the SQLite database. |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | Base URL for the web app; this value is inlined at build time. |
| `MAX_UPLOAD_MB` | `512` | Maximum zip upload size in megabytes. |
| `CLONE_TIMEOUT_MS` | `1800000` | Timeout for `git clone` operations. |

Important behavior:
- `RAT_STORAGE_DIR` can be absolute or relative; relative paths are resolved against the repository root.
- The storage layout includes:
  - `storage/repos/<repoId>/` — cloned repository mirrors.
  - `storage/tmp/` — staging area for uploaded zips.
  - `storage/rat.db` — SQLite database.
- `NEXT_PUBLIC_API_URL` must be set before running `npm run build` if you serve the API on a different host or port.

If you do not have an `.env.example` file in the repository root, copy the documented variables into a `.env` file at the repository root and adjust them as needed.

**Section sources**
- [README.md:242-254](file://README.md#L242-L254)
- [apps/api/src/config.ts:13-24](file://apps/api/src/config.ts#L13-L24)
- [apps/api/src/config.ts:49-66](file://apps/api/src/config.ts#L49-L66)

## Quick Start
You can start RAT in development mode or production mode.

### Development mode
Run both the API and the web app together:
```bash
npm run dev
```
This starts:
- API on `http://localhost:4000`
- Web dashboard on `http://localhost:3000`

You can also run them separately:
```bash
npm run dev:api
npm run dev:web
```

### Production-style mode
Build once, then start the compiled services:
```bash
npm run build
npm run start:api
npm run start:web
```

When the API starts, it logs its listening port and storage directory. On shutdown, it closes the server and database connection gracefully.

**Section sources**
- [README.md:29-58](file://README.md#L29-L58)
- [apps/api/src/index.ts:6-23](file://apps/api/src/index.ts#L6-L23)
- [apps/api/package.json:7-12](file://apps/api/package.json#L7-L12)
- [apps/web/package.json:6-10](file://apps/web/package.json#L6-L10)

## First-Time Workflow
This section walks you through ingesting your first repository and watching the ingestion process.

### Option A: Upload a zip file
1. Open the dashboard at `http://localhost:3000`.
2. Choose **Upload zip**.
3. Select a `.zip` archive that contains a `.git` directory.
4. Submit the upload.
5. Watch the live ingestion progress.

A valid zip must contain a full `.git` directory. Zips created from a working tree without `.git`, or archives containing only a `.git` pointer file, will be rejected.

### Option B: Clone a repository URL
1. Open the dashboard at `http://localhost:3000`.
2. Choose **Clone URL**.
3. Paste a repository URL, for example a public GitHub repository.
4. Submit the clone request.
5. Watch the live ingestion progress.

Clone mode requires outbound HTTPS access to the remote host and a compatible `git` CLI.

### Job phases
Ingestion jobs move through these phases:
1. **Extracting / Cloning** — either unzip the uploaded archive or clone the repository URL.
2. **Validating** — verify that the source is a valid git repository.
3. **Analyzing** — stream `git log --no-merges -M50% --numstat` and compute commit-level metrics.
4. **Finalizing** — persist results and mark the repository ready.

While a job is active, the repository row polls automatically and flips to **Ready** when analysis completes.

**Section sources**
- [README.md:60-69](file://README.md#L60-L69)
- [README.md:187-192](file://README.md#L187-L192)
- [README.md:294-300](file://README.md#L294-L300)

## Dashboard Navigation
After a repository becomes ready, click its name to open the repository dashboard.

Main tabs and features:
- **Overview** — metric cards and charts for the selected scope.
- **Files** — sortable, paged file metrics.
- **Directories** — breadcrumb drill-down across path levels.
- **Authors** — resolved authors with ownership bars.

Common controls:
- Commit-range filters (`fromTs`/`toTs`).
- Author filter.
- Path scope filter.
- Timeseries bucket selection (day or week).
- Top-files chart interaction to set path scope.

The dashboard uses SWR hooks to poll while jobs are busy and keeps previous data while filters change.

**Section sources**
- [README.md:67-69](file://README.md#L67-L69)
- [README.md:204-214](file://README.md#L204-L214)

## Deterministic Fixture Examples
The repository includes a deterministic fixture builder that exercises every metric edge case. Use it to validate your setup and understand how RAT handles complex scenarios.

### What the fixture covers
- Multiple authors and email variants normalized through `.mailmap`.
- Rename-only changes.
- Rename plus edits.
- File deletions.
- Binary files.
- Nested directories.
- Empty commits.
- Merge commits, which must be excluded from metrics.

### Build and use the fixture
1. Build the fixture repository and optionally create a zip:
   ```bash
   bash scripts/makeFixtureRepo.sh storage/fixture-repo storage/fixture.zip
   ```
2. Upload the generated zip through the web UI or via the API:
   ```bash
   curl -X POST -F "file=@storage/fixture.zip" http://localhost:4000/api/repositories/upload
   ```
3. Wait for the job to reach **Ready**.
4. Open the repository dashboard and inspect:
   - Repository totals.
   - Per-file metrics.
   - Directory subtree metrics.
   - Authors and ownership.
   - Timeseries.

The fixture script prints expected values, including added lines, removed lines, growth, churn, modifications, frequency, churn rate, author summaries, and per-file deltas. These values are designed to match the hand-computed expectations in the project brief.

**Section sources**
- [README.md:73-98](file://README.md#L73-L98)
- [scripts/makeFixtureRepo.sh:1-24](file://scripts/makeFixtureRepo.sh#L1-L24)
- [scripts/makeFixtureRepo.sh:225-243](file://scripts/makeFixtureRepo.sh#L225-L243)

## Troubleshooting
Use this section to resolve common setup issues.

### better-sqlite3 binary problems
If `better-sqlite3` fails to load after `npm install`, the prebuilt binary may have been blocked.

Solutions:
- Install build tools and rebuild from source:
  ```bash
  npm rebuild better-sqlite3 --build-from-source
  ```
- Or side-load the official prebuilt binary:
  ```bash
  node scripts/fix-native.js
  ```

On Debian/Ubuntu, you may need build essentials first:
```bash
sudo apt-get install -y build-essential python3
```

### Port already in use
If the default ports are occupied:
- Change the API port:
  ```bash
  API_PORT=4001 npm run dev:api
  ```
- Change the web app port:
  ```bash
  PORT=3001 npm run dev:web
  ```

### Clone failures
Clone mode requires:
- Outbound HTTPS access to the remote host.
- `git` CLI ≥ 2.30.

Error details are surfaced in the job’s error field and in the UI banner.

### Zip rejected
The archive must contain a full `.git` directory. Common causes of rejection:
- Uploading a zip created from a working tree without `.git`.
- Uploading an archive that contains only a `.git` pointer file.

### Oracle cannot find the git directory
If the independent metrics oracle cannot locate the stored repository:
- Pass `--git-dir <path>` explicitly.
- Ensure `RAT_STORAGE_DIR` matches the directory used when starting the API.

**Section sources**
- [README.md:278-302](file://README.md#L278-L302)

## Next Steps
After getting RAT running:
- Explore the API surface for programmatic access to repositories, jobs, commits, authors, paths, and metrics.
- Run the test suite:
  ```bash
  npm test
  ```
- Run type checking:
  ```bash
  npm run typecheck
  ```
- Validate metrics against the independent oracle:
  ```bash
  npm run verify -- --repo fixture
  ```

For deeper understanding, review:
- The architecture summary covering storage, SQLite schema, ingestion pipeline, author resolution, and metrics computation.
- The design system documentation referenced by the web app.
- The fixture script comments explaining each edge case.

**Section sources**
- [README.md:101-136](file://README.md#L101-L136)
- [README.md:176-239](file://README.md#L176-L239)
- [README.md:306-313](file://README.md#L306-L313)