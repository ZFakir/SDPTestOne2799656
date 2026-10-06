import { spawn } from 'node:child_process';

export interface GitResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface GitRunOptions {
  cwd?: string;
  timeoutMs?: number;
  /** Text written to the child's stdin (terminated with EOF). */
  stdin?: string;
  /**
   * When provided, complete stdout lines are delivered here as they arrive and
   * the stdout buffer is not retained (except a small tail for error messages).
   */
  onStdoutLine?: (line: string) => void;
  /** Same as onStdoutLine but for stderr (e.g. `git clone --progress`). */
  onStderrLine?: (line: string) => void;
}

/** Bytes of stdout/stderr retained when streaming callbacks are used. */
const STREAM_TAIL_LIMIT = 8 * 1024;

/**
 * Environment that keeps git non-interactive and deterministic:
 * - GIT_TERMINAL_PROMPT=0 fails fast instead of hanging on credential prompts;
 * - LC_ALL=C keeps progress/error output parseable.
 */
function gitEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_ASKPASS: 'echo',
    GCM_INTERACTIVE: 'never',
    LC_ALL: 'C',
  };
}

/**
 * Base arguments for every repository-scoped git invocation.
 * `safe.directory` is passed per-command because command-line config counts as
 * trusted, which makes the tool work on storage owned by other users too.
 */
export function baseGitArgs(gitDir: string): string[] {
  return ['-C', gitDir, '-c', `safe.directory=${gitDir}`, '-c', 'core.quotePath=false'];
}

/**
 * Spawn git with an argument array (never a shell). Resolves with the exit
 * code even for non-zero exits so callers can produce actionable messages;
 * rejects only when git cannot be spawned at all.
 */
export function runGit(args: string[], options: GitRunOptions = {}): Promise<GitResult> {
  const { cwd, timeoutMs, stdin, onStdoutLine, onStderrLine } = options;

  return new Promise<GitResult>((resolve, reject) => {
    let child;
    try {
      child = spawn('git', args, { cwd, env: gitEnv() });
    } catch (err) {
      reject(err);
      return;
    }

    let stdout = '';
    let stderr = '';
    let stdoutPartial = '';
    let stderrPartial = '';
    let timedOut = false;

    const timer =
      timeoutMs !== undefined
        ? setTimeout(() => {
            timedOut = true;
            child.kill('SIGKILL');
          }, timeoutMs)
        : undefined;

    const emitLines = (
      chunk: string,
      partialRef: { value: string },
      callback: ((line: string) => void) | undefined,
    ): void => {
      partialRef.value += chunk;
      if (!callback) return;
      let idx = partialRef.value.indexOf('\n');
      while (idx !== -1) {
        const line = partialRef.value.slice(0, idx).replace(/\r$/, '');
        partialRef.value = partialRef.value.slice(idx + 1);
        callback(line);
        idx = partialRef.value.indexOf('\n');
      }
    };

    const stdoutPartialRef = { value: stdoutPartial };
    const stderrPartialRef = { value: stderrPartial };

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (chunk: string) => {
      emitLines(chunk, stdoutPartialRef, onStdoutLine);
      if (onStdoutLine) {
        stdout = (stdout + chunk).slice(-STREAM_TAIL_LIMIT);
      } else {
        stdout += chunk;
      }
    });

    child.stderr.on('data', (chunk: string) => {
      emitLines(chunk, stderrPartialRef, onStderrLine);
      if (onStderrLine) {
        stderr = (stderr + chunk).slice(-STREAM_TAIL_LIMIT);
      } else {
        stderr += chunk;
      }
    });

    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      // Flush trailing partial lines.
      if (onStdoutLine && stdoutPartialRef.value) onStdoutLine(stdoutPartialRef.value.replace(/\r$/, ''));
      if (onStderrLine && stderrPartialRef.value) onStderrLine(stderrPartialRef.value.replace(/\r$/, ''));

      if (timedOut) {
        resolve({
          code: -1,
          stdout,
          stderr: `${stderr}\n[rat] git command timed out after ${timeoutMs} ms`.trim(),
        });
        return;
      }
      resolve({ code: code ?? -1, stdout, stderr });
    });

    if (stdin !== undefined) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
  });
}
