import {
  LOG_FORMAT,
  LogStreamParser,
  parseNumstatPath,
  parseNumstatRow,
  unquoteCPath,
  type ParsedCommit,
} from '../src/git/logParser';

const RECORD_START = '\x1e';
const FIELD_SEP = '\x1f';

function recordLine(sha: string, parents: string, ts: number, name: string, email: string): string {
  return RECORD_START + [sha, parents, String(ts), name, email].join(FIELD_SEP);
}

describe('unquoteCPath', () => {
  it('decodes octal-escaped UTF-8 paths', () => {
    // git -z-less output C-quotes non-ASCII: "src/étude.c"
    expect(unquoteCPath('"src/\\303\\251tude.c"')).toBe('src/étude.c');
  });

  it('decodes control-character escapes', () => {
    expect(unquoteCPath('"a\\tb\\nc"')).toBe('a\tb\nc');
  });

  it('returns non-quoted input unchanged', () => {
    expect(unquoteCPath('src/main.c')).toBe('src/main.c');
  });
});

describe('parseNumstatPath', () => {
  it('keeps plain paths', () => {
    expect(parseNumstatPath('src/main.c')).toBe('src/main.c');
  });

  it('takes the new path of a plain rename', () => {
    expect(parseNumstatPath('old/util.c => new/util.c')).toBe('new/util.c');
  });

  it('expands the brace form of a rename', () => {
    expect(parseNumstatPath('src/{util.c => core/util.c}')).toBe('src/core/util.c');
  });

  it('expands a brace rename with an unchanged suffix', () => {
    expect(parseNumstatPath('docs/{api => rest}/ref.md')).toBe('docs/rest/ref.md');
  });

  it('unquotes C-quoted paths', () => {
    expect(parseNumstatPath('"src/\\303\\251tude.c"')).toBe('src/étude.c');
  });

  it('does not split on an arrow inside quotes', () => {
    expect(parseNumstatPath('"a => b.c"')).toBe('a => b.c');
  });
});

describe('parseNumstatRow', () => {
  it('parses a regular row', () => {
    expect(parseNumstatRow('8\t0\tsrc/main.c')).toEqual({
      path: 'src/main.c',
      added: 8,
      removed: 0,
    });
  });

  it('parses a pure deletion', () => {
    expect(parseNumstatRow('0\t4\tdocs/readme.md')).toEqual({
      path: 'docs/readme.md',
      added: 0,
      removed: 4,
    });
  });

  it('attributes renames to the new path', () => {
    expect(parseNumstatRow('0\t0\told.c => new.c')).toEqual({
      path: 'new.c',
      added: 0,
      removed: 0,
    });
  });

  it('skips binary rows', () => {
    expect(parseNumstatRow('-\t-\tassets/logo.png')).toBeNull();
  });

  it('skips malformed rows', () => {
    expect(parseNumstatRow('not a numstat row')).toBeNull();
    expect(parseNumstatRow('1\tx\tsrc/main.c')).toBeNull();
    expect(parseNumstatRow('1\t2\t')).toBeNull();
  });
});

describe('LogStreamParser', () => {
  function collect(lines: string[]): ParsedCommit[] {
    const commits: ParsedCommit[] = [];
    const parser = new LogStreamParser({ onCommit: (commit) => commits.push(commit) });
    for (const line of lines) parser.pushLine(line);
    parser.end();
    return commits;
  }

  it('parses a full stream: multiple commits, binary skips, empty diffs', () => {
    const commits = collect([
      recordLine('a'.repeat(40), '', 1672574400, 'Alice', 'alice@example.com'),
      '8\t0\tsrc/main.c',
      '-\t-\tassets/logo.png',
      recordLine('b'.repeat(40), 'a'.repeat(40), 1672660800, 'Bob', 'bob@example.com'),
      // no numstat rows: empty commit
      recordLine('c'.repeat(40), 'b'.repeat(40), 1672747200, 'Bob', 'bob@example.com'),
      '0\t4\tdocs/readme.md',
      '2\t1\tREADME.md',
    ]);

    expect(commits).toHaveLength(3);

    expect(commits[0].sha).toBe('a'.repeat(40));
    expect(commits[0].parents).toEqual([]);
    expect(commits[0].ts).toBe(1672574400);
    expect(commits[0].authorName).toBe('Alice');
    expect(commits[0].authorEmail).toBe('alice@example.com');
    expect(commits[0].files).toEqual([{ path: 'src/main.c', added: 8, removed: 0 }]);

    expect(commits[1].parents).toEqual(['a'.repeat(40)]);
    expect(commits[1].files).toEqual([]);

    expect(commits[2].parents).toEqual(['b'.repeat(40)]);
    expect(commits[2].files).toEqual([
      { path: 'docs/readme.md', added: 0, removed: 4 },
      { path: 'README.md', added: 2, removed: 1 },
    ]);
  });

  it('parses merge parents and ignores lines before the first record', () => {
    const mergeLine = recordLine(
      'd'.repeat(40),
      `${'a'.repeat(40)} ${'b'.repeat(40)}`,
      1672833600,
      'Alice',
      'alice@example.com',
    );
    const commits = collect(['garbage line without a record', mergeLine, '1\t1\tsrc/x.c']);
    expect(commits).toHaveLength(1);
    expect(commits[0].parents).toEqual(['a'.repeat(40), 'b'.repeat(40)]);
    expect(commits[0].files).toEqual([{ path: 'src/x.c', added: 1, removed: 1 }]);
  });

  it('exposes the log format used by the git runner', () => {
    expect(LOG_FORMAT).toBe('%x1e%H%x1f%P%x1f%ct%x1f%an%x1f%ae');
  });
});
