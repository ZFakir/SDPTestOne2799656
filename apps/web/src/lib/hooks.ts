'use client';

import useSWR, { type SWRConfiguration } from 'swr';
import type { JobDTO, RepositoryDTO } from '@rat/shared';
import {
  api,
  filtersToParams,
  type CommitFilters,
  type FileMetricOpts,
} from './api';

/** Polling cadence while a repository/job is still being processed. */
export const LIVE_REFRESH_MS = 1500;

function liveWhile<T>(active: (data: T | undefined) => boolean): SWRConfiguration<T> {
  return {
    refreshInterval: (data) => (active(data) ? LIVE_REFRESH_MS : 0),
    revalidateOnFocus: false,
  };
}

function isRepoBusy(data: { status?: string } | undefined | null): boolean {
  return data?.status === 'queued' || data?.status === 'processing';
}

function isJobActive(data: { status?: string } | undefined | null): boolean {
  return data?.status === 'queued' || data?.status === 'running';
}

/** Stable SWR key fragment for a commit-set filter combination. */
export function filterKey(filters: CommitFilters): string {
  return JSON.stringify(filtersToParams(filters));
}

/* -------------------------------------------------------------------------- */
/* Repositories & jobs                                                        */
/* -------------------------------------------------------------------------- */

export function useRepositories() {
  return useSWR('repositories', () => api.listRepositories(), {
    refreshInterval: (data) =>
      data?.repositories.some((repo) => isRepoBusy(repo)) ? LIVE_REFRESH_MS : 0,
    revalidateOnFocus: false,
  });
}

export function useRepository(repoId: string | null | undefined) {
  return useSWR(
    repoId ? ['repository', repoId] : null,
    () => api.getRepository(repoId as string),
    liveWhile<RepositoryDTO>(isRepoBusy),
  );
}

export function useJob(jobId: string | null | undefined) {
  return useSWR(jobId ? ['job', jobId] : null, () => api.getJob(jobId as string), {
    ...liveWhile<JobDTO>(isJobActive),
    // Once finished the job never changes again.
    revalidateOnFocus: false,
  });
}

/* -------------------------------------------------------------------------- */
/* Repository metadata                                                        */
/* -------------------------------------------------------------------------- */

export function useAuthors(repoId: string | null | undefined) {
  return useSWR(repoId ? ['authors', repoId] : null, () => api.getAuthors(repoId as string));
}

export function usePaths(repoId: string | null | undefined) {
  return useSWR(repoId ? ['paths', repoId] : null, () => api.getPaths(repoId as string));
}

/* -------------------------------------------------------------------------- */
/* Metrics                                                                    */
/* -------------------------------------------------------------------------- */

export function useRepoMetrics(repoId: string | null | undefined, filters: CommitFilters) {
  return useSWR(
    repoId ? ['metrics/repository', repoId, filterKey(filters)] : null,
    () => api.getRepoMetrics(repoId as string, filters),
    { keepPreviousData: true },
  );
}

export function useFileMetrics(
  repoId: string | null | undefined,
  filters: CommitFilters,
  opts: FileMetricOpts = {},
) {
  return useSWR(
    repoId
      ? [
          'metrics/files',
          repoId,
          filterKey(filters),
          opts.pathPrefix ?? '',
          opts.sort ?? '',
          opts.order ?? '',
          opts.page ?? 1,
          opts.pageSize ?? 50,
        ]
      : null,
    () => api.getFileMetrics(repoId as string, filters, opts),
    { keepPreviousData: true },
  );
}

export function useDirectoryMetrics(
  repoId: string | null | undefined,
  filters: CommitFilters,
  opts: { path?: string; depth?: number } = {},
) {
  return useSWR(
    repoId
      ? ['metrics/directories', repoId, filterKey(filters), opts.path ?? '', opts.depth ?? 1]
      : null,
    () => api.getDirectoryMetrics(repoId as string, filters, opts),
    { keepPreviousData: true },
  );
}

export function useAuthorMetrics(
  repoId: string | null | undefined,
  filters: CommitFilters,
  path?: string,
) {
  return useSWR(
    repoId ? ['metrics/authors', repoId, filterKey(filters), path ?? ''] : null,
    () => api.getAuthorMetrics(repoId as string, filters, { path }),
    { keepPreviousData: true },
  );
}

export function useTimeseries(
  repoId: string | null | undefined,
  filters: CommitFilters,
  opts: { bucket?: 'day' | 'week'; path?: string } = {},
) {
  return useSWR(
    repoId
      ? ['metrics/timeseries', repoId, filterKey(filters), opts.bucket ?? 'day', opts.path ?? '']
      : null,
    () => api.getTimeseries(repoId as string, filters, opts),
    { keepPreviousData: true },
  );
}

export function useCommits(
  repoId: string | null | undefined,
  filters: CommitFilters,
  opts: { q?: string; page?: number; pageSize?: number } = {},
) {
  return useSWR(
    repoId
      ? ['commits', repoId, filterKey(filters), opts.q ?? '', opts.page ?? 1, opts.pageSize ?? 25]
      : null,
    () => api.getCommits(repoId as string, { filters, ...opts }),
    { keepPreviousData: true },
  );
}
