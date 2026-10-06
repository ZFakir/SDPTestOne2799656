'use client';

import { useState } from 'react';
import type { UploadResponse } from '@/lib/api';
import { CloneUrlForm } from './CloneUrlForm';
import { ZipUploadForm } from './ZipUploadForm';

type Tab = 'upload' | 'clone';

/** Ingest panel: tabbed zip upload / clone URL forms. */
export function IngestTabs({ onCreated }: { onCreated: (result: UploadResponse) => void }) {
  const [tab, setTab] = useState<Tab>('upload');

  return (
    <section className="card card-pad-lg stack" style={{ gap: 'var(--space-md)' }}>
      <div className="panel-header" style={{ marginBottom: 0 }}>
        <div>
          <h2 className="section-title">Add a repository</h2>
          <p className="section-sub">
            Both sources are analyzed asynchronously — progress appears below.
          </p>
        </div>
        <div className="segmented" role="tablist" aria-label="Ingestion source">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'upload'}
            aria-pressed={tab === 'upload'}
            onClick={() => setTab('upload')}
          >
            Upload zip
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'clone'}
            aria-pressed={tab === 'clone'}
            onClick={() => setTab('clone')}
          >
            Clone URL
          </button>
        </div>
      </div>
      {tab === 'upload' ? (
        <ZipUploadForm onCreated={onCreated} />
      ) : (
        <CloneUrlForm onCreated={onCreated} />
      )}
    </section>
  );
}
