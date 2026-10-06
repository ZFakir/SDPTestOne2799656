# Shared TypeScript Types

<cite>
**Referenced Files in This Document**
- [types.ts](file://packages/shared/src/types.ts)
- [index.ts](file://packages/shared/src/index.ts)
- [package.json](file://packages/shared/package.json)
- [schema.sql](file://apps/api/src/db/schema.sql)
- [repositories.ts](file://apps/api/src/routes/repositories.ts)
- [jobs.ts](file://apps/api/src/routes/jobs.ts)
- [commits.ts](file://apps/api/src/routes/commits.ts)
- [authors.ts](file://apps/api/src/routes/authors.ts)
- [metrics.ts](file://apps/api/src/routes/metrics.ts)
- [compare.ts](file://apps/api/src/routes/compare.ts)
- [setMetrics.ts](file://apps/api/src/metrics/setMetrics.ts)
- [canonicalStore.ts](file://apps/api/src/db/canonicalStore.ts)
- [api.ts](file://apps/web/src/lib/api.ts)
- [CloneUrlForm.tsx](file://apps/web/src/components/ingest/CloneUrlForm.tsx)
- [MetricCards.tsx](file://apps/web/src/components/metrics/MetricCards.tsx)
- [FilterBar.tsx](file://apps/web/src/components/filters/FilterBar.tsx)
- [ComparePage.tsx](file://apps/web/src/app/compare/page.tsx)
- [CompareMetricsChart.tsx](file://apps/web/src/components/metrics/charts/CompareMetricsChart.tsx)
</cite>

## Update Summary
**Changes Made**
- Added new CanonicalAuthorDTO, CanonicalAuthorsResponse, and CanonicalAuthorInput interfaces for manual author merging functionality
- Introduced CompareRepoDTO and CompareResponse interfaces for multi-repository comparison capabilities
- Enhanced RawIdentDTO with commitCount field for better identity tracking
- Updated all related sections to document the new comparison and canonical author features

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
This document explains the shared TypeScript type definitions that provide contract consistency between the RAT API and the web frontend. The shared package exports only types, so it introduces no runtime dependency while ensuring both layers agree on repository, job, commit, author, path, metric, and comparison payloads. It also documents how these types map to the SQLite schema, how discriminated unions and strict numeric typing enforce correctness, and how API routes and frontend components consume them.

## Project Structure
The monorepo uses a dedicated `@rat/shared` package as the single source of truth for DTOs:

- `packages/shared/src/types.ts`: all exported interfaces, types, and enumerations used by both workspaces.
- `packages/shared/src/index.ts`: re-exports only types from `types.ts`.
- `packages/shared/package.json`: declares the package entry points and marks it as private.
- `apps/api`: Express routes import shared types and convert database rows into DTOs before responding.
- `apps/web`: Next.js client library imports shared types to strongly type API responses and request helpers.

```mermaid
graph TB
subgraph "Shared Package"
ST["packages/shared/src/types.ts"]
SI["packages/shared/src/index.ts"]
SP["packages/shared/package.json"]
end
subgraph "API Workspace"
AR["apps/api/src/routes/*.ts"]
SM["apps/api/src/metrics/setMetrics.ts"]
CS["apps/api/src/db/canonicalStore.ts"]
DS["apps/api/src/db/schema.sql"]
end
subgraph "Web Workspace"
WA["apps/web/src/lib/api.ts"]
WF["apps/web/src/components/**/*.tsx"]
CP["apps/web/src/app/compare/page.tsx"]
end
ST --> SI
SP --> ST
AR --> ST
SM --> ST
CS --> ST
WA --> ST
WF --> WA
CP --> WA
DS -. maps to .-> ST
```

**Diagram sources**
- [types.ts:1-266](file://packages/shared/src/types.ts#L1-L266)
- [index.ts:1-2](file://packages/shared/src/index.ts#L1-L2)
- [package.json:1-11](file://packages/shared/package.json#L1-L11)
- [schema.sql:1-106](file://apps/api/src/db/schema.sql#L1-L106)
- [repositories.ts:1-166](file://apps/api/src/routes/repositories.ts#L1-L166)
- [metrics.ts:1-199](file://apps/api/src/routes/metrics.ts#L1-L199)
- [setMetrics.ts:1-36](file://apps/api/src/metrics/setMetrics.ts#L1-L36)
- [api.ts:1-326](file://apps/web/src/lib/api.ts#L1-L326)

**Section sources**
- [types.ts:1-266](file://packages/shared/src/types.ts#L1-L266)
- [index.ts:1-2](file://packages/shared/src/index.ts#L1-L2)
- [package.json:1-11](file://packages/shared/package.json#L1-L11)

## Core Components
The shared types are organized around six areas: repositories and jobs, commits and authors, paths, metrics, common envelopes, and multi-repository comparison.

### Repository and Job Types
- `RepoSourceType`: `'zip' | 'url'`.
- `RepoStatus`: `'queued' | 'processing' | 'ready' | 'error'`.
- `JobStatus`: `'queued' | 'running' | 'done' | 'failed'`.
- `JobPhase`: `'pending' | 'extracting' | 'cloning' | 'validating' | 'analyzing' | 'finalizing' | 'complete'`.
- `RepositoryDTO`: repository metadata, status, head SHA, commit count, timestamps, and optional latest ingestion job.
- `JobDTO`: ingestion job identity, lifecycle status, phase, progress, error, and timestamps.

These types mirror the `repositories` and `jobs` tables in the database schema. Status and phase fields use literal union types to prevent invalid states at compile time.

```mermaid
classDiagram
class RepositoryDTO {
+string id
+string name
+RepoSourceType sourceType
+string sourceRef
+RepoStatus status
+string error
+string headSha
+number commitCount
+number createdAt
+number readyAt
+JobDTO latestJob
}
class JobDTO {
+string id
+string repoId
+'ingest' type
+JobStatus status
+JobPhase phase
+number progress
+string error
+number createdAt
+number startedAt
+number finishedAt
}
RepositoryDTO --> JobDTO : "optional latestJob"
```

**Diagram sources**
- [types.ts:27-55](file://packages/shared/src/types.ts#L27-L55)

**Section sources**
- [types.ts:27-55](file://packages/shared/src/types.ts#L27-L55)
- [schema.sql:5-31](file://apps/api/src/db/schema.sql#L5-L31)

### Commit and Author Types
- `CommitListItem`: lightweight commit row shown in lists.
- `CommitFileStatDTO`: per-file added/removed line counts.
- `CommitStatsDTO`: full commit detail including file stats.
- `AuthorKind`: `'canonical' | 'mailmap' | 'raw'`, describing how an author identity was resolved.
- `AuthorIdentityDTO`: canonical author with stable `id`, display name/email, resolution kind, commit count, and raw identity merge count.
- `RawIdentDTO`: raw git identity stored in the database with enhanced commit counting.
- `AuthorsResponse`: response containing resolved authors and raw identities.

These types correspond to the `commits`, `commit_file_stats`, `raw_idents`, `mailmap_map`, `canonical_authors`, and `author_merges` tables.

```mermaid
classDiagram
class CommitListItem {
+string sha
+string parentSha
+number ts
+string authorId
+string authorName
+string authorEmail
}
class CommitFileStatDTO {
+string path
+number added
+number removed
}
class CommitStatsDTO {
+string sha
+string parentSha
+number ts
+string authorId
+string authorName
+string authorEmail
+CommitFileStatDTO[] files
}
class AuthorIdentityDTO {
+string id
+string name
+string email
+AuthorKind kind
+number commitCount
+number rawIdentCount
}
class RawIdentDTO {
+number id
+string name
+string email
+number commitCount
}
class AuthorsResponse {
+AuthorIdentityDTO[] authors
+RawIdentDTO[] rawIdents
}
CommitStatsDTO --> CommitFileStatDTO : "files"
AuthorsResponse --> AuthorIdentityDTO : "contains"
AuthorsResponse --> RawIdentDTO : "contains"
```

**Diagram sources**
- [types.ts:61-113](file://packages/shared/src/types.ts#L61-L113)

**Section sources**
- [types.ts:61-113](file://packages/shared/src/types.ts#L61-L113)
- [schema.sql:33-91](file://apps/api/src/db/schema.sql#L33-L91)

### Canonical Author Types
New types support manual author merging functionality:

- `CanonicalAuthorDTO`: manually created canonical author with stable `id`, display name/email, and merged raw identity IDs.
- `CanonicalAuthorsResponse`: response containing array of canonical authors.
- `CanonicalAuthorInput`: request body for creating/updating canonical author merges.

These types enable users to manually merge multiple raw git identities into a single canonical author identity, improving author attribution accuracy.

```mermaid
classDiagram
class CanonicalAuthorDTO {
+string id
+string name
+string email
+number[] identIds
}
class CanonicalAuthorsResponse {
+CanonicalAuthorDTO[] authors
}
class CanonicalAuthorInput {
+string name
+string email
+number[] identIds
}
CanonicalAuthorsResponse --> CanonicalAuthorDTO : "contains"
```

**Diagram sources**
- [types.ts:115-133](file://packages/shared/src/types.ts#L115-L133)

**Section sources**
- [types.ts:115-133](file://packages/shared/src/types.ts#L115-L133)
- [canonicalStore.ts:1-180](file://apps/api/src/db/canonicalStore.ts#L1-L180)

### Path Types
- `PathsResponse`: contains `files` (all file paths ever seen) and `dirs` (directory paths excluding the repository root).

This supports UI features such as path pickers and directory-scoped metrics.

**Section sources**
- [types.ts:139-144](file://packages/shared/src/types.ts#L139-L144)

### Metric Types
The metric types encode the brief's mathematical model:

- `ObjectMetricsDTO`: core object-level metrics including `added`, `removed`, `growth`, `churn`, `modifications`, `modificationFrequency`, and `churnRate`.
- `RepoMetricsDTO`: extends object metrics with commit-set size and timestamp bounds.
- `FileMetricRowDTO`: object metrics plus `path`.
- `DirectoryMetricRowDTO`: object metrics plus `path` and `depth`.
- `DirectoryMetricsDTO`: directory scope, self metrics, and child directory rows.
- `AuthorMetricRowDTO`: per-author contribution metrics, including ownership fraction.
- `AuthorMetricsResponse`: total churn denominator and author rows.
- `TimeseriesPointDTO`: bucketed time series point.
- `TimeseriesResponse`: bucket granularity and points array.

The metric calculations are implemented in the API layer and mapped to these DTOs using strict arithmetic rules.

```mermaid
classDiagram
class ObjectMetricsDTO {
+number added
+number removed
+number growth
+number churn
+number modifications
+number modificationFrequency
+number churnRate
}
class RepoMetricsDTO {
+number commitCount
+number firstTs
+number lastTs
}
class FileMetricRowDTO {
+string path
}
class DirectoryMetricRowDTO {
+string path
+number depth
}
class DirectoryMetricsDTO {
+string path
+ObjectMetricsDTO self
+DirectoryMetricRowDTO[] children
}
class AuthorMetricRowDTO {
+string id
+string name
+string email
+number commitCount
+number added
+number removed
+number modifications
+number churn
+number ownership
}
class AuthorMetricsResponse {
+number totalChurn
+AuthorMetricRowDTO[] authors
}
class TimeseriesPointDTO {
+string bucket
+number added
+number removed
+number growth
+number churn
+number commits
}
class TimeseriesResponse {
+'day'|'week' bucket
+TimeseriesPointDTO[] points
}
RepoMetricsDTO --> ObjectMetricsDTO : "extends"
FileMetricRowDTO --> ObjectMetricsDTO : "extends"
DirectoryMetricRowDTO --> ObjectMetricsDTO : "extends"
DirectoryMetricsDTO --> ObjectMetricsDTO : "self"
DirectoryMetricsDTO --> DirectoryMetricRowDTO : "children"
AuthorMetricsResponse --> AuthorMetricRowDTO : "authors"
TimeseriesResponse --> TimeseriesPointDTO : "points"
```

**Diagram sources**
- [types.ts:151-225](file://packages/shared/src/types.ts#L151-L225)

**Section sources**
- [types.ts:151-225](file://packages/shared/src/types.ts#L151-L225)
- [setMetrics.ts:1-36](file://apps/api/src/metrics/setMetrics.ts#L1-L36)

### Multi-Repository Comparison Types
New types support side-by-side comparison of multiple repositories:

- `CompareRepoDTO`: one repository column of a comparison, including repository metadata and metrics.
- `CompareResponse`: response containing array of compared repositories.

These types enable comparing up to 8 repositories simultaneously, showing their metrics side-by-side for analysis.

```mermaid
classDiagram
class CompareRepoDTO {
+string id
+string name
+RepoSourceType sourceType
+string sourceRef
+string headSha
+RepoMetricsDTO metrics
}
class CompareResponse {
+CompareRepoDTO[] repos
}
CompareResponse --> CompareRepoDTO : "contains"
```

**Diagram sources**
- [types.ts:249-260](file://packages/shared/src/types.ts#L249-L260)

**Section sources**
- [types.ts:249-260](file://packages/shared/src/types.ts#L249-L260)
- [compare.ts:1-102](file://apps/api/src/routes/compare.ts#L1-L102)

### Common Envelopes
- `ListResponse<T>`: paginated list envelope with `items`, `total`, `page`, `pageSize`, and optional `commitCount`.
- `RepositoriesResponse`: wrapper for repository lists.
- `ApiErrorBody`: structured server error with `code` and `message`.

These envelopes standardize pagination and error shapes across endpoints.

**Section sources**
- [types.ts:231-265](file://packages/shared/src/types.ts#L231-L265)

## Architecture Overview
The shared types form the contract boundary between the API and the frontend. Database rows are converted into DTOs in route handlers; the frontend consumes those DTOs through a typed client helper.

```mermaid
sequenceDiagram
participant Client as "Frontend Component"
participant WebApi as "web/src/lib/api.ts"
participant Route as "apps/api/src/routes/*.ts"
participant Metrics as "apps/api/src/metrics/*.ts"
participant DB as "SQLite Schema"
Client->>WebApi : Call typed method
WebApi->>Route : HTTP request
Route->>DB : Query rows
DB-->>Route : Rows
Route->>Metrics : Compute aggregates when needed
Metrics-->>Route : Sums or computed values
Route->>Route : Map rows to shared DTOs
Route-->>WebApi : JSON payload matching shared types
WebApi-->>Client : Strongly typed response
```

**Diagram sources**
- [api.ts:1-326](file://apps/web/src/lib/api.ts#L1-L326)
- [repositories.ts:1-166](file://apps/api/src/routes/repositories.ts#L1-L166)
- [commits.ts:1-131](file://apps/api/src/routes/commits.ts#L1-L131)
- [metrics.ts:1-199](file://apps/api/src/routes/metrics.ts#L1-L199)
- [setMetrics.ts:1-36](file://apps/api/src/metrics/setMetrics.ts#L1-L36)
- [schema.sql:1-106](file://apps/api/src/db/schema.sql#L1-L106)

## Detailed Component Analysis

### Repository and Job Endpoints
The repository routes create repositories from zip uploads or clone URLs, list repositories with their latest ingestion job, retrieve details, and delete repositories. Jobs are polled through a separate endpoint.

Key behaviors:
- Upload and clone endpoints return both `repository` and `job` objects typed as `RepositoryDTO` and `JobDTO`.
- Listing maps each database row to `RepositoryDTO` and attaches the latest job via `toJobDTO`.
- Deletion prevents removal while an active job exists.

```mermaid
sequenceDiagram
participant UI as "CloneUrlForm.tsx"
participant WebApi as "api.ts"
participant RepoRoute as "routes/repositories.ts"
participant JobRoute as "routes/jobs.ts"
UI->>WebApi : cloneRepository({ url, name })
WebApi->>RepoRoute : POST /api/repositories/clone
RepoRoute->>RepoRoute : Validate body and create repository
RepoRoute-->>WebApi : { repository, job }
WebApi-->>UI : UploadResponse
UI->>WebApi : getJob(job.id)
WebApi->>JobRoute : GET /api/jobs/ : id
JobRoute-->>WebApi : JobDTO
WebApi-->>UI : JobDTO
```

**Diagram sources**
- [CloneUrlForm.tsx:1-86](file://apps/web/src/components/ingest/CloneUrlForm.tsx#L1-L86)
- [api.ts:139-193](file://apps/web/src/lib/api.ts#L139-L193)
- [repositories.ts:117-135](file://apps/api/src/routes/repositories.ts#L117-L135)
- [jobs.ts:7-30](file://apps/api/src/routes/jobs.ts#L7-L30)

**Section sources**
- [repositories.ts:23-37](file://apps/api/src/routes/repositories.ts#L23-L37)
- [repositories.ts:77-162](file://apps/api/src/routes/repositories.ts#L77-L162)
- [jobs.ts:7-30](file://apps/api/src/routes/jobs.ts#L7-L30)

### Commits and Commit Stats
The commits endpoint returns a paginated list of commits and per-commit file statistics. It builds SQL filters from shared filter parameters and returns `ListResponse<CommitListItem>` and `CommitStatsDTO`.

Important aspects:
- Commit list includes resolved author identity fields.
- Commit stats include file-level added/removed counts.
- Pagination and commit-set size are included in the list response.

```mermaid
flowchart TD
Start(["GET /:repoId/commits"]) --> ParseFilters["Parse metric filters and paging"]
ParseFilters --> BuildWhere["Build SQL WHERE clause"]
BuildWhere --> CountTotal["Count total commits"]
CountTotal --> FetchRows["Fetch commit rows"]
FetchRows --> MapItems["Map rows to CommitListItem"]
MapItems --> RespondList["Return ListResponse<CommitListItem>"]
Start2(["GET /:repoId/commits/:sha/stats"]) --> FindCommit["Find commit by SHA"]
FindCommit --> FetchFiles["Fetch commit_file_stats"]
FetchFiles --> MapStats["Map to CommitStatsDTO"]
MapStats --> RespondStats["Return CommitStatsDTO"]
```

**Diagram sources**
- [commits.ts:36-92](file://apps/api/src/routes/commits.ts#L36-L92)
- [commits.ts:94-127](file://apps/api/src/routes/commits.ts#L94-L127)

**Section sources**
- [commits.ts:21-29](file://apps/api/src/routes/commits.ts#L21-L29)
- [commits.ts:36-92](file://apps/api/src/routes/commits.ts#L36-L92)
- [commits.ts:94-127](file://apps/api/src/routes/commits.ts#L94-L127)

### Authors and Canonical Author Management
The authors endpoint returns resolved canonical authors and raw identities. New canonical author management functionality allows manual merging of author identities.

```mermaid
sequenceDiagram
participant UI as "FilterBar.tsx"
participant WebApi as "api.ts"
participant AuthorRoute as "routes/authors.ts"
UI->>WebApi : getAuthors(repoId)
WebApi->>AuthorRoute : GET /api/repositories/ : repoId/authors
AuthorRoute-->>WebApi : AuthorsResponse
WebApi-->>UI : AuthorsResponse
```

**Diagram sources**
- [FilterBar.tsx:74-85](file://apps/web/src/components/filters/FilterBar.tsx#L74-L85)
- [api.ts:195-200](file://apps/web/src/lib/api.ts#L195-L200)
- [authors.ts:11-18](file://apps/api/src/routes/authors.ts#L11-L18)

**Section sources**
- [authors.ts:1-101](file://apps/api/src/routes/authors.ts#L1-L101)
- [types.ts:88-133](file://packages/shared/src/types.ts#L88-L133)

### Multi-Repository Comparison
New comparison functionality enables side-by-side analysis of multiple repositories:

- Compare endpoint accepts 2-8 repository IDs and returns their metrics for direct comparison.
- Supports relative time windows ("last N days") anchored to each repository's timeline.
- Frontend provides UI for selecting repositories and visualizing comparison data.

```mermaid
sequenceDiagram
participant UI as "ComparePage.tsx"
participant WebApi as "api.ts"
participant CompareRoute as "routes/compare.ts"
UI->>WebApi : compareRepositories([repoIds], params)
WebApi->>CompareRoute : GET /api/metrics/compare?repoIds=...
CompareRoute->>CompareRoute : Validate and process repositories
CompareRoute-->>WebApi : CompareResponse
WebApi-->>UI : CompareResponse
```

**Diagram sources**
- [ComparePage.tsx:45-56](file://apps/web/src/app/compare/page.tsx#L45-L56)
- [api.ts:313-324](file://apps/web/src/lib/api.ts#L313-L324)
- [compare.ts:27-98](file://apps/api/src/routes/compare.ts#L27-L98)

**Section sources**
- [compare.ts:1-102](file://apps/api/src/routes/compare.ts#L1-L102)
- [types.ts:249-260](file://packages/shared/src/types.ts#L249-L260)

### Metrics Endpoints
The metrics router exposes repository-wide metrics, file metrics, directory metrics, author metrics, and timeseries data. All responses conform to shared DTOs.

Key flows:
- Repository metrics compute sums and derive rates using `toObjectMetricsDTO`.
- File metrics aggregate per-path changes and support sorting and pagination.
- Directory metrics compute subtree metrics and child directories up to a bounded depth.
- Author metrics decorate raw author rows with resolved names and ownership fractions.
- Timeseries buckets daily or weekly change and commit counts.

```mermaid
flowchart TD
Req(["Metrics Request"]) --> Scope["Resolve commit set and path scope"]
Scope --> Aggregates["Query object sums"]
Aggregates --> Compute["Compute growth/churn/rates"]
Compute --> Shape["Shape into ObjectMetricsDTO or derived DTO"]
Shape --> Response["Return typed response"]
```

**Diagram sources**
- [metrics.ts:46-195](file://apps/api/src/routes/metrics.ts#L46-L195)
- [setMetrics.ts:11-23](file://apps/api/src/metrics/setMetrics.ts#L11-L23)

**Section sources**
- [metrics.ts:23-39](file://apps/api/src/routes/metrics.ts#L23-L39)
- [metrics.ts:46-113](file://apps/api/src/routes/metrics.ts#L46-L113)
- [metrics.ts:115-172](file://apps/api/src/routes/metrics.ts#L115-L172)
- [metrics.ts:174-195](file://apps/api/src/routes/metrics.ts#L174-L195)
- [setMetrics.ts:1-36](file://apps/api/src/metrics/setMetrics.ts#L1-L36)

### Frontend Usage Examples
The frontend uses shared types to ensure API calls and UI state are consistent with the backend contract.

- Clone URL form validates input and calls `api.cloneRepository`, receiving `UploadResponse` containing `RepositoryDTO` and `JobDTO`.
- Metric cards render `RepoMetricsDTO`, formatting growth, churn, modification frequency, and churn rate.
- Filter bar compiles UI state into `CommitFilters`, which the API client serializes into query parameters consumed by metric endpoints.
- Compare page enables selection of multiple repositories and displays side-by-side metrics visualization.

```mermaid
sequenceDiagram
participant Form as "CloneUrlForm.tsx"
participant Api as "api.ts"
participant Server as "repositories.ts"
Form->>Api : cloneRepository({ url, name })
Api->>Server : POST /api/repositories/clone
Server-->>Api : { repository : RepositoryDTO, job : JobDTO }
Api-->>Form : UploadResponse
```

**Diagram sources**
- [CloneUrlForm.tsx:16-37](file://apps/web/src/components/ingest/CloneUrlForm.tsx#L16-L37)
- [api.ts:139-145](file://apps/web/src/lib/api.ts#L139-L145)
- [repositories.ts:117-135](file://apps/api/src/routes/repositories.ts#L117-L135)

**Section sources**
- [CloneUrlForm.tsx:1-86](file://apps/web/src/components/ingest/CloneUrlForm.tsx#L1-L86)
- [MetricCards.tsx:26-88](file://apps/web/src/components/metrics/MetricCards.tsx#L26-L88)
- [FilterBar.tsx:33-57](file://apps/web/src/components/filters/FilterBar.tsx#L33-L57)
- [api.ts:84-103](file://apps/web/src/lib/api.ts#L84-L103)
- [ComparePage.tsx:45-289](file://apps/web/src/app/compare/page.tsx#L45-L289)

## Dependency Analysis
The shared package is imported by both workspaces:

- API routes import DTOs to type responses and to validate mapping functions.
- The web client imports DTOs to type fetch results and request helpers.
- The database schema defines constraints that align with the literal union types in the shared package.

```mermaid
graph LR
Shared["@rat/shared types.ts"] --> API_Routes["API Routes"]
Shared --> Web_Client["Web Client api.ts"]
Schema["Database Schema"] --> API_Routes
API_Routes --> Shared
Web_Client --> Shared
```

**Diagram sources**
- [types.ts:1-266](file://packages/shared/src/types.ts#L1-L266)
- [repositories.ts:7-21](file://apps/api/src/routes/repositories.ts#L7-L21)
- [commits.ts:1-14](file://apps/api/src/routes/commits.ts#L1-L14)
- [metrics.ts:1-21](file://apps/api/src/routes/metrics.ts#L1-L21)
- [api.ts:1-15](file://apps/web/src/lib/api.ts#L1-L15)
- [schema.sql:1-106](file://apps/api/src/db/schema.sql#L1-L106)

**Section sources**
- [types.ts:1-266](file://packages/shared/src/types.ts#L1-L266)
- [schema.sql:1-106](file://apps/api/src/db/schema.sql#L1-L106)

## Performance Considerations
- Numeric fields such as `added`, `removed`, `growth`, `churn`, and derived rates are strictly typed as `number`, preventing accidental string concatenation or NaN propagation in UI rendering.
- Paginated list responses include `commitCount`, enabling accurate rate calculations without additional queries.
- Directory depth is bounded in the metrics endpoint to avoid excessive tree traversal.
- Time-series bucketing reduces payload size for charts while preserving temporal aggregation.
- Multi-repository comparison limits to 8 repositories to prevent excessive computational overhead.
- Enhanced `RawIdentDTO.commitCount` enables efficient identity analysis without additional database queries.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and how shared types help diagnose them:

- Invalid status or phase values: Literal union types (`RepoStatus`, `JobStatus`, `JobPhase`) cause compile-time errors if mismatched strings are assigned.
- Missing required fields: Strict interface definitions surface missing properties during development.
- Incorrect metric formulas: Centralized computation in `toObjectMetricsDTO` ensures consistent derivation of `growth`, `churn`, `modificationFrequency`, and `churnRate`.
- Frontend-backend mismatch: Because both sides import from `@rat/shared`, structural mismatches are caught at build time rather than runtime.
- Invalid comparison parameters: Compare endpoint validation ensures proper repository selection and parameter combinations.

When debugging API responses:
- Inspect the structured `ApiErrorBody` returned by the server.
- Use the frontend `ApiError` wrapper to access `code`, `status`, and `message`.
- Verify that list responses include `commitCount` when computing per-commit rates.
- Check canonical author merge operations for proper identity consolidation.

**Section sources**
- [types.ts:14-25](file://packages/shared/src/types.ts#L14-L25)
- [types.ts:262-265](file://packages/shared/src/types.ts#L262-L265)
- [api.ts:22-41](file://apps/web/src/lib/api.ts#L22-L41)
- [setMetrics.ts:11-23](file://apps/api/src/metrics/setMetrics.ts#L11-L23)

## Conclusion
The shared TypeScript types in `@rat/shared` are the contract backbone of RAT. They define repository, job, commit, author, path, metric, comparison, and canonical author payloads, map cleanly to the SQLite schema, and eliminate duplication between the API and frontend. Discriminated unions for status and phase fields, strict numeric typing for metrics, and centralized DTO mapping ensure type safety, reduce runtime errors, and keep the monorepo consistent as it evolves. The new comparison and canonical author features extend the system's analytical capabilities while maintaining the same strong typing guarantees.

[No sources needed since this section summarizes without analyzing specific files]