# Materialized Rollup Performance System

<cite>
**Referenced Files in This Document**   
- [README.md](file://README.md)
- [Design.md](file://Design.md)
- [schema.sql](file://apps/api/src/db/schema.sql)
- [database.ts](file://apps/api/src/db/database.ts)
- [rollup.ts](file://apps/api/src/metrics/rollup.ts)
- [objectMetrics.ts](file://apps/api/src/metrics/objectMetrics.ts)
- [commitSet.ts](file://apps/api/src/metrics/commitSet.ts)
- [setMetrics.ts](file://apps/api/src/metrics/setMetrics.ts)
- [metrics.ts](file://apps/api/src/routes/metrics.ts)
- [pipeline.ts](file://apps/api/src/ingest/pipeline.ts)
- [finalize.ts](file://apps/api/src/analysis/finalize.ts)
- [queue.ts](file://apps/api/src/jobs/queue.ts)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)

## Introduction
This document explains the materialized rollup performance system used by the Repo Analysis Tool (RAT). The system stores git history as a single fact table and computes most metrics at query time. For common dashboard reads, it pre-computes repository-level, per-file, and daily rollups so that unfiltered queries avoid scanning the large fact table.

The implementation is intentionally conservative: rollups are only used when a query has no commit-set filters and uses whole-repository scope. Filtered or scoped queries continue to compute live from the fact table. Correctness is enforced by mirroring the live SQL logic in the rollup builders and asserting equivalence through tests.

## Project Structure
The rollup feature spans database schema, ingestion finalization, metric routing, and the rollup engine itself.

```mermaid
graph TB
subgraph "Ingestion"
PIPE["Pipeline<br/>processZip/processClone"]
FINALIZE["Finalize<br/>finalizeRepo"]
QUEUE["Queue<br/>FIFO concurrency 1"]
end
subgraph "Database"
SCHEMA["Schema<br/>fact + rollup tables"]
DBOPEN["Database Open<br/>WAL + schema load"]
end
subgraph "Metrics Engine"
ROUTES["Routes<br/>metricsRouter"]
SETMETRICS["Repository Metrics<br/>queryRepoMetrics"]
OBJMETRICS["Object Metrics<br/>queryObjectSums/queryTimeseries"]
COMMITSET["Commit Set Filters<br/>buildFiltersSql"]
ROLLUP["Rollup Engine<br/>ensure/read rollups"]
end
PIPE --> QUEUE
QUEUE --> PIPE
PIPE --> FINALIZE
FINALIZE --> ROLLUP
ROUTES --> SETMETRICS
ROUTES --> OBJMETRICS
ROUTES --> ROLLUP
SETMETRICS --> ROLLUP
OBJMETRICS --> COMMITSET
ROLLUP --> SCHEMA
SCHEMA --> DBOPEN
```

**Diagram sources**
- [pipeline.ts:41-130](file://apps/api/src/ingest/pipeline.ts#L41-L130)
- [finalize.ts:12-27](file://apps/api/src/analysis/finalize.ts#L12-L27)
- [queue.ts:15-53](file://apps/api/src/jobs/queue.ts#L15-L53)
- [schema.sql:101-139](file://apps/api/src/db/schema.sql#L101-L139)
- [database.ts:12-21](file://apps/api/src/db/database.ts#L12-L21)
- [metrics.ts:82-223](file://apps/api/src/routes/metrics.ts#L82-L223)
- [setMetrics.ts:31-55](file://apps/api/src/metrics/setMetrics.ts#L31-L55)
- [objectMetrics.ts:80-217](file://apps/api/src/metrics/objectMetrics.ts#L80-L217)
- [commitSet.ts:104-145](file://apps/api/src/metrics/commitSet.ts#L104-L145)
- [rollup.ts:49-171](file://apps/api/src/metrics/rollup.ts#L49-L171)

**Section sources**
- [README.md:176-239](file://README.md#L176-L239)
- [README.md:257-274](file://README.md#L257-L274)

## Core Components
- Fact table and derived tables: `commit_file_stats`, `commits`, `raw_idents`, `repo_dirs`, plus three rollup tables for repository totals, per-file aggregates, and daily series.
- Rollup builder: idempotent transactional creation of all rollup tables for a repository.
- Rollup readers: fast paths for repository totals, file list with optional path prefix, and day/week timeseries.
- Query-time fallback: object sums, file aggregates, author metrics, and timeseries computed directly from the fact table when filters or scopes prevent rollup use.
- Routing policy: routes decide whether to serve from rollups or live computation based on filter presence and path scope.

**Section sources**
- [schema.sql:53-139](file://apps/api/src/db/schema.sql#L53-L139)
- [rollup.ts:6-20](file://apps/api/src/metrics/rollup.ts#L6-L20)
- [metrics.ts:86-223](file://apps/api/src/routes/metrics.ts#L86-L223)

## Architecture Overview
The system separates ingestion, storage, and query-time analytics. Rollups are built once during finalization and lazily rebuilt if missing. Routes then choose between rollups and live computation.

```mermaid
sequenceDiagram
participant Client as "Client"
participant Routes as "metricsRouter"
participant SetM as "queryRepoMetrics"
participant ObjM as "queryObjectSums/queryTimeseries"
participant Rollup as "ensureRollup/readRollup"
participant DB as "SQLite"
Client->>Routes : GET /repositories/ : id/metrics/repository
Routes->>Routes : parseMetricFilters()
Routes->>Routes : isUnfiltered(filters)?
alt Unfiltered
Routes->>Rollup : ensureRollup(repoId)
Rollup->>DB : build rollup_repo/rollup_file/rollup_day
Routes->>SetM : queryRepoMetrics(repoId, filters)
SetM->>Rollup : readRepoRollup(repoId)
Rollup-->>SetM : RepoRollupRow
SetM-->>Routes : RepoMetricsDTO
else Filtered
Routes->>ObjM : queryObjectSums(...)
ObjM->>DB : scan commit_file_stats
ObjM-->>Routes : ObjectSums
end
Routes-->>Client : JSON response
```

**Diagram sources**
- [metrics.ts:86-93](file://apps/api/src/routes/metrics.ts#L86-L93)
- [setMetrics.ts:31-55](file://apps/api/src/metrics/setMetrics.ts#L31-L55)
- [rollup.ts:49-97](file://apps/api/src/metrics/rollup.ts#L49-L97)
- [objectMetrics.ts:80-98](file://apps/api/src/metrics/objectMetrics.ts#L80-L98)

## Detailed Component Analysis

### Database Schema and Storage Model
The schema defines:
- A single fact table `commit_file_stats` storing added and removed lines per commit and path.
- Metadata tables for repositories, jobs, commits, raw idents, mailmap resolution, canonical authors, manual merges, and directory enumeration.
- Three rollup tables:
  - `rollup_repo`: repository-wide totals and commit count/time span.
  - `rollup_file`: per-file aggregates over the entire repository.
  - `rollup_day`: daily buckets of commits, added, and removed lines.

Indexes support filtering by repository, commit timestamp, author identity, and path prefixes.

```mermaid
erDiagram
REPOSITORIES {
text id PK
text name
text source_type
text source_ref
text storage_path
text status
text error
text head_sha
integer commit_count
integer created_at
integer ready_at
}
JOBS {
text id PK
text repo_id FK
text type
text status
text phase
real progress
text error
integer created_at
integer started_at
integer finished_at
}
RAW_IDENTS {
integer id PK
text repo_id FK
text name
text email
}
COMMITS {
integer id PK
text repo_id FK
text sha
text parent_sha
integer ts
integer raw_ident_id FK
}
COMMIT_FILE_STATS {
text repo_id FK
integer commit_id FK
text path
integer added
integer removed
}
REPO_DIRS {
text repo_id FK
text path
}
ROLLUP_REPO {
text repo_id PK
integer commit_count
integer first_ts
integer last_ts
integer added
integer removed
integer modifications
}
ROLLUP_FILE {
text repo_id FK
text path
integer added
integer removed
integer modifications
}
ROLLUP_DAY {
text repo_id FK
text day
integer commits
integer added
integer removed
}
REPOSITORIES ||--o{ JOBS : "has"
REPOSITORIES ||--o{ COMMITS : "has"
REPOSITORIES ||--o{ COMMIT_FILE_STATS : "has"
REPOSITORIES ||--o{ REPO_DIRS : "has"
REPOSITORIES ||--|| ROLLUP_REPO : "has"
REPOSITORIES ||--o{ ROLLUP_FILE : "has"
REPOSITORIES ||--o{ ROLLUP_DAY : "has"
COMMITS ||--o{ COMMIT_FILE_STATS : "has"
```

**Diagram sources**
- [schema.sql:5-139](file://apps/api/src/db/schema.sql#L5-L139)

**Section sources**
- [schema.sql:53-139](file://apps/api/src/db/schema.sql#L53-L139)
- [database.ts:7-21](file://apps/api/src/db/database.ts#L7-L21)

### Rollup Builder and Readers
The rollup module provides:
- `isUnfiltered`: determines whether a query can be served from rollups.
- `ensureRollup`: builds all three rollup tables in one transaction; returns false if the repository does not exist.
- `readRepoRollup`, `readFileRollup`, `readTimeseriesRollup`: fast reads for repository totals, files with optional prefix, and day/week series.

Correctness contract: rollup SQL mirrors the live query logic for whole-history, root-scope cases. Tests assert identical DTOs across both paths.

```mermaid
flowchart TD
Start(["ensureRollup(repoId)"]) --> CheckRepo["Check repository exists"]
CheckRepo --> |No| ReturnFalse["Return false"]
CheckRepo --> |Yes| HasRollup{"Rollup exists?"}
HasRollup --> |Yes| ReturnTrue["Return true"]
HasRollup --> |No| BeginTx["Begin transaction"]
BeginTx --> BuildRepo["Build rollup_repo"]
BuildRepo --> BuildFile["Build rollup_file"]
BuildFile --> BuildDay["Build rollup_day"]
BuildDay --> CommitTx["Commit transaction"]
CommitTx --> ReturnTrue
```

**Diagram sources**
- [rollup.ts:49-91](file://apps/api/src/metrics/rollup.ts#L49-L91)

**Section sources**
- [rollup.ts:6-20](file://apps/api/src/metrics/rollup.ts#L6-L20)
- [rollup.ts:31-43](file://apps/api/src/metrics/rollup.ts#L31-L43)
- [rollup.ts:49-97](file://apps/api/src/metrics/rollup.ts#L49-L97)
- [rollup.ts:104-171](file://apps/api/src/metrics/rollup.ts#L104-L171)

### Query-Time Metric Engine
The live engine computes:
- Repository-wide sums via `queryObjectSums`.
- Per-file aggregates via `queryFileAggregates`.
- Timeseries via `queryTimeseries`, merging commit counts and churn per bucket.
- Path scoping using index-friendly subtree ranges for directories.

Author resolution joins are applied consistently across commit-scoped queries.

```mermaid
classDiagram
class CommitSet {
+parseMetricFilters(query)
+buildFiltersSql(repoId, filters)
+commitSetInfo(db, repoId, filters)
}
class ObjectMetrics {
+resolvePathScope(db, repoId, rawPath)
+pathScopeSql(scope)
+queryObjectSums(db, repoId, filters, scope)
+queryFileAggregates(db, repoId, filters, pathPrefix)
+queryTimeseries(db, repoId, filters, scope, bucket)
}
class SetMetrics {
+toObjectMetricsDTO(sums, commitCount)
+queryRepoMetrics(db, repoId, filters)
}
class Rollup {
+isUnfiltered(filters)
+ensureRollup(db, repoId)
+readRepoRollup(db, repoId)
+readFileRollup(db, repoId, pathPrefix)
+readTimeseriesRollup(db, repoId, bucket)
}
ObjectMetrics --> CommitSet : "uses"
SetMetrics --> ObjectMetrics : "uses"
SetMetrics --> Rollup : "uses"
ObjectMetrics --> Rollup : "correctness mirror"
```

**Diagram sources**
- [commitSet.ts:58-145](file://apps/api/src/metrics/commitSet.ts#L58-L145)
- [objectMetrics.ts:24-217](file://apps/api/src/metrics/objectMetrics.ts#L24-L217)
- [setMetrics.ts:12-55](file://apps/api/src/metrics/setMetrics.ts#L12-L55)
- [rollup.ts:31-171](file://apps/api/src/metrics/rollup.ts#L31-L171)

**Section sources**
- [objectMetrics.ts:11-36](file://apps/api/src/metrics/objectMetrics.ts#L11-L36)
- [objectMetrics.ts:80-98](file://apps/api/src/metrics/objectMetrics.ts#L80-L98)
- [objectMetrics.ts:111-136](file://apps/api/src/metrics/objectMetrics.ts#L111-L136)
- [objectMetrics.ts:152-217](file://apps/api/src/metrics/objectMetrics.ts#L152-L217)
- [commitSet.ts:104-145](file://apps/api/src/metrics/commitSet.ts#L104-L145)
- [setMetrics.ts:12-55](file://apps/api/src/metrics/setMetrics.ts#L12-L55)

### Route-Level Rollup Policy
Routes implement the decision logic:
- Repository metrics: if unfiltered, ensure rollup and serve from `rollup_repo`; otherwise compute live.
- File metrics: if unfiltered and rollup exists, read from `rollup_file`; otherwise compute live aggregates.
- Directory metrics: always compute live because they require directory metadata and nested aggregation.
- Author metrics: always compute live due to author resolution and ownership calculations.
- Timeseries: if unfiltered and whole-repository scope, serve from `rollup_day`; otherwise compute live.

```mermaid
flowchart TD
Req["Incoming metrics request"] --> Parse["Parse filters + scope"]
Parse --> Decision{"Unfiltered AND<br/>whole-repo scope?"}
Decision --> |Yes| Ensure["ensureRollup()"]
Ensure --> ServeRollup["Serve from rollup tables"]
Decision --> |No| LiveCompute["Compute from fact table"]
ServeRollup --> Response["JSON response"]
LiveCompute --> Response
```

**Diagram sources**
- [metrics.ts:86-223](file://apps/api/src/routes/metrics.ts#L86-L223)
- [rollup.ts:31-43](file://apps/api/src/metrics/rollup.ts#L31-L43)

**Section sources**
- [metrics.ts:86-93](file://apps/api/src/routes/metrics.ts#L86-L93)
- [metrics.ts:95-135](file://apps/api/src/routes/metrics.ts#L95-L135)
- [metrics.ts:137-194](file://apps/api/src/routes/metrics.ts#L137-L194)
- [metrics.ts:196-223](file://apps/api/src/routes/metrics.ts#L196-L223)

### Ingestion Finalization and Rollup Materialization
During ingestion:
- Pipeline stages extract or clone the source, validate, analyze commits, resolve mailmaps, and finalize.
- Finalization inserts known directories, calls `ensureRollup`, and marks the repository ready.
- Queue ensures single-concurrency ingestion tasks, keeping I/O and DB writes predictable.

```mermaid
sequenceDiagram
participant Queue as "JobQueue"
participant Pipeline as "createPipeline"
participant Analyze as "analyzeCommits"
participant Finalize as "finalizeRepo"
participant Rollup as "ensureRollup"
participant Store as "repoStore"
Queue->>Pipeline : enqueue(task)
Pipeline->>Pipeline : processZip/processClone
Pipeline->>Analyze : stream git log + numstat
Analyze-->>Pipeline : dirs, commitCount
Pipeline->>Finalize : finalizeRepo(dirs, headSha, commitCount)
Finalize->>Rollup : ensureRollup(repoId)
Rollup-->>Finalize : rollup tables built
Finalize->>Store : markReady(repoId)
```

**Diagram sources**
- [pipeline.ts:41-130](file://apps/api/src/ingest/pipeline.ts#L41-L130)
- [finalize.ts:12-27](file://apps/api/src/analysis/finalize.ts#L12-L27)
- [queue.ts:15-53](file://apps/api/src/jobs/queue.ts#L15-L53)

**Section sources**
- [pipeline.ts:29-37](file://apps/api/src/ingest/pipeline.ts#L29-L37)
- [pipeline.ts:86-113](file://apps/api/src/ingest/pipeline.ts#L86-L113)
- [finalize.ts:5-11](file://apps/api/src/analysis/finalize.ts#L5-L11)
- [finalize.ts:12-27](file://apps/api/src/analysis/finalize.ts#L12-L27)
- [queue.ts:1-6](file://apps/api/src/jobs/queue.ts#L1-L6)

## Dependency Analysis
Key dependencies and coupling:
- Routes depend on metric functions and rollup helpers to select the fastest correct path.
- Rollup depends on schema-defined tables and must mirror live SQL semantics.
- Object metrics depend on commit set filters and path scoping utilities.
- Finalization depends on pipeline outputs and triggers rollup materialization before marking readiness.

```mermaid
graph LR
METRICS_ROUTES["routes/metrics.ts"] --> SET_METRICS["metrics/setMetrics.ts"]
METRICS_ROUTES --> OBJECT_METRICS["metrics/objectMetrics.ts"]
METRICS_ROUTES --> ROLLUP["metrics/rollup.ts"]
SET_METRICS --> ROLLUP
OBJECT_METRICS --> COMMIT_SET["metrics/commitSet.ts"]
PIPELINE["ingest/pipeline.ts"] --> FINALIZE["analysis/finalize.ts"]
FINALIZE --> ROLLUP
SCHEMA["db/schema.sql"] --> ROLLUP
```

**Diagram sources**
- [metrics.ts:82-223](file://apps/api/src/routes/metrics.ts#L82-L223)
- [setMetrics.ts:1-55](file://apps/api/src/metrics/setMetrics.ts#L1-L55)
- [objectMetrics.ts:1-217](file://apps/api/src/metrics/objectMetrics.ts#L1-L217)
- [commitSet.ts:1-145](file://apps/api/src/metrics/commitSet.ts#L1-L145)
- [pipeline.ts:41-130](file://apps/api/src/ingest/pipeline.ts#L41-L130)
- [finalize.ts:12-27](file://apps/api/src/analysis/finalize.ts#L12-L27)
- [schema.sql:101-139](file://apps/api/src/db/schema.sql#L101-L139)

**Section sources**
- [metrics.ts:82-223](file://apps/api/src/routes/metrics.ts#L82-L223)
- [rollup.ts:6-20](file://apps/api/src/metrics/rollup.ts#L6-L20)
- [finalize.ts:5-11](file://apps/api/src/analysis/finalize.ts#L5-L11)

## Performance Considerations
- Rollups reduce repeated scans of the fact table for common dashboard reads. They are built once per repository and reused until the repository is deleted or re-ingested.
- Only unfiltered, whole-repository queries use rollups. Any filter (`fromTs`/`toTs`, explicit commit IDs, author ID) or path scope forces live computation.
- SQLite WAL mode and batched transactions improve ingestion throughput while preserving durability.
- Directory scoping uses index-friendly substring ranges to minimize full-table scans.
- The queue limits ingestion concurrency to one, preventing resource contention during long-running analysis.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
- If rollup tables are missing for an existing repository, the first unfiltered read will attempt to build them via `ensureRollup`. If the repository row does not exist, the function returns false and no rollup is created.
- If filtered queries appear slow, confirm that filters are necessary; rollups cannot serve filtered requests.
- If ingestion stalls, check the in-process queue size and job phases; only one task runs at a time.
- If the API reports repository-not-ready errors, verify that the ingestion pipeline completed successfully and that `markReady` was called after finalization.

**Section sources**
- [rollup.ts:49-52](file://apps/api/src/metrics/rollup.ts#L49-L52)
- [queue.ts:1-6](file://apps/api/src/jobs/queue.ts#L1-L6)
- [pipeline.ts:113-118](file://apps/api/src/ingest/pipeline.ts#L113-L118)

## Conclusion
The materialized rollup system balances correctness and performance by precomputing only the most common dashboard queries while retaining flexible, accurate live computation for filtered or scoped workloads. Its design is transparent: rollup SQL mirrors live SQL, and routing logic explicitly chooses the fastest valid path. For very large histories, this approach reduces latency for typical usage without sacrificing analytical flexibility.

[No sources needed since this section summarizes without analyzing specific files]