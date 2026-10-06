# RAT — Repo Analysis Tool

A self-hosted web application that ingests git repositories (zip upload or clone
URL) and computes commit-level metrics over them: line changes, modification
counts, modification frequency, churn rate and author ownership — at repository,
directory, file, commit-set and author level.

The project is an npm-workspaces monorepo:

- **`apps/api`** — Express + TypeScript backend (SQLite persistence, system git CLI, async ingestion queue, metrics engine).
- **`apps/web`** — Next.js 14 dashboard styled against [`Design.md`](Design.md).
- **`packages/shared`** — shared DTO types for both apps.
- **`scripts/`** — deterministic fixture builder and an independent metrics oracle.

---

## 1. Requirements

| Requirement | Version | Notes |
|---|---|---|
| Node.js | ≥ 18.18 | Tested on Node 18.19. |
| npm | ≥ 9 | Workspace support. |
| git CLI | ≥ 2.30 | Must be on `PATH`; used for ingestion and analysis. |
| Build tools | optional | Only needed if `better-sqlite3` has no prebuilt binary for your platform (see §9). |
| Network | optional | Required only for the clone-URL ingestion mode. |

---

## 2. Quick start

```bash
# 1. Install dependencies (repo root)
npm install

# 2. Start both servers (API on :4000, web on :3000)
npm run dev
```

Open **http://localhost:3000**.

To run the two processes separately:

```bash
npm run dev:api     # Express API  → http://localhost:4000
npm run dev:web     # Next.js      → http://localhost:3000
```

Production-style run (build once, then start):

```bash
npm run build       # compiles apps/api and builds apps/web
npm run start:api   # tsx apps/api/src/index.ts
npm run start:web   # next start (uses the build from npm run build)
```

> `NEXT_PUBLIC_API_URL` is inlined at **build time**. If you serve the API on a
> different host/port, set it in `apps/web/.env.local` (or the environment)
> before `npm run build`.

### First run walkthrough

1. On the home page choose **Upload zip** or **Clone URL**.
2. Paste a repository URL (e.g. `https://github.com/DaveGamble/cJSON.git`) and
   submit, or drop in a `.zip` that contains a `.git` directory.
3. Watch the live ingestion progress (job phases: extract/clone → validate →
   analyze → finalize). The repo row polls automatically and flips to **Ready**.
4. Click the repository name to open its dashboard: **Overview** (metric cards +
   charts), **Files**, **Directories** (breadcrumb drill-down) and **Authors**
   tabs, with commit-range / author / path filters on top.

---

## 3. Try it with the deterministic fixture

`scripts/makeFixtureRepo.sh` builds a small repository that exercises every
metric edge case (multi-author + email variants with `.mailmap`, rename-only,
rename+edit, deletion, binary file, nested dirs, empty commit, merge commit that
must be excluded). It prints the expected metric values it was designed around.

```bash
# Build the fixture and a zip of it (repo includes .git)
bash scripts/makeFixtureRepo.sh storage/fixture-repo storage/fixture.zip

# Upload it through the API (curl) — or just use the web UI
curl -X POST -F "file=@storage/fixture.zip" http://localhost:4000/api/repositories/upload
```

The expected all-time values for the fixture (also printed by the script):

```
repository:  added=35 removed=6 growth=29 churn=41   |H|=12   mods=9   η=0.75   ρ=41/12
authors:     Alice Smith  6 commits, churn 19 (2 raw idents folded via .mailmap)
             Bob Beta     6 commits, churn 22 (1 ident)
files:       README.md +5/-1, src/main.c +10/-1, src/util.c +5/-0,
             docs/readme.md +4/-4, docs/api/ref.md +2/-0, src/core/helper.c +2/-0,
             docs/notes.txt +2/-0, src/feat.c +3/-0, .mailmap +2/-0
```

---

## 4. Tests, typecheck and the metrics oracle

```bash
npm test            # Jest + supertest suite for the API (temp SQLite, mocked git)
npm run typecheck   # tsc --noEmit for both workspaces
```

