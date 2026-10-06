'use client';

import { useState } from 'react';
import { ApiError, api, type UploadResponse } from '@/lib/api';
import { ErrorBanner } from '@/components/common/ErrorBanner';

const URL_RE = /^(https?:\/\/|git:\/\/|ssh:\/\/|git@)\S+$/;

/** Clone form: mirrors a remote repository server-side. */
export function CloneUrlForm({ onCreated }: { onCreated: (result: UploadResponse) => void }) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!URL_RE.test(url.trim())) {
      setError('Enter a valid http(s)://, git://, ssh:// or git@ clone URL.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.cloneRepository({
        url: url.trim(),
        name: name.trim() || undefined,
      });
      setUrl('');
      setName('');
      onCreated(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Clone request failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" style={{ gap: 'var(--space-md)' }} onSubmit={submit}>
      <div className="field">
        <label className="field-label" htmlFor="clone-url">
          Clone URL
        </label>
        <input
          id="clone-url"
          className="input mono"
          type="text"
          placeholder="https://github.com/owner/repo.git"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          spellCheck={false}
        />
        <span className="field-hint">
          A full (non-shallow) mirror clone is created server-side; large repositories take a
          while and can be tracked below.
        </span>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="clone-name">
          Display name <span className="muted">(optional)</span>
        </label>
        <input
          id="clone-name"
          className="input"
          type="text"
          placeholder="Defaults to the repository name in the URL"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
        />
      </div>

      {error ? <ErrorBanner message={error} /> : null}

      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={busy || url.trim() === ''}>
          {busy ? 'Requesting clone…' : 'Clone and analyze'}
        </button>
      </div>
    </form>
  );
}
