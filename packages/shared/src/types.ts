/**
 * Shared DTO types for the RAT API and web dashboard.
 *
 * These types mirror the JSON payloads served by the Express API. They are
 * type-only: no runtime code is shared across workspaces.
 */

/* ------------------------------------------------------------------ */
/* Repositories & jobs                                                 */
/* ------------------------------------------------------------------ */

export type RepoSourceType = 'zip' | 'url';

export type RepoStatus = 'queued' | 'processing' | 'ready' | 'error';

export type JobStatus = 'queued' | 'running' | 'done' | 'failed';

export type JobPhase =
  | 'pending'
  | 'extracting'
  | 'cloning'
  | 'validating'
  | 'analyzing'
  | 'finalizing'
  | 'complete';

export interface RepositoryDTO {
  id: string;
  name: string;
  sourceType: RepoSourceType;
  /** Original filename (zip) or clone URL (url). */
  sourceRef: string;
  status: RepoStatus;
  error: string | null;
  headSha: string | null;
  commitCount: number | null;
  createdAt: number;
  readyAt: number | null;
  /** Most recent ingestion job for this repository (may be null). */
  latestJob: JobDTO | null;
}

export interface JobDTO {
  id: string;
  repoId: string;
  type: 'ingest';
  status: JobStatus;
  phase: JobPhase;
  /** Overall progress in [0, 1]. */
  progress: number;
  error: string | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

/* ------------------------------------------------------------------ */
/* Commits & authors                                                   */
/* ------------------------------------------------------------------ */

export interface CommitListItem {
  sha: string;
  parentSha: string | null;
  /** Committer date, UNIX seconds. */
  ts: number;
  /** Resolved author identifier (the brief's `h[a]`). */
  authorId: string;
  authorName: string;
  authorEmail: string;
}

export interface CommitFileStatDTO {
  path: string;
  added: number;
  removed: number;
}

export interface CommitStatsDTO {
  sha: string;
  parentSha: string | null;
  ts: number;
  authorId: string;
  authorName: string;
  authorEmail: string;
  files: CommitFileStatDTO[];
}

export type AuthorKind = 'canonical' | 'mailmap' | 'raw';

export interface AuthorIdentityDTO {
  /** Stable author id used by the `authorId` metric filter. */
  id: string;
  name: string;
  email: string;
  kind: AuthorKind;
  /** Number of commits attributed to this author. */
  commitCount: number;
  /** Number of distinct raw git identities merged into this author. */
  rawIdentCount: number;
}

export interface RawIdentDTO {
  id: number;
  name: string;
  email: string;
  /** Number of commits attributed to this raw identity. */
  commitCount: number;
}

export interface AuthorsResponse {
  authors: AuthorIdentityDTO[];
  rawIdents: RawIdentDTO[];
}

/** A manually created canonical author (the author-merge tier). */
export interface CanonicalAuthorDTO {
  id: string;
  name: string;
  email: string;
  /** Raw identities merged into this author. */
  identIds: number[];
}

export interface CanonicalAuthorsResponse {
  authors: CanonicalAuthorDTO[];
}

/** Request body for creating/updating a canonical author merge. */
export interface CanonicalAuthorInput {
  name: string;
  email: string;
  identIds: number[];
}

/* ------------------------------------------------------------------ */
/* Paths                                                               */
/* ------------------------------------------------------------------ */

export interface PathsResponse {
  /** All file paths that ever existed in the analysed history. */
  files: string[];
  /** All directory paths (excluding the repository root, which is ""). */
  dirs: string[];
}

/* ------------------------------------------------------------------ */
/* Metrics                                                             */
/* ------------------------------------------------------------------ */

/** Metrics computed for a single object (file or directory) over a commit set. */
export interface ObjectMetricsDTO {
  added: number;
  removed: number;
  growth: number;
  churn: number;
  /** Number of commits in the set that changed the object at least once (`n_H,o`). */
  modifications: number;
  /** `n_H,o / |H|` — modifications per commit. */
  modificationFrequency: number;
  /** `lambda_H,o / |H|` — churn per commit. */
  churnRate: number;
}

export interface RepoMetricsDTO extends ObjectMetricsDTO {
  /** Size of the filtered commit set `|H|`. */
  commitCount: number;
  /** Earliest / latest committer timestamps in the set (UNIX seconds). */
  firstTs: number | null;
  lastTs: number | null;
}

export interface FileMetricRowDTO extends ObjectMetricsDTO {
  path: string;
}

export interface DirectoryMetricRowDTO extends ObjectMetricsDTO {
  path: string;
  /** Levels below the requested directory (`path` param). */
  depth: number;
}

export interface DirectoryMetricsDTO {
  /** The directory the metrics were computed for ("" = repository root). */
  path: string;
  /** Subtree metrics of the directory itself. */
  self: ObjectMetricsDTO;
  /** Descendant directories (immediate children by default). */
  children: DirectoryMetricRowDTO[];
}

export interface AuthorMetricRowDTO {
  id: string;
  name: string;
  email: string;
  /** Commits by this author inside the filtered set `H`. */
  commitCount: number;
  added: number;
  removed: number;
  modifications: number;
  churn: number;
  /** `lambda_H,o,a / lambda_H,o` — fraction of the object's churn owned. */
  ownership: number;
}

export interface AuthorMetricsResponse {
  /** Total churn over the scope (denominator of ownership). */
  totalChurn: number;
  authors: AuthorMetricRowDTO[];
}

export interface TimeseriesPointDTO {
  /** `YYYY-MM-DD` for day buckets, `YYYY-Www` for week buckets (UTC). */
  bucket: string;
  added: number;
  removed: number;
  growth: number;
  churn: number;
  /** All commits in the bucket (including commits with no file changes). */
  commits: number;
}

export interface TimeseriesResponse {
  bucket: 'day' | 'week';
  points: TimeseriesPointDTO[];
}

/* ------------------------------------------------------------------ */
/* Common envelopes                                                    */
/* ------------------------------------------------------------------ */

export interface ListResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  /** Size of the filtered commit set `|H|` — denominator for rate metrics. */
  commitCount?: number;
}

export interface RepositoriesResponse {
  repositories: RepositoryDTO[];
}

/* ------------------------------------------------------------------ */
/* Multi-repository comparison                                         */
/* ------------------------------------------------------------------ */

/** One repository column of a comparison. */
export interface CompareRepoDTO {
  id: string;
  name: string;
  sourceType: RepoSourceType;
  sourceRef: string;
  headSha: string | null;
  metrics: RepoMetricsDTO;
}

export interface CompareResponse {
  repos: CompareRepoDTO[];
}

export interface ApiErrorBody {
  code: string;
  message: string;
}
