'use client';

import { useMemo, useState } from 'react';
import { useSWRConfig } from 'swr';
import type { CanonicalAuthorDTO, RawIdentDTO } from '@rat/shared';
import { api } from '@/lib/api';
import { formatInt } from '@/lib/format';
import { useAuthors, useCanonicalAuthors } from '@/lib/hooks';

/**
 * Manual author-merge panel: folds raw git identities into canonical authors.
 * The canonical layer overrides the mailmap layer, so merged identities are
 * attributed to one author in every metrics view.
 */
export function AuthorMergePanel({ repoId }: { repoId: string }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: authorsData } = useAuthors(repoId);
  const { data: canonicalData } = useCanonicalAuthors(repoId);
  const { mutate: globalMutate } = useSWRConfig();

  /** Every metrics key plus the author lists depend on the canonical map. */
  function revalidate() {
    void globalMutate(
      (key) =>
        Array.isArray(key) &&
        typeof key[0] === 'string' &&
        (key[0] === 'authors' || key[0] === 'authors/canonical' || key[0].startsWith('metrics/')),
      undefined,
      { revalidate: true },
    );
  }

  const rawIdents = useMemo(
    () =>
      [...(authorsData?.rawIdents ?? [])].sort(
        (a, b) => b.commitCount - a.commitCount || a.id - b.id,
      ),
    [authorsData],
  );

  const identById = useMemo(() => {
    const map = new Map<number, RawIdentDTO>();
    for (const ident of rawIdents) map.set(ident.id, ident);
    return map;
  }, [rawIdents]);

  const merges = canonicalData?.authors ?? [];

  /** Raw identity id → canonical author that already owns it. */
  const mergedInto = useMemo(() => {
    const map = new Map<number, CanonicalAuthorDTO>();
    for (const canonical of merges) {
      for (const identId of canonical.identIds) map.set(identId, canonical);
    }
    return map;
  }, [merges]);

  function toggleIdent(ident: RawIdentDTO) {
    setError(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ident.id)) next.delete(ident.id);
      else next.add(ident.id);
      return next;
    });
    // Prefill the display fields from the first picked identity.
    setName((prev) => (prev.trim() ? prev : ident.name));
    setEmail((prev) => (prev.trim() ? prev : ident.email));
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      revalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The merge operation failed.');
    } finally {
      setBusy(false);
    }
  }

  async function mergeSelected() {
    const identIds = [...selected].sort((a, b) => a - b);
    await run(async () => {
      await api.createCanonicalAuthor(repoId, {
        name: name.trim(),
        email: email.trim(),
        identIds,
      });
      setSelected(new Set());
      setName('');
      setEmail('');
    });
  }

  async function removeIdent(canonical: CanonicalAuthorDTO, identId: number) {
    await run(() =>
      api.updateCanonicalAuthor(repoId, canonical.id, {
        identIds: canonical.identIds.filter((id) => id !== identId),
      }),
    );
  }

  async function unmergeAll(canonical: CanonicalAuthorDTO) {
    await run(() => api.deleteCanonicalAuthor(repoId, canonical.id));
  }

  const canMerge = selected.size > 0 && name.trim() !== '' && email.trim() !== '' && !busy;

  return (
    <div className="merge-panel">
      <button
        type="button"
        className="merge-toggle"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="merge-caret" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        <span className="merge-toggle-title">Manual author merges</span>
        <span className="muted text-xs">
          {formatInt(merges.length)} merged author{merges.length === 1 ? '' : 's'} ·{' '}
          {formatInt(rawIdents.length)} raw identit{rawIdents.length === 1 ? 'y' : 'ies'} · overrides
          the mailmap layer
        </span>
      </button>

      {open ? (
        <div className="merge-body">
          <div className="merge-grid">
            <div className="merge-col">
              <span className="field-label">Raw git identities</span>
              <div className="ident-list">
                {rawIdents.length === 0 ? (
                  <span className="muted text-sm">No identities recorded.</span>
                ) : (
                  rawIdents.map((ident) => {
                    const merged = mergedInto.get(ident.id);
                    const checked = selected.has(ident.id);
                    return (
                      <label
                        key={ident.id}
                        className={`ident-row${checked ? ' ident-row-active' : ''}${
                          merged ? ' ident-row-merged' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={merged !== undefined || busy}
                          onChange={() => toggleIdent(ident)}
                        />
                        <span className="ident-name">{ident.name}</span>
                        <span className="muted text-xs mono">{ident.email}</span>
                        <span className="muted text-xs ident-count">
                          {formatInt(ident.commitCount)} commits
                        </span>
                        {merged ? <span className="badge badge-info">merged</span> : null}
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <div className="merge-col">
              <span className="field-label">Merge selection</span>
              <div className="merge-form">
                <input
                  className="input"
                  placeholder="Display name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  aria-label="Canonical author name"
                />
                <input
                  className="input"
                  placeholder="Display email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-label="Canonical author email"
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={!canMerge}
                  onClick={mergeSelected}
                >
                  {busy
                    ? 'Working…'
                    : `Merge ${selected.size > 0 ? `(${selected.size})` : ''}`.trim()}
                </button>
              </div>
              <span className="field-hint">
                Pick identities on the left, adjust the display name/email, then merge. A single
                identity can be merged to rename it.
              </span>

              {error ? (
                <div className="banner banner-error" role="alert">
                  {error}
                </div>
              ) : null}

              <span className="field-label" style={{ marginTop: 'var(--space-md)' }}>
                Active merges
              </span>
              {merges.length === 0 ? (
                <span className="muted text-sm">
                  No manual merges yet. Merged authors take precedence over mailmap resolution.
                </span>
              ) : (
                <div className="merge-list">
                  {merges.map((canonical) => (
                    <div key={canonical.id} className="merge-item">
                      <div className="merge-item-head">
                        <div>
                          <div className="merge-item-name">{canonical.name}</div>
                          <div className="muted text-xs mono">{canonical.email}</div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          disabled={busy}
                          onClick={() => unmergeAll(canonical)}
                        >
                          Unmerge all
                        </button>
                      </div>
                      <div className="merge-chips">
                        {canonical.identIds.map((identId) => {
                          const ident = identById.get(identId);
                          const label = ident
                            ? `${ident.name} <${ident.email}>`
                            : `identity #${identId}`;
                          return (
                            <span key={identId} className="ident-chip">
                              <span>{label}</span>
                              <button
                                type="button"
                                className="ident-chip-x"
                                aria-label={`Remove ${label} from ${canonical.name}`}
                                disabled={busy}
                                onClick={() => removeIdent(canonical, identId)}
                              >
                                ×
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
