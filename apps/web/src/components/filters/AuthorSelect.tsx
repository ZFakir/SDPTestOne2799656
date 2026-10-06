'use client';

import type { AuthorsResponse } from '@rat/shared';

/** Author picker fed by the resolved-authors endpoint. */
export function AuthorSelect({
  authors,
  value,
  onChange,
}: {
  authors: AuthorsResponse | undefined;
  value: string;
  onChange: (authorId: string) => void;
}) {
  return (
    <div className="field">
      <label className="field-label" htmlFor="filter-author">
        Author
      </label>
      <select
        id="filter-author"
        className="select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">All authors</option>
        {(authors?.authors ?? []).map((author) => (
          <option key={author.id} value={author.id}>
            {`${author.name} <${author.email}> (${author.commitCount} commits)`}
          </option>
        ))}
      </select>
    </div>
  );
}
