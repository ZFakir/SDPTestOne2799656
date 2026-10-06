/**
 * Streaming parser for `git log --numstat` output produced with:
 *
 *   --format='%x1e%H%x1f%P%x1f%ct%x1f%an%x1f%ae'
 *
 * Record structure:
 *   - a line starting with 0x1E begins a new commit record; its fields are
 *     separated by 0x1F (sha, parents, committer ts, author name, author email);
 *   - following lines (until the next 0x1E line) are numstat rows:
 *     `added\tremoved\tpath`.
 *
 * Rules implemented here:
 *   - Binary changes (`-\t-\t...`) are skipped — the brief excludes binary files;
 *   - Renames are attributed to the NEW path (plain `old => new`, brace form
 *     `dir/{old => new}.c`, with optional C-quoting);
 *   - C-quoted paths are unescaped (control characters are always quoted by git,
 *     even with core.quotePath=false);
 *   - Every non-merge commit produces a record, including empty diffs.
 */

export interface ParsedFileStat {
  path: string;
  added: number;
  removed: number;
}

export interface ParsedCommit {
  sha: string;
  parents: string[];
  /** Committer date, UNIX seconds. */
  ts: number;
  authorName: string;
  authorEmail: string;
  files: ParsedFileStat[];
}

export interface LogParserCallbacks {
  onCommit: (commit: ParsedCommit) => void;
}

export const LOG_FORMAT = '%x1e%H%x1f%P%x1f%ct%x1f%an%x1f%ae';

const RECORD_START = '\x1e';
const FIELD_SEP = '\x1f';

/** Decode a C-quoted string (`"...escaped..."`) into a JS string. */
export function unquoteCPath(quoted: string): string {
  if (quoted.length < 2 || !quoted.startsWith('"') || !quoted.endsWith('"')) return quoted;
  const inner = quoted.slice(1, -1);
  const bytes: number[] = [];
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch !== '\\') {
      // Non-escape characters are safe ASCII per git's quoting rules.
      bytes.push(ch.charCodeAt(0));
      continue;
    }
    i++;
    const esc = inner[i];
    if (esc === undefined) break;
    switch (esc) {
      case 'n': bytes.push(0x0a); break;
      case 't': bytes.push(0x09); break;
      case 'r': bytes.push(0x0d); break;
      case 'a': bytes.push(0x07); break;
      case 'b': bytes.push(0x08); break;
      case 'f': bytes.push(0x0c); break;
      case 'v': bytes.push(0x0b); break;
      case '"': bytes.push(0x22); break;
      case '\\': bytes.push(0x5c); break;
      default: {
        if (/[0-7]/.test(esc)) {
          // Octal escape: up to 3 digits, one byte.
          let oct = esc;
          while (oct.length < 3 && i + 1 < inner.length && /[0-7]/.test(inner[i + 1])) {
            i++;
            oct += inner[i];
          }
          bytes.push(Number.parseInt(oct, 8) & 0xff);
        } else {
          bytes.push(esc.charCodeAt(0));
        }
      }
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

function unquotePart(part: string): string {
  return part.startsWith('"') && part.endsWith('"') ? unquoteCPath(part) : part;
}

/**
 * Extract the effective (new) path from a numstat path field, handling rename
 * syntax and C-quoting.
 */
export function parseNumstatPath(rawField: string): string {
  let field = rawField;

  const hasArrow = field.includes(' => ');
  if (hasArrow) {
    const braceMatch = field.match(/^(.*)\{(.*) => (.*)\}(.*)$/s);
    if (braceMatch) {
      const [, prefix, , newPart, suffix] = braceMatch;
      field = prefix + unquotePart(newPart) + suffix;
    } else {
      // Find the first ' => ' that is not inside a quoted segment.
      let inQuotes = false;
      let arrowIdx = -1;
      for (let i = 0; i < field.length; i++) {
        const ch = field[i];
        if (ch === '\\' && inQuotes) {
          i++;
          continue;
        }
        if (ch === '"') {
          inQuotes = !inQuotes;
          continue;
        }
        if (!inQuotes && field.startsWith(' => ', i)) {
          arrowIdx = i;
          break;
        }
      }
      if (arrowIdx !== -1) field = field.slice(arrowIdx + 4);
    }
  }

  return unquotePart(field);
}

/**
 * Parse a single numstat row. Returns null for binary rows and malformed rows.
 */
export function parseNumstatRow(line: string): ParsedFileStat | null {
  const firstTab = line.indexOf('\t');
  if (firstTab === -1) return null;
  const secondTab = line.indexOf('\t', firstTab + 1);
  if (secondTab === -1) return null;

  const addedRaw = line.slice(0, firstTab);
  const removedRaw = line.slice(firstTab + 1, secondTab);
  const pathField = line.slice(secondTab + 1);

  // Binary file — not measured per the brief.
  if (addedRaw === '-' && removedRaw === '-') return null;

  const added = Number.parseInt(addedRaw, 10);
  const removed = Number.parseInt(removedRaw, 10);
  if (!Number.isFinite(added) || !Number.isFinite(removed)) return null;

  const path = parseNumstatPath(pathField);
  if (path === '') return null;

  return { path, added, removed };
}

function parseCommitRecordLine(line: string): Omit<ParsedCommit, 'files'> | null {
  const fields = line.slice(1).split(FIELD_SEP);
  if (fields.length < 5) return null;
  const [sha, parentsRaw, tsRaw, authorName, authorEmail] = fields;
  const ts = Number.parseInt(tsRaw, 10);
  if (!sha || !Number.isFinite(ts)) return null;
  const parents = parentsRaw.split(' ').filter((p) => p.length > 0);
  return { sha, parents, ts, authorName, authorEmail };
}

/**
 * Incremental line-based parser. Feed it complete lines (without trailing \n)
 * via `pushLine`, then call `end()` to flush the final commit.
 */
export class LogStreamParser {
  private current: ParsedCommit | null = null;
  private readonly onCommit: (commit: ParsedCommit) => void;

  constructor(callbacks: LogParserCallbacks) {
    this.onCommit = callbacks.onCommit;
  }

  pushLine(line: string): void {
    if (line.startsWith(RECORD_START)) {
      this.flushCurrent();
      const meta = parseCommitRecordLine(line);
      this.current = meta ? { ...meta, files: [] } : null;
      return;
    }
    if (line.length === 0 || this.current === null) return;
    const row = parseNumstatRow(line);
    if (row) this.current.files.push(row);
  }

  end(): void {
    this.flushCurrent();
  }

  private flushCurrent(): void {
    if (this.current) {
      this.onCommit(this.current);
      this.current = null;
    }
  }
}
