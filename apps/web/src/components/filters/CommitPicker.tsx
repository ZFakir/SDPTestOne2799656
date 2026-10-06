'use client';

import { useEffect, useState } from 'react';
import { formatDateTime, formatInt, shortSha } from '@/lib/format';
import { useCommits } from '@/lib/hooks';

const PAGE_SIZE = 25;

/**
 * Manual commit-selection picker. The draft selection is applied as the
 * dashboard commit set; while active it overrides the range presets (the API
 * rejects `commitIds` combined with `fromTs`/`toTs`).
 */
export function CommitPicker({
  repoId,
  selected,
  onApply,
  onClose,
}: {
  repoId: string;
  /** Currently applied selection, seeds the draft. */
  selected: string[];
  onApply: (commitIds: string[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Set<string>>(() => new Set(selected));
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  // A new search term restarts pagination.
  useEffect(() => {
    setPage(1);
  }, [q]);

  const { data, error, isLoading } = useCommits(
    repoId,
    {},
    { q: q.trim() || undefined, page, pageSize: PAGE_SIZE },
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const toggle = (sha: string) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(sha)) next.delete(sha);
      else next.add(sha);
      return next;
    });
  };

  const allOnPage = items.length > 0 && items.every((commit) => draft.has(commit.sha));
  const togglePage = () => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (allOnPage) {
        for (const commit of items) next.delete(commit.sha);
      } else {
        for (const commit of items) next.add(commit.sha);
      }
      return next;
    });
  };

  return (
    <div className="picker" role="region" aria-label="Commit selection">
      <div className="picker-head">
        <div className="stack" style={{ gap: 'var(--space-xxs)' }}>
          <span className="section-title" style={{ fontSize: 'var(--text-lg)' }}>
            Select commits
          </span>
          <span className="muted text-xs">
            The commit set becomes the explicit selection — range presets are ignored while a
            selection is active. The author filter still applies on top.
          </span>
        </div>
        <div className="row" style={{ gap: 'var(--space-sm)' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={draft.size === 0 && selected.length === 0}
            onClick={() => onApply([...draft])}
          >
            Apply {draft.size > 0 ? `(${formatInt(draft.size)})` : '(clear)'}
          </button>
        </div>
      </div>

      <div className="picker-controls">
        <input
          className="input picker-search"
          type="search"
          placeholder="Search sha, author name or email…"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          aria-label="Search commits"
        />
        <label className="picker-select-page">
          <input type="checkbox" checked={allOnPage} onChange={togglePage} />
          Select this page
        </label>
      </div>

      {error ? (
        <div className="banner banner-error" role="alert">
          Failed to load commits: {error instanceof Error ? error.message : 'unknown error'}
        </div>
      ) : null}

      <div className="picker-list">
        {isLoading && !data ? (
          Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="skeleton" style={{ height: 32 }} />
          ))
        ) : items.length === 0 ? (
          <span className="muted text-sm" style={{ padding: 'var(--space-md)' }}>
            {q ? `No commits match “${q}”.` : 'This repository has no commits.'}
          </span>
        ) : (
          items.map((commit) => {
            const isSelected = draft.has(commit.sha);
            return (
              <label
                key={commit.sha}
                className={`picker-row${isSelected ? ' picker-row-active' : ''}`}
              >
                <input type="checkbox" checked={isSelected} onChange={() => toggle(commit.sha)} />
                <span className="mono text-xs picker-sha">{shortSha(commit.sha)}</span>
                <span className="muted text-xs picker-ts">{formatDateTime(commit.ts)}</span>
                <span className="picker-author">{commit.authorName}</span>
              </label>
            );
          })
        )}
      </div>

      <div className="picker-foot">
        <span className="muted text-xs">
          {formatInt(total)} commit{total === 1 ? '' : 's'} · page {formatInt(page)} of{' '}
          {formatInt(pageCount)} · {formatInt(draft.size)} selected
        </span>
        <div className="row" style={{ gap: 'var(--space-xs)' }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={page <= 1}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          >
            ← Prev
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={page >= pageCount}
            onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
