'use client';

import type { PathsResponse } from '@rat/shared';

/**
 * Path scope picker: root, directories (applied as subtree/prefix) or a single
 * file. Drives the files table (prefix), the authors table (scope) and the
 * churn chart (scope); the Directories tab navigates the tree independently.
 */
export function PathPicker({
  paths,
  value,
  onChange,
}: {
  paths: PathsResponse | undefined;
  value: string;
  onChange: (path: string) => void;
}) {
  return (
    <div className="field field-grow">
      <label className="field-label" htmlFor="filter-path">
        Path scope
      </label>
      <select
        id="filter-path"
        className="select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Whole repository</option>
        {(paths?.dirs ?? []).length > 0 ? (
          <optgroup label="Directories">
            {(paths?.dirs ?? []).map((dir) => (
              <option key={`dir:${dir}`} value={dir}>
                {dir}/
              </option>
            ))}
          </optgroup>
        ) : null}
        {(paths?.files ?? []).length > 0 ? (
          <optgroup label="Files">
            {(paths?.files ?? []).map((file) => (
              <option key={`file:${file}`} value={file}>
                {file}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
    </div>
  );
}
