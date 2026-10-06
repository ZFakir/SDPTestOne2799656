import type {
  AuthorMetricsResponse,
  AuthorsResponse,
  CanonicalAuthorInput,
  CanonicalAuthorsResponse,
  CommitListItem,
  CommitStatsDTO,
  CompareResponse,
  DirectoryMetricsDTO,
  FileMetricRowDTO,
  JobDTO,
  ListResponse,
  PathsResponse,
  RepoMetricsDTO,
  RepositoriesResponse,
  RepositoryDTO,
  TimeseriesResponse,
} from '@rat/shared';

/** Base URL of the RAT API (CORS-enabled). */
export const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
).replace(/\/+$/, '');

/** Structured API failure carrying the server's `{ code, message }`. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

function toApiError(body: unknown, status: number): ApiError {
  const parsed = body as { code?: unknown; message?: unknown } | undefined;
  const code = typeof parsed?.code === 'string' ? parsed.code : 'HTTP_ERROR';
  const message =
    typeof parsed?.message === 'string' ? parsed.message : `Request failed (HTTP ${status}).`;
  return new ApiError(code, status, message);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError(
      'NETWORK',
      0,
      `Cannot reach the RAT API at ${API_BASE}. Make sure the API server is running.`,
    );
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let body: unknown;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
  }

  if (!res.ok) throw toApiError(body, res.status);
  return body as T;
}

export type QueryValue = string | number | boolean | undefined | null;

/** Build a query string, skipping empty values. */
export function qs(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

/**
 * Commit-set filters shared by every metric endpoint:
 * a `[fromTs, toTs)` range, an explicit selection of commit ids, and/or a
 * resolved author id. `fromTs`/`toTs` are mutually exclusive with `commitIds`.
 */
export interface CommitFilters {
  fromTs?: number;
  toTs?: number;
  commitIds?: string[];
  authorId?: string;
}

export function filtersToParams(filters: CommitFilters): Record<string, QueryValue> {
  return {
    fromTs: filters.fromTs,
    toTs: filters.toTs,
    commitIds: filters.commitIds && filters.commitIds.length > 0 ? filters.commitIds.join(',') : undefined,
    authorId: filters.authorId,
  };
}

export interface FileMetricOpts {
  pathPrefix?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface UploadResponse {
  repository: RepositoryDTO;
  job: JobDTO;
}

function encode(id: string): string {
  return encodeURIComponent(id);
}

export const api = {
  health(): Promise<{ status: string; service: string; time: number }> {
    return request('/api/health');
  },

  listRepositories(): Promise<RepositoriesResponse> {
    return request('/api/repositories');
  },

  getRepository(repoId: string): Promise<RepositoryDTO> {
    return request(`/api/repositories/${encode(repoId)}`);
  },

  deleteRepository(repoId: string): Promise<void> {
    return request(`/api/repositories/${encode(repoId)}`, { method: 'DELETE' });
  },

  cloneRepository(input: { url: string; name?: string }): Promise<UploadResponse> {
    return request('/api/repositories/clone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  },

  /** Multipart upload with an XHR so the browser reports progress. */
  uploadRepository(
    file: File,
    onProgress?: (fraction: number) => void,
  ): Promise<UploadResponse> {
    return new Promise<UploadResponse>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/api/repositories/upload`);
      xhr.responseType = 'text';

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
      };
      xhr.onerror = () =>
        reject(
          new ApiError(
            'NETWORK',
            0,
            `Cannot reach the RAT API at ${API_BASE}. Make sure the API server is running.`,
          ),
        );
      xhr.onload = () => {
        let body: unknown;
        if (xhr.response) {
          try {
            body = JSON.parse(xhr.response as string);
          } catch {
            body = undefined;
          }
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(1);
          resolve(body as UploadResponse);
        } else {
          reject(toApiError(body, xhr.status));
        }
      };

      const form = new FormData();
      form.append('file', file);
      xhr.send(form);
    });
  },

  getJob(jobId: string): Promise<JobDTO> {
    return request(`/api/jobs/${encode(jobId)}`);
  },

  getAuthors(repoId: string): Promise<AuthorsResponse> {
    return request(`/api/repositories/${encode(repoId)}/authors`);
  },

  getPaths(repoId: string): Promise<PathsResponse> {
    return request(`/api/repositories/${encode(repoId)}/paths`);
  },

  getCommits(
    repoId: string,
    opts: { filters?: CommitFilters; q?: string; page?: number; pageSize?: number } = {},
  ): Promise<ListResponse<CommitListItem>> {
    const params = {
      ...filtersToParams(opts.filters ?? {}),
      q: opts.q,
      page: opts.page,
      pageSize: opts.pageSize,
    };
    return request(`/api/repositories/${encode(repoId)}/commits${qs(params)}`);
  },

  getCommitStats(repoId: string, sha: string): Promise<CommitStatsDTO> {
    return request(`/api/repositories/${encode(repoId)}/commits/${encode(sha)}/stats`);
  },

  getRepoMetrics(repoId: string, filters: CommitFilters = {}): Promise<RepoMetricsDTO> {
    return request(
      `/api/repositories/${encode(repoId)}/metrics/repository${qs(filtersToParams(filters))}`,
    );
  },

  getFileMetrics(
    repoId: string,
    filters: CommitFilters = {},
    opts: FileMetricOpts = {},
  ): Promise<ListResponse<FileMetricRowDTO>> {
    const params = {
      ...filtersToParams(filters),
      pathPrefix: opts.pathPrefix,
      sort: opts.sort,
      order: opts.order,
      page: opts.page,
      pageSize: opts.pageSize,
    };
    return request(`/api/repositories/${encode(repoId)}/metrics/files${qs(params)}`);
  },

  getDirectoryMetrics(
    repoId: string,
    filters: CommitFilters = {},
    opts: { path?: string; depth?: number } = {},
  ): Promise<DirectoryMetricsDTO> {
    const params = { ...filtersToParams(filters), path: opts.path, depth: opts.depth };
    return request(`/api/repositories/${encode(repoId)}/metrics/directories${qs(params)}`);
  },

  getAuthorMetrics(
    repoId: string,
    filters: CommitFilters = {},
    opts: { path?: string } = {},
  ): Promise<AuthorMetricsResponse> {
    const params = { ...filtersToParams(filters), path: opts.path };
    return request(`/api/repositories/${encode(repoId)}/metrics/authors${qs(params)}`);
  },

  getTimeseries(
    repoId: string,
    filters: CommitFilters = {},
    opts: { bucket?: 'day' | 'week'; path?: string } = {},
  ): Promise<TimeseriesResponse> {
    const params = { ...filtersToParams(filters), bucket: opts.bucket, path: opts.path };
    return request(`/api/repositories/${encode(repoId)}/metrics/timeseries${qs(params)}`);
  },

  /* ------------------------------------------------------------------ */
  /* Canonical authors (manual merges)                                   */
  /* ------------------------------------------------------------------ */

  getCanonicalAuthors(repoId: string): Promise<CanonicalAuthorsResponse> {
    return request(`/api/repositories/${encode(repoId)}/authors/canonical`);
  },

  createCanonicalAuthor(
    repoId: string,
    input: CanonicalAuthorInput,
  ): Promise<CanonicalAuthorsResponse> {
    return request(`/api/repositories/${encode(repoId)}/authors/canonical`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  },

  updateCanonicalAuthor(
    repoId: string,
    canonicalId: string,
    patch: Partial<CanonicalAuthorInput>,
  ): Promise<CanonicalAuthorsResponse> {
    return request(`/api/repositories/${encode(repoId)}/authors/canonical/${encode(canonicalId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  },

  deleteCanonicalAuthor(repoId: string, canonicalId: string): Promise<CanonicalAuthorsResponse> {
    return request(`/api/repositories/${encode(repoId)}/authors/canonical/${encode(canonicalId)}`, {
      method: 'DELETE',
    });
  },

  /* ------------------------------------------------------------------ */
  /* Multi-repository comparison                                         */
  /* ------------------------------------------------------------------ */

  compareRepositories(
    repoIds: string[],
    opts: { lastDays?: number; fromTs?: number; toTs?: number } = {},
  ): Promise<CompareResponse> {
    const params = {
      repoIds: repoIds.join(','),
      lastDays: opts.lastDays,
      fromTs: opts.fromTs,
      toTs: opts.toTs,
    };
    return request(`/api/metrics/compare${qs(params)}`);
  },
};
