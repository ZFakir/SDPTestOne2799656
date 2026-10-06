'use client';

import type { AuthorsResponse, PathsResponse } from '@rat/shared';
import type { CommitFilters } from '@/lib/api';
import { fromDatetimeLocalValue } from '@/lib/format';
import { AuthorSelect } from './AuthorSelect';
import { PathPicker } from './PathPicker';

const DAY = 86400;

export type RangePreset = 'all' | 'last7' | 'last30' | 'last90' | 'custom';

/** UI state of the dashboard filter bar. */
export interface FilterState {
  preset: RangePreset;
  /** `datetime-local` values, UTC. */
  customFrom: string;
  customTo: string;
  /** '' = all authors. */
  authorId: string;
  /** '' = whole repository. */
  path: string;
}

export const EMPTY_FILTERS: FilterState = {
  preset: 'all',
  customFrom: '',
  customTo: '',
  authorId: '',
  path: '',
};

/**
 * Compile the filter-bar state into API commit-set filters. Relative presets
 * anchor to the repository's newest commit (`lastTs`), so "last 30 days" means
 * the final 30 days of recorded history.
 */
export function buildCommitFilters(state: FilterState, lastTs: number | null): CommitFilters {
  const filters: CommitFilters = {};
  if (state.authorId) filters.authorId = state.authorId;

  if (state.preset === 'custom') {
    const from = fromDatetimeLocalValue(state.customFrom);
    const to = fromDatetimeLocalValue(state.customTo);
    if (from !== undefined) filters.fromTs = from;
    // The API range end is exclusive; include the entered minute.
    if (to !== undefined) filters.toTs = to + 60;
  } else if (lastTs !== null) {
    const span = state.preset === 'last7' ? 7 : state.preset === 'last30' ? 30 : state.preset === 'last90' ? 90 : 0;
    if (span > 0) {
      filters.fromTs = lastTs - span * DAY;
      filters.toTs = lastTs + 1;
    }
  }

  return filters;
}

/** Human summary of the active commit-set filters. */
export function describeFilters(state: FilterState): string {
  const parts: string[] = [];
  if (state.preset === 'all') parts.push('all time');
  else if (state.preset === 'custom') {
    const from = state.customFrom || 'start';
    const to = state.customTo || 'latest';
    parts.push(`${from.replace('T', ' ')} → ${to.replace('T', ' ')} UTC`);
  } else parts.push(state.preset.replace('last', 'last ').replace(/(\d+)/, '$1 ') + ' days');

  if (state.authorId) parts.push('author-filtered');
  if (state.path) parts.push(`path ${state.path}`);
  return `Commit set: ${parts.join(' · ')}`;
}

/** Dashboard filter bar: commit range, author and path scope. */
export function FilterBar({
  state,
  onChange,
  authors,
  paths,
}: {
  state: FilterState;
  onChange: (next: FilterState) => void;
  authors: AuthorsResponse | undefined;
  paths: PathsResponse | undefined;
}) {
  const dirty =
    state.preset !== 'all' || state.authorId !== '' || state.path !== '' || state.customFrom !== '' || state.customTo !== '';

  return (
    <form
      className="filter-bar"
      onSubmit={(event) => event.preventDefault()}
      aria-label="Metric filters"
    >
      <div className="field">
        <label className="field-label" htmlFor="filter-preset">
          Commit range
        </label>
        <select
          id="filter-preset"
          className="select"
          value={state.preset}
          onChange={(event) => onChange({ ...state, preset: event.target.value as RangePreset })}
        >
          <option value="all">All time</option>
          <option value="last7">Last 7 days</option>
          <option value="last30">Last 30 days</option>
          <option value="last90">Last 90 days</option>
          <option value="custom">Custom range…</option>
        </select>
      </div>

      {state.preset === 'custom' ? (
        <>
          <div className="field">
            <label className="field-label" htmlFor="filter-from">
              From (UTC)
            </label>
            <input
              id="filter-from"
              className="input"
              type="datetime-local"
              value={state.customFrom}
              onChange={(event) => onChange({ ...state, customFrom: event.target.value })}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="filter-to">
              To (UTC, inclusive)
            </label>
            <input
              id="filter-to"
              className="input"
              type="datetime-local"
              value={state.customTo}
              onChange={(event) => onChange({ ...state, customTo: event.target.value })}
            />
          </div>
        </>
      ) : null}

      <AuthorSelect
        authors={authors}
        value={state.authorId}
        onChange={(authorId) => onChange({ ...state, authorId })}
      />
      <PathPicker
        paths={paths}
        value={state.path}
        onChange={(path) => onChange({ ...state, path })}
      />

      <div className="field" style={{ minWidth: 0, alignSelf: 'flex-end' }}>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!dirty}
          onClick={() => onChange({ ...EMPTY_FILTERS })}
        >
          Clear filters
        </button>
      </div>
    </form>
  );
}
