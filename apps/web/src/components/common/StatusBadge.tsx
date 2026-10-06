import {
  JOB_STATUS_LABELS,
  REPO_STATUS_LABELS,
  jobStatusBadgeClass,
  repoStatusBadgeClass,
} from '@/lib/format';

/** Status badge for a repository (`status` from RepositoryDTO). */
export function RepoStatusBadge({ status }: { status: string }) {
  return (
    <span className={repoStatusBadgeClass(status)}>
      {REPO_STATUS_LABELS[status] ?? status}
    </span>
  );
}

/** Status badge for an ingestion job (`status` from JobDTO). */
export function JobStatusBadge({ status }: { status: string }) {
  return (
    <span className={jobStatusBadgeClass(status)}>{JOB_STATUS_LABELS[status] ?? status}</span>
  );
}