The Jest suite (114 tests) covers the log parser edge cases, the metric-engine
math against hand-computed values, every route (success paths, validation 400s,
unknown-id 404s), the canonical author-merge lifecycle, the multi-repo compare
endpoint, the materialized-rollup/live-path equality, and the ingestion
lifecycle with mocked pipeline services.

### Independent oracle (`scripts/verifyMetrics.ts`)

A standalone script that re-derives metrics **straight from git** (its own
numstat parser — deliberately not reusing the API's code) and diffs the result
against the running API: repository totals, ts-range and commit-id filters,
top file, directory subtree, resolved authors (including ownership ≈ churn
share), the commits listing, the day timeseries, the materialized-rollup
agreement (unfiltered reads vs the live path) and the multi-repo compare
endpoint.

```bash
# With the API running and the repository ingested:
npm run verify -- --repo fixture
npm run verify -- --repo cJSON

# Optional flags
npm run verify -- --repo cJSON --api http://localhost:4000 --git-dir /path/to/repo.git
npm run verify -- --repo fixture --compare-with cJSON
```

Exit code 0 means every check passed; on failure the script prints each
mismatch with expected vs actual values. It locates the stored git repository
via `$RAT_STORAGE_DIR` (default `<repo root>/storage`), so if you start the API
with a custom storage directory, pass the same variable when running the
oracle.

Reference result: `108/108` checks on the fixture and `122/122` on a full
cJSON clone, matching the hand-computed values above (the totals include the
rollup-agreement and compare checks added with the upper-tier features).

---

## 5. Project structure

```
.
├── package.json                  # npm workspaces + dev/test/verify scripts
├── tsconfig.base.json
├── .env.example                  # documented environment variables
├── Design.md                     # design system (tokens + §11 project extensions)
├── scripts/
│   ├── makeFixtureRepo.sh        # deterministic fixture repository (+ zip)
│   └── verifyMetrics.ts          # independent git-based metrics oracle
├── packages/shared/src/types.ts  # DTO types shared by API and web
├── apps/api/
│   ├── src/
│   │   ├── index.ts              # bootstrap: config → storage → db → queue → listen
│   │   ├── app.ts                # Express app factory (CORS, routers, error handler)
│   │   ├── config.ts             # env parsing + storage paths
│   │   ├── db/                   # better-sqlite3 connection, schema, repo store
│   │   ├── git/                  # git CLI runner + streaming log/numstat parser
│   │   ├── ingest/               # zip extraction, clone mirror, validation, pipeline, jobs
│   │   ├── jobs/                 # in-process FIFO queue + job store
│   │   ├── analysis/             # history analysis (commits → DB), ident resolution
│   │   ├── metrics/              # commit-set filters, engine, materialized rollups
│   │   ├── routes/               # repositories, jobs, commits, authors, metrics, compare
│   │   └── middleware/           # validation helpers + structured error handler
│   └── test/                     # Jest + supertest suites (routes, parser, engine)
└── apps/web/
    └── src/
        ├── app/                  # App Router pages (home, repos/[repoId], compare)
        ├── components/           # common, ingest, filters, metrics, charts
        ├── lib/                  # typed API client, SWR hooks, formatting
        └── styles/globals.css    # design tokens + component styles (Design.md)
```

---

## 6. Architecture summary

### API (Express + TypeScript)

- **Storage** — everything lives under `storage/` (configurable): uploaded zips
  and cloned mirrors under `storage/repos/<repoId>/`, SQLite database at
  `storage/rat.db`.
- **Database (SQLite, WAL)** — a single fact table `commit_file_stats`
  (one row per file per commit) plus `repositories`, `commits`, `jobs`,
  `raw_idents` and the manual author-merge map (`canonical_authors` +
  `author_merges`). Unfiltered reads are served from materialized rollup tables
  (`rollup_repo`, `rollup_file`, `rollup_day`) built at finalize time — and
  lazily for databases that predate them; filtered reads stay on the fact
  table, and the test suite asserts both paths return identical numbers.
- **Ingestion pipeline** — an in-process FIFO queue (concurrency 1) drives jobs
  through phases: `extracting|cloning → validating → analyzing → finalizing`.
  Analysis streams `git log --no-merges -M50% --numstat` and batches inserts
  (500 commits per transaction), collecting directories and raw author idents
  along the way. Merge commits are excluded; empty commits stay in the
  denominator `|H|`; binary and zero-change rows contribute nothing.
- **Author resolution** — computed at query time with precedence
  manual canonical map > `.mailmap` > raw ident. The stable identity key is
  `canonical:<id>` or `mailto:<lowercased email>`. Manual merges are managed
  through the canonical-author endpoints (or the Authors-tab merge panel); a
  change is reflected in every metrics view immediately.
- **Metrics engine** — every metric endpoint accepts the same commit-set
  filters (`fromTs`/`toTs` half-open range, `commitIds`, `authorId`) and a path
  scope where relevant. Formulas follow the brief: growth `δ = l⁺ − l⁻`,
  churn `λ = l⁺ + l⁻`, modifications `n_H,o` (distinct commits touching the
  object), frequency `η = n/|H|`, rate `ρ = λ/|H|`, ownership
  `ω = λ_H,o,a / λ_H,o`. Timeseries buckets are UTC days (`YYYY-MM-DD`) or
  Monday-based weeks (`YYYY-Www`). The compare endpoint replays the same engine
  over 2–8 ready repositories — a shared absolute range, or per-repository
  `lastDays` windows anchored to each repository's own newest commit.

### Web (Next.js 14 App Router)

- Typed API client (`src/lib/api.ts`) over the REST surface; SWR hooks poll
  while a repository/job is busy and keep previous data while filters change.
- Dashboard: metric cards, sortable/paged file table, directory breadcrumb
  drill-down (depth 1–5), author table with ownership bars, churn-over-time
  chart (day/week) and a top-files chart whose bars set the path scope.
- Upper-tier tooling: a manual commit-selection picker (an explicit commit set
  that overrides the range presets), a collapsible author-merge panel in the
  Authors tab (create/extend/unmerge canonical authors) and a `/compare` page
  (up to eight repositories with a metric table and grouped bar chart).
- All styling comes from `src/styles/globals.css`, implementing the tokens of
  [`Design.md`](Design.md); the gaps the extraction documented (status colors,
  data tables, badges, charts, timings) are filled as project extensions in
  Design.md §11.

### API surface

| Method & path | Purpose |
|---|---|
| `GET /api/health` | Liveness probe. |
| `POST /api/repositories/upload` | Multipart zip upload (`.git` inside required). |
| `POST /api/repositories/clone` | `{ "url": "..." }` mirror clone. |
| `GET /api/repositories` / `GET /api/repositories/:id` | List / fetch repositories. |
| `DELETE /api/repositories/:id` | Delete repository + storage + rows (409 while a job is active). |
| `GET /api/jobs/:id` | Poll an ingestion job. |
| `GET /api/repositories/:id/commits` | Commit listing (`q` search, `page`, `pageSize`, commit-set filters). |
| `GET /api/repositories/:id/commits/:sha/stats` | Per-commit file stats. |
| `GET /api/repositories/:id/authors` | Resolved authors + raw idents. |
| `GET /api/repositories/:id/authors/canonical` | List manual author merges. |
| `POST /api/repositories/:id/authors/canonical` | Create a merge (`name`, `email`, `identIds`). |
| `PATCH /api/repositories/:id/authors/canonical/:cid` | Rename / replace the ident set (empty set deletes the merge). |
| `DELETE /api/repositories/:id/authors/canonical/:cid` | Delete a merge (unmerge all idents). |
| `GET /api/repositories/:id/paths` | All files + directories in history. |
| `GET /api/repositories/:id/metrics/repository` | Object metrics for the whole repo + `\|H\|`, first/last ts. |
| `GET /api/repositories/:id/metrics/files` | Per-file metrics (`pathPrefix`, `sort`, `order`, paging). |
| `GET /api/repositories/:id/metrics/directories` | Subtree metrics (`path`, `depth` 1–5). |
| `GET /api/repositories/:id/metrics/authors` | Per-author metrics + ownership (`path` scope). |
| `GET /api/repositories/:id/metrics/timeseries` | `bucket=day\|week` points (`path` scope). |
| `GET /api/metrics/compare` | Compare 2–8 repositories (`repoIds`, `lastDays` or `fromTs`/`toTs`). |

Errors are structured: `{ "code": "...", "message": "..." }` with codes such as
`REPO_NOT_FOUND`, `REPO_NOT_READY`, `VALIDATION`, `UPLOAD_NOT_ZIP`,
`DELETE_ACTIVE_JOB`, `CANONICAL_NOT_FOUND`, `IDENT_ALREADY_MERGED`.

---

## 7. Environment variables

All optional — see `.env.example`. Copy it to `.env` at the repo root to
override:

| Variable | Default | Effect |
|---|---|---|
| `API_PORT` | `4000` | API listen port. |
| `RAT_STORAGE_DIR` | `./storage` | Storage root (zips, mirrors, SQLite DB). |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` | API base URL (web; build-time, use `apps/web/.env.local`). |
| `MAX_UPLOAD_MB` | `512` | Zip upload size limit. |
| `CLONE_TIMEOUT_MS` | `1800000` | `git clone` timeout. |

---

## 8. What is in scope

Implemented (basic tier):

- Both ingestion sources with a safe zip extractor, `git` validation and
  actionable errors; async jobs with progress polling; repository delete.
- Full history analysis (streaming parser, renames/copies at `-M50%`, binary
  detection, C-quoted paths) and all five metric families of the brief.
- Query-time commit-set filters (range, explicit commit ids, author) and path
  scopes; day/week timeseries; commit search; resolved-author reporting.
- Next.js dashboard with filters, four tabs, tables and charts; design-token
  styling with project extensions documented in Design.md §11.
- Jest + supertest test suite, deterministic fixture, independent metrics
  oracle.

Upper tier (deferred in the original basic scope — now implemented):

- Manual commit-selection UI — a commit picker (search, paging, select-page)
  applies an explicit commit set across every metric view while the range
  presets are suspended (the API treats `commitIds` and the ts range as
  mutually exclusive).
- Author-merge UI — canonical authors managed from the Authors tab (merge
  selected identities, extend/rename, per-ident unmerge, unmerge all) on top of
  the canonical map API; merged authors override the mailmap layer everywhere.
- Multi-repository comparisons — a `/compare` page plus the compare endpoint:
  2–8 ready repositories over a shared absolute range or per-repo-anchored
  relative windows, shown as a metric table and a grouped bar chart.
- Materialized rollups — pre-computed repo/file/day tables built at finalize
  (self-healing for older databases) serving all unfiltered reads, with tests
  and the oracle asserting equality with the live fact-table path.

---

## 9. Troubleshooting

- **`better-sqlite3` fails to load after `npm install`** — the prebuilt binary
  download was blocked. Either install build tools (`python3`, `make`, `g++`)
  and run `npm rebuild better-sqlite3 --build-from-source`, or side-load the
  official prebuilt binary:

  ```bash
  node scripts/fix-native.js
  ```

  (On Debian/Ubuntu, `sudo apt-get install -y build-essential python3` first if
  you go the source-build route.)

- **Port already in use** — set `API_PORT` (API) or run the web app on another
  port with `PORT=3001 npm run dev:web`.
- **Clone fails** — clone mode needs outbound HTTPS to the remote host;
  `git` must be ≥ 2.30. Error details are surfaced in the job's `error` field
  and in the UI banner.
- **Zip rejected** — the archive must contain a full `.git` directory (or a
  bare `HEAD`/`objects/`/`refs/` layout). Zips produced from a working tree
  without `.git`, or containing only a `.git` *file* (submodule/worktree
  pointer), are rejected with a specific error code.
- **Oracle cannot find the git dir** — pass `--git-dir <path>` explicitly, or
  make sure `RAT_STORAGE_DIR` matches the one the API was started with.

---

## 10. Where things are specified

- Product requirements: the original brief (metric definitions, ingestion
  rules, API expectations).
- Visual system: [`Design.md`](Design.md) — tokens and rules in §1–§9, project
  extensions in §11.
- Implementation plan and verification checklist: the build plan document.
