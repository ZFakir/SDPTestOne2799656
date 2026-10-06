'use client';

import { useRef, useState } from 'react';
import { ApiError, api, type UploadResponse } from '@/lib/api';
import { formatBytes, formatPercent } from '@/lib/format';
import { ErrorBanner } from '@/components/common/ErrorBanner';

/**
 * Zip upload form: staged multipart POST with browser upload progress; the
 * server-side ingestion job is tracked by the parent list afterwards.
 */
export function ZipUploadForm({ onCreated }: { onCreated: (result: UploadResponse) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file || uploading) return;
    setUploading(true);
    setProgress(0);
    setError(null);
    try {
      const result = await api.uploadRepository(file, setProgress);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      onCreated(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <form className="stack" style={{ gap: 'var(--space-md)' }} onSubmit={submit}>
      <div className="field">
        <label className="field-label" htmlFor="zip-file">
          Repository archive (.zip)
        </label>
        <input
          id="zip-file"
          ref={inputRef}
          className="input"
          type="file"
          accept=".zip,application/zip"
          style={{ paddingTop: 8, height: 'auto' }}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setError(null);
          }}
        />
        <span className="field-hint">
          The archive must contain the Git history (a <span className="mono">.git</span> directory)
          — e.g. produced by <span className="mono">git clone --mirror</span> plus{' '}
          <span className="mono">zip -r</span>.
        </span>
      </div>

      {file ? (
        <p className="text-sm muted">
          Selected: <span className="mono">{file.name}</span> ({formatBytes(file.size)})
        </p>
      ) : null}

      {uploading ? (
        <div className="stack" style={{ gap: 'var(--space-xxs)' }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="text-xs muted">Uploading archive…</span>
            <span className="text-xs mono">{formatPercent(progress, 0)}</span>
          </div>
          <div className="progress">
            <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      ) : null}

      {error ? <ErrorBanner message={error} /> : null}

      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={!file || uploading}>
          {uploading ? 'Uploading…' : 'Upload and analyze'}
        </button>
      </div>
    </form>
  );
}
