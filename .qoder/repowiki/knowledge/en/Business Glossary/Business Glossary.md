---
kind: business_term
name: Business Glossary
category: business_term
scope:
    - '**'
---

### RAT
- Definition：Repo Analysis Tool — the COMS3011A project name for this web dashboard that ingests git repositories (from a `.git`-containing zip or a clone URL) and computes line-based metrics per commit across file, directory, repository, commit-set, and author dimensions.
- Aliases：Repo Analysis Tool

### ingestion
- Definition：The process of taking a git repository input (zip upload or remote clone URL), cloning it into `storage/repos/<uuid>/src`, parsing the git log/diffs, computing metrics, and persisting results to the SQLite store. Exposed via the `/api/repositories` POST endpoint and executed asynchronously via the job queue.
- Aliases：repo ingestion、ingest

### commit-set metrics
- Definition：Metrics computed over an arbitrary set of commits selected by filters (path prefix, author, date range) rather than the full repository history. Includes total additions/removals, number of changed files, and churn-over-time timeseries.
- Aliases：set metrics

### author metrics
- Definition：Per-author statistics derived from the commit log and diffs: ownership share, additions, deletions, net change, churn rate, and commit count, with mailmap/manual merging resolving multiple emails to a canonical identity.
- Aliases：author stats

### mailmap
- Definition：A `.mailmap` file inside the repository used to map multiple email addresses to a single canonical author identity before computing author-level metrics.
- Aliases：.mailmap

### rename detection (-M50%)
- Definition：Git diff option `-M50%` used during ingestion to treat file renames as modifications rather than delete+add, ensuring rename-heavy refactors do not inflate addition/deletion counts.
- Aliases：-M50%、rename detection

### oracle
- Definition：The independent verification CLI `scripts/verifyMetrics.ts` that re-derives metrics from raw `git log --numstat` output and diffs them against the live API responses, serving as the ground-truth check for both fixture and real repos (e.g. cJSON).
- Aliases：metrics oracle、verifyMetrics

### fixture repo
- Definition：The deterministic sample repository under `storage/fixture-repo/` (and its zipped counterpart `storage/fixture.zip`) used to drive smoke tests, e2e flows, and oracle checks. Contains a small C project with known commit history, a `.mailmap`, and binary assets.
- Aliases：fixture、fixture.zip
