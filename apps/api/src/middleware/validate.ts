import { z } from 'zod';
import { badRequest } from '../util/errors';

/** First value of an Express query parameter (repeated params are collapsed). */
function first(value: unknown): unknown {
  if (Array.isArray(value)) return value.length > 0 ? value[0] : undefined;
  return value;
}

/** Trimmed string query parameter, or undefined for empty/missing values. */
export function optionalString(value: unknown): string | undefined {
  const raw = first(value);
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

/** Integer query parameter, or undefined for empty/missing values. */
export function optionalInt(value: unknown, name: string): number | undefined {
  const raw = optionalString(value);
  if (raw === undefined) return undefined;
  if (!/^-?\d+$/.test(raw)) throw badRequest(`Query parameter "${name}" must be an integer.`);
  return Number.parseInt(raw, 10);
}

/** Query parameter restricted to a fixed set of values. */
export function optionalEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  name: string,
): T | undefined {
  const raw = optionalString(value);
  if (raw === undefined) return undefined;
  if (!(allowed as readonly string[]).includes(raw)) {
    throw badRequest(`Query parameter "${name}" must be one of: ${allowed.join(', ')}.`);
  }
  return raw as T;
}

export interface Paging {
  page: number;
  pageSize: number;
  offset: number;
}

export function pagingParams(
  query: Record<string, unknown>,
  defaultPageSize = 50,
  maxPageSize = 200,
): Paging {
  const page = optionalInt(query.page, 'page') ?? 1;
  const pageSize = optionalInt(query.pageSize, 'pageSize') ?? defaultPageSize;
  if (page < 1) throw badRequest('Query parameter "page" must be >= 1.');
  if (pageSize < 1 || pageSize > maxPageSize) {
    throw badRequest(`Query parameter "pageSize" must be between 1 and ${maxPageSize}.`);
  }
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** Parse a request body with zod; invalid input becomes a structured 400. */
export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue.path.join('.');
    throw badRequest(path ? `${path}: ${issue.message}` : issue.message);
  }
  return result.data;
}
