'use client';

/** Inline error banner with an optional retry action. */
export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="banner banner-error" role="alert">
      <span aria-hidden="true">!</span>
      <span style={{ flex: 1 }}>{message}</span>
      {onRetry ? (
        <button type="button" className="btn btn-sm btn-ghost" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}
