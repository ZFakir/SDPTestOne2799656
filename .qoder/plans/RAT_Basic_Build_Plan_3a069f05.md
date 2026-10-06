# RAT — Repo Analysis Tool: Express + Next.js Implementation Plan

## Summary

Build the RAT as an npm-workspaces monorepo in the current repo root: an Express + TypeScript API (`apps/api`) that ingests repositories — zip upload containing `.git`, or full (non-shallow) clone of a remote URL — precomputes per-commit line statistics with the system git CLI, and serves every metric from the brief (file, directory, repository, commit-set, author). A Next.js App Router dashboard (`apps/web`) handles repository management, ingestion with live job progress, and the filterable metrics dashboard. The dashboard is styled per the attached GitHub-inspired design system captured in `design.md`, and the API ships with Jest + supertest unit tests for all Express routes. This plan covers the basic requirements end-to-end and stages the rubric's upper tiers.

## Key Decisions

- Analysis engine: system git CLI (2.43 present), spawned with argument arrays (no shell). Guarantees the metric semantics the brief references: git's own binary detection via numstat (`- -`), rename detection at `-M50%`, mailmap via `git check-mailmap`; scales to ~100k commits. Rejected: isomorphic-git/nodegit (diff semantics drift from git, too slow).
- Storage: SQLite via better-sqlite3 (WAL). Zero infra, fast batched inserts, all metrics expressed as SQL aggregation. All tables keyed by `repo_id`, so multiple repositories work from day one with no schema change.
- Ingestion: asynchronous jobs (in-process FIFO queue, concurrency 1, `jobs` table + polling endpoint). Cloning/parsing redis or git.git takes minutes; UI shows phase + percent; failures carry actionable messages.
- Author merging: layered resolution at query time — manual map > mailmap map > raw ident. Merging never requires re-scanning the repo.
- Directory metrics: subtree sums (the brief's immediate-children recursion is algebraically a transitive subtree sum), via index-friendly path-range queries. Binary files simply produce no rows.
- Single fact table: `commit_file_stats(commit_id, path, added, removed)` is the source of truth; every other metric is a linear sum over it. Renames attributed to the new path; deletions stored as `0/N` on the path.
- UI design system: the attached GitHub design extraction is adopted as `design.md` at the repo root — source of truth for tokens, typography, component specs, and interaction states. The web app implements it with CSS custom properties and self-hosted Mona Sans woff2. The extraction declares no semantic status colors (needed for repo/job status) and no data-table/modal specs, so `design.md` adds these as clearly marked project extensions built from the core card/input patterns.
- API testing: Jest + ts-jest + supertest. `app.ts` exports a `createApp(db)` factory, so route tests run against a temp SQLite file with git/ingest services mocked via `jest.mock`.

## File Structure

```
repo root (/home/vmuser/Documents/SDPTestOne2799656)
├── package.json                  # npm workspaces (apps/*, packages/*) + dev scripts (concurrently)
├── tsconfig.base.json
├── .env.example                  # API_PORT, RAT_STORAGE_DIR, NEXT_PUBLIC_API_URL, MAX_UPLOAD_MB, CLONE_TIMEOUT_MS
├── .gitignore                    # node_modules/, storage/, .next/, dist/
├── README.md                     # setup + run + architecture summary (serves graders)
├── design.md                     # GitHub-inspired design system (adapted from the attached extraction)
├── scripts/
│   ├── makeFixtureRepo.sh        # deterministic mini-repo exercising all edge cases
│   └── verifyMetrics.ts          # oracle: recompute metrics via raw git, diff against API
├── packages/
│   └── shared/                   # @rat/shared — DTO types used by both apps
│       ├── package.json
│       ├── tsconfig.json
│       └── src/{index.ts, types.ts}
└── apps/
    ├── api/                      # Express + TypeScript backend
    │   ├── package.json          # express, multer, better-sqlite3, cors, zod; jest, ts-jest, supertest
    │   ├── tsconfig.json
    │   ├── jest.config.ts
    │   ├── test/
    │   │   ├── helpers/{testDb.ts, testApp.ts, seeds.ts}  # temp SQLite, createApp wiring, fixture rows
    │   │   ├── routes/
    │   │   │   ├── repositories.test.ts  # upload/clone/list/get/delete + validation failures
    │   │   │   ├── jobs.test.ts          # polling + unknown-job 404
    │   │   │   ├── metrics.test.ts       # seeded DB: all five metric endpoints + filter validation
    │   │   │   ├── commits.test.ts       # list/paging + per-commit stats
    │   │   │   └── authors.test.ts       # canonical authors + raw idents
    │   │   ├── logParser.test.ts
    │   │   └── metrics.test.ts           # metric engine math (hand-computed)
    │   └── src/
    │       ├── index.ts          # bootstrap: config -> db -> queue -> listen
    │       ├── app.ts            # express wiring + createApp(db) factory (testable) + error middleware
    │       ├── config.ts         # env parsing + defaults
    │       ├── db/
    │       │   ├── database.ts   # better-sqlite3 init (WAL pragmas), prepared-stmt helpers
    │       │   └── schema.sql    # tables + indexes
    │       ├── routes/
    │       │   ├── repositories.ts  # upload / clone / list / get / delete
    │       │   ├── jobs.ts          # job status polling
    │       │   ├── metrics.ts       # file/dir/repo/set/author metric queries + timeseries
    │       │   ├── commits.ts       # commit list (manual selection) + per-commit stats
    │       │   └── authors.ts       # canonical authors + raw idents (merge later)
    │       ├── middleware/{errorHandler.ts, validate.ts}   # AppError mapping, zod validation
    │       ├── ingest/
    │       │   ├── pipeline.ts      # job orchestration: source -> validate -> analyze -> finalize
    │       │   ├── zipSource.ts     # multipart -> safe extract -> locate .git
    │       │   ├── cloneSource.ts   # git clone --mirror with progress from stderr
    │       │   └── validateRepo.ts  # rev-parse HEAD, commit count, safe.directory handling
    │       ├── git/
    │       │   ├── gitRunner.ts     # spawn wrapper (arg arrays, cwd, timeout, abort)
    │       │   ├── logParser.ts     # streaming parser: commit records + numstat entries
    │       │   └── identResolver.ts # distinct idents + git check-mailmap -> mapping rows
    │       ├── analysis/
    │       │   ├── analyzeCommits.ts # stream -> batched inserts (commits, idents, file stats)
    │       │   └── finalize.ts       # derived caches: dir list, totals, counts
    │       ├── metrics/
    │       │   ├── commitSet.ts      # filters -> commit-id set (range | manual list | author)
    │       │   ├── objectMetrics.ts  # file/dir/repo: added/removed/growth/churn
    │       │   ├── setMetrics.ts     # modifications, modification frequency, churn rate
    │       │   └── authorMetrics.ts  # author modifications/churn/ownership
    │       ├── jobs/{queue.ts, jobStore.ts}
    │       └── util/{paths.ts, zipSafe.ts, errors.ts}
    └── web/                      # Next.js 14 (App Router), React 18
        ├── package.json          # next, react, swr, recharts
        ├── next.config.ts        # transpilePackages: ['@rat/shared']
        ├── tsconfig.json
        ├── public/fonts/         # self-hosted Mona Sans / Mono woff2 (fallback stack per design.md)
        └── src/
            ├── styles/globals.css  # design.md tokens as CSS custom properties + base styles
            ├── app/
            │   ├── layout.tsx
            │   ├── page.tsx                  # repo list + ingest (tabs: Upload zip | Clone URL)
            │   └── repos/[repoId]/page.tsx   # dashboard: filter bar + metric tabs
            ├── components/
            │   ├── ingest/{IngestTabs.tsx, ZipUploadForm.tsx, CloneUrlForm.tsx, JobProgress.tsx}
            │   ├── filters/{FilterBar.tsx, AuthorSelect.tsx, PathPicker.tsx, CommitRangeControls.tsx}
            │   ├── metrics/{MetricCards.tsx, FileMetricsTable.tsx, DirectoryTreeTable.tsx,
            │   │             AuthorMetricsTable.tsx, charts/{ChurnOverTimeChart.tsx, TopFilesChart.tsx}}
            │   └── common/{StatusBadge.tsx, ErrorBanner.tsx, EmptyState.tsx}
            └── lib/{api.ts, hooks.ts, format.ts}   # typed fetch client, SWR hooks, formatting
```

## Data Model (SQLite — `apps/api/src/db/schema.sql`)

```sql
repositories(id TEXT PK, name, source_type TEXT CHECK IN ('zip','url'), source_ref,
             storage_path, status TEXT, error, head_sha, commit_count INTEGER,
             created_at INTEGER, ready_at INTEGER)
jobs(id TEXT PK, repo_id TEXT, type, status TEXT, phase TEXT, progress REAL,
     error, created_at INTEGER, started_at INTEGER, finished_at INTEGER)
raw_idents(id INTEGER PK, repo_id, name, email, UNIQUE(repo_id, name, email))
commits(id INTEGER PK, repo_id, sha, parent_sha, ts INTEGER,          -- ts = committer date
        raw_ident_id INTEGER, UNIQUE(repo_id, sha))
commit_file_stats(repo_id, commit_id INTEGER, path TEXT,
                  added INTEGER, removed INTEGER, PRIMARY KEY(commit_id, path))
mailmap_map(repo_id, ident_id, resolved_name, resolved_email, PRIMARY KEY(repo_id, ident_id))
canonical_authors(id TEXT PK, repo_id, display_name, display_email)    -- manual merges (later tier)
author_merges(repo_id, ident_id, canonical_author_id, PRIMARY KEY(repo_id, ident_id))
```

Indexes: `commits(repo_id, ts)`, `commits(repo_id, raw_ident_id)`, `commit_file_stats(repo_id, path)`, `commit_file_stats(commit_id)`.

Author resolution (the brief's `h[a]`): `author_merges` (manual) > `mailmap_map` > raw ident — applied at query time via join, so merges are instant and re-scannable-free.

Storage layout: `storage/repos/<repoId>/repo.git` (mirror clone) or `.../src` (extracted zip); `storage/tmp/` for uploads. All under `RAT_STORAGE_DIR` (default `./storage`).

## Git Command Contracts

```
# Clone (async job; --progress stderr drives job progress)
git clone --mirror --progress <url> <storage>/repos/<id>/repo.git

# Zip source: extract to <storage>/repos/<id>/src with per-entry validation
#   (reject absolute paths, "..", symlink escapes; cap uncompressed size)
#   accept .git/ directory OR a bare repo layout; ".git" file (worktree pointer) -> clear error

# Validate
git -C <dir> -c safe.directory=<dir> rev-parse HEAD
git -C <dir> -c safe.directory=<dir> rev-list --count --no-merges HEAD

# Analyze (streamed, single pass)
git -C <dir> -c safe.directory=<dir> -c core.quotePath=false log \
    --no-merges -M50% --date-order --numstat \
    --format='%x1e%H%x1f%P%x1f%ct%x1f%an%x1f%ae' HEAD

# Mailmap resolution (only when HEAD:.mailmap exists; mailmap.blob works for bare clones)
git -C <dir> -c mailmap.blob=HEAD:.mailmap check-mailmap --stdin   # "Name <email>" lines in
```

Parser rules (`logParser.ts`):
- Line starting with `0x1e` -> new commit record (sha, parents, committer ts, raw author name/email).
- Otherwise numstat line `added\tremoved\tpath`: skip when both are `-` (binary); deletions appear as `0\tN\tpath`; renames (`old => new` and `{old => new}` forms) are attributed to the new path; C-quoted paths (leading `"`) are unescaped.
- Every non-merge commit is stored, including empty diffs (needed for `|H|` denominators). Root commit diffs against empty tree natively.
- Batched inserts (~2000 rows per transaction); progress = commits processed / total.

## Metric Computation Mapping

- Filter assembly (`commitSet.ts`): commit set is either a timestamp range — `[fromTs, toTs)` inclusive/exclusive per the brief's `H_i,j`, or `fromTs` alone = `H_t` — or an explicit `commitIds` list; intersected with an optional author filter. `|H|` = COUNT of matching commits (includes empty commits).
- File metrics: row values `l+`, `l-`; `δ = l+ - l-`, `λ = l+ + l-`. Over a set: SUM of each.
- Directory/repository metrics: SUM over path range `path = d OR (path > d||'/' AND path < d||'0')` (index-friendly prefix scan); repository = root. Same aggregation over a commit set.
- Set metrics: modifications `n_H,o` = COUNT(DISTINCT commit_id) among rows with `path` in scope and `added+removed > 0`; frequency `η = n/|H|`; churn rate `ρ = λ_H,o/|H|` (0 when `|H| = 0`).
- Author metrics: join commits -> resolved author; `n_H,o,a` and `λ_H,o,a` filtered to the resolved author; ownership `ω = λ_H,o,a / λ_H,o` (0 when `λ_H,o = 0`).

## HTTP API (basic scope)

```
POST /api/repositories/upload          multipart zip -> { repository, job }
POST /api/repositories/clone           { url, name? } -> { repository, job }
GET  /api/repositories                 list with status
GET  /api/repositories/:id             detail (status, counts, head, error)
DELETE /api/repositories/:id           remove DB rows + storage
GET  /api/jobs/:id                     { status, phase, progress, error }
GET  /api/repositories/:id/commits     ?fromTs&toTs&authorId&q&page (manual selection + list)
GET  /api/repositories/:id/commits/:sha/stats   per-commit file stats (drill-down)
GET  /api/repositories/:id/authors     canonical authors + raw ident counts
GET  /api/repositories/:id/paths       files + dirs for the path picker
GET  /api/repositories/:id/metrics/repository   ?fromTs&toTs | commitIds &authorId
GET  /api/repositories/:id/metrics/files        (+ pathPrefix, sort, page)
GET  /api/repositories/:id/metrics/directories  (+ path, depth)
GET  /api/repositories/:id/metrics/authors      (+ path)
GET  /api/repositories/:id/metrics/timeseries   (+ bucket=day|week, filters) for charts
```

Common filters: `fromTs`/`toTs` (mutually exclusive with `commitIds`), `authorId`, `path`. Errors are structured `{ code, message }` via the error middleware.

## Frontend (basic scope)

- Design: everything follows `design.md` — dark canvas `#0D1117` (alt `#000000`), white headings, body `#A4AEA6`, brand green `#08872B` reserved for primary CTAs, Mona Sans typography (1.5 line-height), radii 6-8px, flat cards (shadows only on dropdowns), 44px+ touch targets; repo/job status badges and error states use the documented status-color extension.
- `/`: repository list with status badges; ingest tabs (zip upload / clone URL) with job progress polling; error banners; delete action.
- `/repos/[repoId]`: filter bar (commit range presets + custom from/to, author select, path picker) and metric tabs — Overview (repository metric cards, churn-over-time chart, top-churn files chart), Files table (`l+`, `l-`, growth, churn, modifications, frequency, churn rate), Directories tree table, Authors table (modifications, churn, ownership). Loading/empty/error states throughout.
- Deferred to the upper-tier phase: manual commit multi-select modal, author merge page, multi-repo comparison.

## Implementation Phases

| Phase | Work | Done when |
|---|---|---|
| 0 | Scaffold: workspaces, tsconfigs, config, schema, health route, dev scripts, `design.md`, web tokens, Jest config | `npm run dev` boots API + web; `/api/health` 200; SQLite file created; `npm test` green (smoke route test) |
| 1 | Ingestion both sources + jobs: zip upload (safe extract, `.git` detect), clone (mirror + progress), validation, delete; Jest+supertest route tests for repositories/jobs | Fixture zip upload and cJSON clone both reach `ready` with head_sha + commit_count; bad zip / non-repo / clone failure produce actionable errors; route tests green (services mocked) |
| 2 | Analysis pipeline: streaming parser, batched persistence, ident collection + mailmap | DB row counts match `git rev-list --count --no-merges HEAD`; numstat spot-sums match; progress hits 100% |
| 3 | Metrics API: commit-set + filters + all five categories + timeseries; Jest+supertest route tests seeded from a temp DB | `scripts/verifyMetrics.ts` matches API values on fixture and cJSON/redis ranges; ownership sums to ~1 per object; metrics/commits/authors route tests green |
| 4 | Dashboard: repo management, ingest UX, dashboard tabs, filters, charts, styled per `design.md` | Fresh user can upload a zip, clone redis, filter by range/author/path, read all metric tabs; UI matches design tokens; no console errors |
| 5 | Upper tiers: manual commit selection UI, author merge UI (small — resolution layer exists), multi-repo polish, perf (materialized rollups, pagination), QoL (cancel job, duplicate-source warning) | Rubric 75-100% items demonstrated |

## Verification

- `scripts/makeFixtureRepo.sh`: deterministic mini-repo covering multi-author + email variants with `.mailmap`, rename-only, rename+edit, file deletion, binary file, nested dirs, a merge commit (must be excluded), empty commit.
- Jest suite (`cd apps/api && npm test`): route unit tests for every Express route via supertest — success paths, validation 400s, unknown-id 404s, error-middleware mapping — against a temp SQLite DB with git/ingest services mocked; plus parser edge cases (rename forms, binary, C-quoted paths, root commit) and hand-computed metric-engine values.
- Oracle: `verifyMetrics.ts` recomputes metrics independently from raw git commands and diffs against the API — run at the rubric's provided commit hashes on cJSON, redis, git.git.
- Performance: time ingestion and dashboard query latency on redis (~10k) and git.git (~100k commits); target interactive (<1s) dashboard queries.

## Assumptions

- Built in the existing repo root (this repo is the public submission).
- Node 18.19 + npm 9 (present), git CLI 2.43 (present) required at runtime; no Docker, no auth (single-user test scope).
- Next.js 14.x + React 18 (safe on Node 18); API on :4000, web on :3000; CORS enabled.
- Local disk storage with ~190 GB free (sufficient for the provided repos).
- `design.md` adapts the attached GitHub extraction (same tokens and rules) and fills its documented gaps (status colors, data tables, modals/badges) as marked project extensions; Mona Sans self-hosted with the specified fallback stack.
- Jest (not Vitest) is used per requirement, scoped to the Express API in the basic tier.