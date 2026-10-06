import type { ReactNode } from 'react';

/** Centered empty-state block with optional call to action. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card empty-state">
      <h3>{title}</h3>
      {description ? <p className="text-sm">{description}</p> : null}
      {action}
    </div>
  );
}
