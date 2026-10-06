import { Router } from 'express';
import type {
  AuthorMetricsResponse,
  DirectoryMetricRowDTO,
  DirectoryMetricsDTO,
  FileMetricRowDTO,
  ListResponse,
  TimeseriesResponse,
} from '@rat/shared';
import { decorateAuthorRows, queryAuthorMetrics, resolveAuthors } from '../metrics/authorMetrics';
import { commitSetInfo, parseMetricFilters } from '../metrics/commitSet';
import {
  queryFileAggregates,
  queryObjectSums,
  queryTimeseries,
  resolvePathScope,
} from '../metrics/objectMetrics';
import { queryRepoMetrics, toObjectMetricsDTO } from '../metrics/setMetrics';
import { optionalEnum, optionalInt, optionalString, pagingParams } from '../middleware/validate';
import { requireReadyRepository, type Services } from '../services';
import { badRequest, notFound } from '../util/errors';

const FILE_SORT_KEYS = [
  'path',
  'added',
  'removed',
  'growth',
  'churn',
  'modifications',
  'modificationFrequency',
  'churnRate',
] as const;
type FileSortKey = (typeof FILE_SORT_KEYS)[number];

const MAX_DIRECTORY_DEPTH = 5;

function segmentCount(path: string): number {
  return path.split('/').length;
}

/** `/api/repositories/:repoId/metrics` — every metric category of the brief. */
export function metricsRouter(services: Services): Router {
  const { db } = services;
  const router = Router();

  router.get('/:repoId/metrics/repository', (req, res) => {
    const repo = requireReadyRepository(services, req.params.repoId);
    const filters = parseMetricFilters(req.query);
    res.json(queryRepoMetrics(db, repo.id, filters));
  });

  router.get('/:repoId/metrics/files', (req, res) => {
    const repo = requireReadyRepository(services, req.params.repoId);
    const filters = parseMetricFilters(req.query);
    const paging = pagingParams(req.query);
    const pathPrefix = optionalString(req.query.pathPrefix);
    const sort: FileSortKey = optionalEnum(req.query.sort, FILE_SORT_KEYS, 'sort') ?? 'churn';
    const order =
      optionalEnum(req.query.order, ['asc', 'desc'] as const, 'order') ??
      (sort === 'path' ? 'asc' : 'desc');

    const info = commitSetInfo(db, repo.id, filters);
    const rows: FileMetricRowDTO[] = queryFileAggregates(db, repo.id, filters, pathPrefix).map(
      (row) => ({
        path: row.path,
        ...toObjectMetricsDTO(
          { added: row.added, removed: row.removed, modifications: row.modifications },
          info.commitCount,
        ),
      }),
    );

    const direction = order === 'asc' ? 1 : -1;
    const compare = (a: FileMetricRowDTO, b: FileMetricRowDTO): number => {
      let diff = 0;
      switch (sort) {
        case 'path':
          return direction * a.path.localeCompare(b.path);
        case 'added':
          diff = a.added - b.added;
          break;
        case 'removed':
          diff = a.removed - b.removed;
          break;
        case 'growth':
          diff = a.growth - b.growth;
          break;
        case 'churn':
          diff = a.churn - b.churn;
          break;
        case 'modifications':
          diff = a.modifications - b.modifications;
          break;
        case 'modificationFrequency':
          diff = a.modificationFrequency - b.modificationFrequency;
          break;
        case 'churnRate':
          diff = a.churnRate - b.churnRate;
          break;
      }
      return direction * diff || a.path.localeCompare(b.path);
    };
    rows.sort(compare);

    const items = rows.slice(paging.offset, paging.offset + paging.pageSize);
    res.json({
      items,
      total: rows.length,
      page: paging.page,
      pageSize: paging.pageSize,
      commitCount: info.commitCount,
    } satisfies ListResponse<FileMetricRowDTO>);
  });

  router.get('/:repoId/metrics/directories', (req, res) => {
    const repo = requireReadyRepository(services, req.params.repoId);
    const filters = parseMetricFilters(req.query);
    const requested = (optionalString(req.query.path) ?? '').replace(/\/+$/, '');
    const depth = optionalInt(req.query.depth, 'depth') ?? 1;
    if (depth < 1 || depth > MAX_DIRECTORY_DEPTH) {
      throw badRequest(
        `Query parameter "depth" must be between 1 and ${MAX_DIRECTORY_DEPTH}.`,
      );
    }

    // The requested path must be the root or an existing directory.
    if (requested !== '') {
      const known = db
        .prepare('SELECT 1 FROM repo_dirs WHERE repo_id = ? AND path = ?')
        .get(repo.id, requested);
      if (!known) {
        throw notFound(`Directory "${requested}" not found in this repository.`, 'DIR_NOT_FOUND');
      }
    }

    const info = commitSetInfo(db, repo.id, filters);
    const self = toObjectMetricsDTO(
      queryObjectSums(db, repo.id, filters, { kind: 'dir', path: requested }),
      info.commitCount,
    );

    // All descendant directories within the requested depth.
    const dirRows =
      requested === ''
        ? (db
            .prepare('SELECT path FROM repo_dirs WHERE repo_id = ? ORDER BY path')
            .all(repo.id) as Array<{ path: string }>)
        : (db
            .prepare(
              `SELECT path FROM repo_dirs
                WHERE repo_id = ? AND path > ? AND path < ?
                ORDER BY path`,
            )
            .all(repo.id, `${requested}/`, `${requested}0`) as Array<{ path: string }>);
    const baseSegments = requested === '' ? 0 : segmentCount(requested);
    const children = dirRows.filter((row) => segmentCount(row.path) - baseSegments <= depth);

    const childRows: DirectoryMetricRowDTO[] = children.map((row) => ({
      path: row.path,
      depth: segmentCount(row.path) - baseSegments,
      ...toObjectMetricsDTO(
        queryObjectSums(db, repo.id, filters, { kind: 'dir', path: row.path }),
        info.commitCount,
      ),
    }));

    res.json({
      path: requested,
      self,
      children: childRows,
    } satisfies DirectoryMetricsDTO);
  });

  router.get('/:repoId/metrics/authors', (req, res) => {
    const repo = requireReadyRepository(services, req.params.repoId);
    const filters = parseMetricFilters(req.query);
    const scope = resolvePathScope(db, repo.id, optionalString(req.query.path));
    const result = decorateAuthorRows(
      queryAuthorMetrics(db, repo.id, filters, scope),
      resolveAuthors(db, repo.id),
    );
    res.json({
      totalChurn: result.totalChurn,
      authors: result.rows,
    } satisfies AuthorMetricsResponse);
  });

  router.get('/:repoId/metrics/timeseries', (req, res) => {
    const repo = requireReadyRepository(services, req.params.repoId);
    const filters = parseMetricFilters(req.query);
    const bucket = optionalEnum(req.query.bucket, ['day', 'week'] as const, 'bucket') ?? 'day';
    const scope = resolvePathScope(db, repo.id, optionalString(req.query.path));
    const points = queryTimeseries(db, repo.id, filters, scope, bucket);
    res.json({ bucket, points } satisfies TimeseriesResponse);
  });

  return router;
}
