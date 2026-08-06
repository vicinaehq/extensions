/**
 * Shell-out wrapper for the `wordlex` CLI binary.
 *
 * Spawns the installed `wordlex` binary with JSON output flags. This reuses
 * the exact same SQLite database and query logic from the desktop app — no
 * data duplication.
 *
 * Requires the WordLex desktop app to be installed (the `wordlex` binary
 * must be on $PATH).
 */

import { execFile, execFileSync, spawn } from "node:child_process";
import { promisify } from "node:util";
import { showToast, Toast } from "@vicinae/api";
import type { KeyModifier } from "@vicinae/api";
import type { WordDetail, SearchResult } from "./types";

const EXEC_TIMEOUT_MS = 3000;

const execFileAsync = promisify(execFile);

/** Platform-aware command modifier: 'cmd' (Command) on macOS, 'ctrl' (Control) on Linux/Windows */
const isMac = typeof process !== "undefined" && process.platform === "darwin";
export const cmdModifier: KeyModifier = isMac ? "cmd" : "ctrl";

/** Launch the WordLex desktop app with a word pre-loaded in the search bar. */
export function openInWordLex(word: string) {
  try {
    const child = spawn("wordlex", ["--search", word], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch {
    showToast({
      style: Toast.Style.Failure,
      title: "Could not open WordLex",
    });
  }
}

/**
 * Look up a word and return its full detail (all senses, synonyms, antonyms, relations).
 * Returns null if the word is not found.
 * Throws an Error if the binary is missing or the DB is unavailable.
 */
export function lookupWord(word: string): WordDetail | null {
  const sanitized = word.trim().toLowerCase();
  if (!sanitized) return null;

  try {
    const stdout = execFileSync("wordlex", ["--cli-json", sanitized], {
      timeout: EXEC_TIMEOUT_MS,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const trimmed = stdout.trim();
    if (trimmed === "null" || !trimmed) return null;

    return JSON.parse(trimmed) as WordDetail;
  } catch (err: unknown) {
    throw toWordLexError(err);
  }
}

/**
 * Look up a word and return its full detail without blocking the UI thread.
 * Returns null if the word is not found.
 * Rejects if the binary is missing or the DB is unavailable.
 */
export async function lookupWordAsync(
  word: string
): Promise<WordDetail | null> {
  const sanitized = word.trim().toLowerCase();
  if (!sanitized) return null;

  const trimmed = await runWordlexJson(["--cli-json", sanitized]);
  if (!trimmed || trimmed === "null") return null;

  return JSON.parse(trimmed) as WordDetail;
}

/**
 * Prefix search for the type-ahead list, without blocking the UI thread.
 * Returns an array of lightweight search results.
 */
export async function searchWordsAsync(
  prefix: string
): Promise<SearchResult[]> {
  const sanitized = prefix.trim().toLowerCase();
  if (!sanitized) return [];

  const trimmed = await runWordlexJson(["--search-json", sanitized]);
  if (!trimmed || trimmed === "[]") return [];

  return JSON.parse(trimmed) as SearchResult[];
}

/**
 * Fetch a random word's full detail from the database.
 * Returns null if no word is found (unlikely but possible on empty DB).
 */
export function randomWord(): WordDetail | null {
  try {
    const stdout = execFileSync("wordlex", ["--random-json"], {
      timeout: EXEC_TIMEOUT_MS,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const trimmed = stdout.trim();
    if (trimmed === "null" || !trimmed) return null;

    return JSON.parse(trimmed) as WordDetail;
  } catch (err: unknown) {
    throw toWordLexError(err);
  }
}

/** Run `wordlex <args>` asynchronously and return trimmed stdout. */
async function runWordlexJson(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("wordlex", args, {
      timeout: EXEC_TIMEOUT_MS,
      encoding: "utf-8",
    });
    return stdout.trim();
  } catch (err: unknown) {
    throw toWordLexError(err);
  }
}

/** Normalize child_process failures into actionable Error messages. */
function toWordLexError(err: unknown): Error {
  if (isExecError(err) && (err.status === 127 || err.code === "ENOENT")) {
    return new Error(
      "WordLex is not installed. Install it from https://github.com/vedesh-padal/wordlex/releases",
      { cause: err }
    );
  }
  if (isExecError(err) && err.stderr) {
    return new Error(String(err.stderr).trim(), { cause: err });
  }
  return err instanceof Error ? err : new Error(String(err));
}

/** Type guard for Node.js child_process exec errors */
function isExecError(
  err: unknown
): err is { status: number | null; code: string; stderr: string | Buffer } {
  return (
    typeof err === "object" &&
    err !== null &&
    ("status" in err || "code" in err)
  );
}
