import type { DB } from '../src/db/database';
import { resolveAuthors, queryAuthorMetrics } from '../src/metrics/authorMetrics';
import { commitSetInfo, parseMetricFilters } from '../src/metrics/commitSet';
import {
  queryFileAggregates,
  queryObjectSums,
  queryTimeseries,
  resolvePathScope,
} from '../src/metrics/objectMetrics';
import { queryRepoMetrics } from '../src/metrics/setMetrics';
import { AppError } from '../src/util/errors';
import { createTempDb } from './helpers/testDb';
import { BASE_TS, DAY, REPO_ID, seedRepository, sha } from './helpers/seeds';

/**
 * Engine-level tests over the hand-computed seed scenario (see seeds.ts).
 * Expected repository metrics: added=35 removed=6 growth=29 churn=41 mods=9 |H|=12.
 */
describe('metrics engine', () => {
  let db: DB;
  let cleanup: () => void;

  beforeEach(() => {
    const temp = createTempDb();
    db = temp.db;
    cleanup = temp.cleanup;
    seedRepository(db);
  });

  afterEach(() => cleanup());

  describe('queryRepoMetrics', () => {
    it('computes the repository totals over all commits', () => {
      const metrics = queryRepoMetrics(db, REPO_ID, {});
      expect(metrics).toMatchObject({
        added: 35,
        removed: 6,
        growth: 29,
        churn: 41,
        modifications: 9,
        commitCount: 12,
        firstTs: BASE_TS,
        lastTs: BASE_TS + 11 * DAY,
      });
      expect(metrics.modificationFrequency).toBeCloseTo(0.75, 10);
      expect(metrics.churnRate).toBeCloseTo(41 / 12, 10);
    });

    it('applies the [fromTs, toTs) range filter', () => {
      const metrics = queryRepoMetrics(db, REPO_ID, {
        fromTs: BASE_TS + 4 * DAY,
        toTs: BASE_TS + 8 * DAY,
      });
      expect(metrics).toMatchObject({
        added: 2,
        removed: 4,
        growth: -2,
        churn: 6,
        modifications: 2,
        commitCount: 4,
      });
      expect(metrics.churnRate).toBeCloseTo(1.5, 10);
    });

    it('filters by resolved author id', () => {
      const metrics = queryRepoMetrics(db, REPO_ID, { authorId: 'mailto:bob@example.com' });
      expect(metrics).toMatchObject({
        added: 17,
        removed: 5,
        growth: 12,
        churn: 22,
        modifications: 6,
        commitCount: 6,
      });
    });

    it('filters by explicit commit ids', () => {
      const metrics = queryRepoMetrics(db, REPO_ID, { commitIds: [sha(1), sha(2)] });
      expect(metrics).toMatchObject({
        added: 18,
        removed: 0,
        growth: 18,
        churn: 18,
        modifications: 2,
        commitCount: 2,
      });
    });

    it('returns zeroed metrics (and no time span) for an empty commit set', () => {
      const metrics = queryRepoMetrics(db, REPO_ID, { fromTs: BASE_TS + 100 * DAY });
      expect(metrics).toMatchObject({
        added: 0,
        removed: 0,
        growth: 0,
        churn: 0,
        modifications: 0,
        commitCount: 0,
        firstTs: null,
        lastTs: null,
      });
      expect(metrics.modificationFrequency).toBe(0);
      expect(metrics.churnRate).toBe(0);
    });
  });

  describe('commitSetInfo', () => {
    it('reports |H| and the time span', () => {
      const info = commitSetInfo(db, REPO_ID, {});
      expect(info).toEqual({
        commitCount: 12,
        firstTs: BASE_TS,
        lastTs: BASE_TS + 11 * DAY,
      });
    });

    it('counts a single commit id', () => {
      const info = commitSetInfo(db, REPO_ID, { commitIds: [sha(5)] });
      expect(info).toEqual({ commitCount: 1, firstTs: BASE_TS + 4 * DAY, lastTs: BASE_TS + 4 * DAY });
    });
  });

  describe('resolvePathScope', () => {
    it('resolves the root, directories and files', () => {
      expect(resolvePathScope(db, REPO_ID, undefined)).toEqual({ kind: 'dir', path: '' });
      expect(resolvePathScope(db, REPO_ID, '')).toEqual({ kind: 'dir', path: '' });
      expect(resolvePathScope(db, REPO_ID, 'src')).toEqual({ kind: 'dir', path: 'src' });
      expect(resolvePathScope(db, REPO_ID, 'src/')).toEqual({ kind: 'dir', path: 'src' });
      expect(resolvePathScope(db, REPO_ID, 'src/core')).toEqual({ kind: 'dir', path: 'src/core' });
      expect(resolvePathScope(db, REPO_ID, 'src/main.c')).toEqual({
        kind: 'file',
        path: 'src/main.c',
      });
    });

    it('throws PATH_NOT_FOUND for unknown paths', () => {
      try {
        resolvePathScope(db, REPO_ID, 'missing/such/path');
        fail('expected resolvePathScope to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe('PATH_NOT_FOUND');
      }
    });
  });

  describe('object sums and scopes', () => {
    it('sums the whole repository', () => {
      expect(queryObjectSums(db, REPO_ID, {}, { kind: 'all' })).toEqual({
        added: 35,
        removed: 6,
        modifications: 9,
      });
    });

    it('sums a directory subtree', () => {
      expect(queryObjectSums(db, REPO_ID, {}, { kind: 'dir', path: 'src' })).toEqual({
        added: 20,
        removed: 1,
        modifications: 5,
      });
      expect(queryObjectSums(db, REPO_ID, {}, { kind: 'dir', path: 'docs' })).toEqual({
        added: 8,
        removed: 4,
        modifications: 3,
      });
    });

    it('sums a single file', () => {
      expect(queryObjectSums(db, REPO_ID, {}, { kind: 'file', path: 'src/main.c' })).toEqual({
        added: 10,
        removed: 1,
        modifications: 2,
      });
    });

    it('does not match sibling directories with a shared prefix', () => {
      // `src` must not capture `src2/...`-style paths: the range guard uses
      // `path > 'src/' AND path < 'src0'`.
      const sums = queryObjectSums(db, REPO_ID, {}, { kind: 'dir', path: 'doc' });
      expect(sums).toEqual({ added: 0, removed: 0, modifications: 0 });
    });
  });

  describe('queryFileAggregates', () => {
    it('aggregates every file, ordered by path', () => {
      const files = queryFileAggregates(db, REPO_ID, {});
      expect(files).toHaveLength(9);
      expect(files.map((f) => f.path)).toEqual([
        '.mailmap',
        'README.md',
        'docs/api/ref.md',
        'docs/notes.txt',
        'docs/readme.md',
        'src/core/helper.c',
        'src/feat.c',
        'src/main.c',
        'src/util.c',
      ]);
      const byPath = new Map(files.map((f) => [f.path, f]));
      expect(byPath.get('src/main.c')).toMatchObject({ added: 10, removed: 1, modifications: 2 });
      expect(byPath.get('docs/readme.md')).toMatchObject({ added: 4, removed: 4, modifications: 2 });
      expect(byPath.get('README.md')).toMatchObject({ added: 5, removed: 1, modifications: 2 });
      expect(byPath.get('.mailmap')).toMatchObject({ added: 2, removed: 0, modifications: 1 });
    });

    it('restricts rows with a path prefix', () => {
      const files = queryFileAggregates(db, REPO_ID, {}, 'src/');
      expect(files.map((f) => f.path)).toEqual([
        'src/core/helper.c',
        'src/feat.c',
        'src/main.c',
        'src/util.c',
      ]);
    });

    it('applies commit-set filters together with the prefix', () => {
      const files = queryFileAggregates(db, REPO_ID, { authorId: 'mailto:bob@example.com' }, 'src/');
      expect(files.map((f) => f.path)).toEqual(['src/core/helper.c', 'src/util.c']);
    });
  });

  describe('queryTimeseries', () => {
    it('buckets by day (UTC)', () => {
      const points = queryTimeseries(db, REPO_ID, {}, { kind: 'all' }, 'day');
      expect(points).toHaveLength(12);
      expect(points[0]).toEqual({
        bucket: '2023-01-01',
        added: 13,
        removed: 0,
        growth: 13,
        churn: 13,
        commits: 1,
      });
      expect(points[3]).toEqual({
        bucket: '2023-01-04',
        added: 6,
        removed: 0,
        growth: 6,
        churn: 6,
        commits: 1,
      });
      expect(points[7]).toEqual({
        bucket: '2023-01-08',
        added: 0,
        removed: 4,
        growth: -4,
        churn: 4,
        commits: 1,
      });
      expect(points[8]).toEqual({
        bucket: '2023-01-09',
        added: 0,
        removed: 0,
        growth: 0,
        churn: 0,
        commits: 1,
      });
      const totalAdded = points.reduce((acc, point) => acc + point.added, 0);
      expect(totalAdded).toBe(35);
    });

    it('buckets by ISO-like week (%W, Monday-based)', () => {
      const points = queryTimeseries(db, REPO_ID, {}, { kind: 'all' }, 'week');
      expect(points.map((point) => [point.bucket, point.commits])).toEqual([
        ['2023-W00', 1],
        ['2023-W01', 7],
        ['2023-W02', 4],
      ]);
    });

    it('keeps every commit bucket when the scope has no changes there', () => {
      const points = queryTimeseries(db, REPO_ID, {}, { kind: 'dir', path: 'src' }, 'day');
      expect(points).toHaveLength(12);
      const totalAdded = points.reduce((acc, point) => acc + point.added, 0);
      expect(totalAdded).toBe(20);
      expect(points[1]).toMatchObject({ bucket: '2023-01-02', added: 5, commits: 1 });
      expect(points[4]).toMatchObject({ bucket: '2023-01-05', added: 0, commits: 1 });
    });
  });

  describe('resolveAuthors', () => {
    it('folds mailmap idents into the canonical author', () => {
      const resolved = resolveAuthors(db, REPO_ID);
      expect(resolved.authors).toHaveLength(2);

      const alice = resolved.authors[0];
      expect(alice).toMatchObject({
        id: 'mailto:alice@example.com',
        name: 'Alice Smith',
        email: 'alice@example.com',
        kind: 'mailmap',
        commitCount: 6,
        rawIdentCount: 2,
      });

      const bob = resolved.authors[1];
      expect(bob).toMatchObject({
        id: 'mailto:bob@example.com',
        name: 'Bob Beta',
        email: 'bob@example.com',
        kind: 'raw',
        commitCount: 6,
        rawIdentCount: 1,
      });

      expect(resolved.rawIdents).toHaveLength(3);
      expect(resolved.rawIdents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Alice', email: 'alice@wits.ac.za' }),
        ]),
      );
      expect(resolved.byId.get('mailto:alice@example.com')).toBe(alice);
    });
  });

  describe('queryAuthorMetrics', () => {
    it('computes per-author churn and ownership', () => {
      const result = queryAuthorMetrics(db, REPO_ID, {}, { kind: 'all' });
      expect(result.totalChurn).toBe(41);
      expect(result.rows).toHaveLength(2);

      const [bob, alice] = result.rows;
      expect(bob).toMatchObject({
        id: 'mailto:bob@example.com',
        added: 17,
        removed: 5,
        churn: 22,
        commitCount: 6,
        modifications: 6,
      });
      expect(bob.ownership).toBeCloseTo(22 / 41, 10);

      expect(alice).toMatchObject({
        id: 'mailto:alice@example.com',
        added: 18,
        removed: 1,
        churn: 19,
        commitCount: 6,
        modifications: 3,
      });
      expect(alice.ownership).toBeCloseTo(19 / 41, 10);

      const ownershipSum = result.rows.reduce((acc, row) => acc + row.ownership, 0);
      expect(ownershipSum).toBeCloseTo(1, 10);
    });

    it('restricts churn to the path scope but keeps the full commit count', () => {
      const result = queryAuthorMetrics(db, REPO_ID, {}, { kind: 'dir', path: 'src' });
      expect(result.totalChurn).toBe(21);
      const [alice, bob] = result.rows; // churn desc: Alice 14, Bob 7
      expect(alice).toMatchObject({
        id: 'mailto:alice@example.com',
        added: 13,
        removed: 1,
        churn: 14,
        modifications: 3,
        commitCount: 6,
      });
      expect(bob).toMatchObject({
        id: 'mailto:bob@example.com',
        added: 7,
        removed: 0,
        churn: 7,
        modifications: 2,
        commitCount: 6,
      });
    });
  });

  describe('parseMetricFilters', () => {
    it('parses and normalises commit ids', () => {
      expect(parseMetricFilters({ commitIds: 'ABCD,ef01,ABCD' })).toEqual({
        fromTs: undefined,
        toTs: undefined,
        authorId: undefined,
        commitIds: ['abcd', 'ef01'],
      });
    });

    it('rejects commit ids combined with a timestamp range', () => {
      expect(() => parseMetricFilters({ commitIds: 'abcd', fromTs: '1' })).toThrow(
        /cannot be combined/,
      );
    });

    it('rejects malformed commit ids', () => {
      expect(() => parseMetricFilters({ commitIds: 'nope!' })).toThrow(/valid commit SHA/);
    });

    it('rejects unknown author id schemes', () => {
      expect(() => parseMetricFilters({ authorId: 'bob@example.com' })).toThrow(
        /authors endpoint/,
      );
    });

    it('rejects a reversed timestamp range', () => {
      expect(() => parseMetricFilters({ fromTs: '10', toTs: '5' })).toThrow(
        /less than or equal/,
      );
    });
  });
});
