/**
 * Shell-out wrapper for the `wordlex` CLI binary.
 *
 * Spawns the installed `wordlex` binary with JSON output flags synchronously.
 * This reuses the exact same SQLite database and query logic from the desktop
 * app — no data duplication.
 *
 * Requires the WordLex desktop app to be installed (the `wordlex` binary
 * must be on $PATH).
 */

import { execSync, spawn } from "node:child_process";
import { showToast, Toast } from "@vicinae/api";
import type { KeyModifier } from "@vicinae/api";
import type { WordDetail, SearchResult } from "./types";

const EXEC_TIMEOUT_MS = 3000;

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
    const stdout = execSync(`wordlex --cli-json "${sanitized}"`, {
      timeout: EXEC_TIMEOUT_MS,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const trimmed = stdout.trim();
    if (trimmed === "null" || !trimmed) return null;

    return JSON.parse(trimmed) as WordDetail;
  } catch (err: unknown) {
    if (isExecError(err) && err.status === 127) {
      throw new Error(
        "WordLex is not installed. Install it from https://github.com/vedesh-padal/wordlex/releases",
        { cause: err }
      );
    }
    if (isExecError(err) && err.stderr) {
      throw new Error(String(err.stderr).trim(), { cause: err });
    }
    throw err;
  }
}

/**
 * Prefix search for the type-ahead list.
 * Returns an array of lightweight search results.
 */
export function searchWords(prefix: string): SearchResult[] {
  const sanitized = prefix.trim().toLowerCase();
  if (!sanitized) return [];

  try {
    const stdout = execSync(`wordlex --search-json "${sanitized}"`, {
      timeout: EXEC_TIMEOUT_MS,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const trimmed = stdout.trim();
    if (!trimmed || trimmed === "[]") return [];

    return JSON.parse(trimmed) as SearchResult[];
  } catch (err: unknown) {
    if (isExecError(err) && err.status === 127) {
      throw new Error(
        "WordLex is not installed. Install it from https://github.com/vedesh-padal/wordlex/releases",
        { cause: err }
      );
    }
    if (isExecError(err) && err.stderr) {
      throw new Error(String(err.stderr).trim(), { cause: err });
    }
    throw err;
  }
}

/**
 * Fetch a random word's full detail from the database.
 * Returns null if no word is found (unlikely but possible on empty DB).
 */
export function randomWord(): WordDetail | null {
  try {
    const stdout = execSync(`wordlex --random-json`, {
      timeout: EXEC_TIMEOUT_MS,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const trimmed = stdout.trim();
    if (trimmed === "null" || !trimmed) return null;

    return JSON.parse(trimmed) as WordDetail;
  } catch (err: unknown) {
    if (isExecError(err) && err.status === 127) {
      throw new Error(
        "WordLex is not installed. Install it from https://github.com/vedesh-padal/wordlex/releases",
        { cause: err }
      );
    }
    if (isExecError(err) && err.stderr) {
      throw new Error(String(err.stderr).trim(), { cause: err });
    }
    throw err;
  }
}

/** Type guard for Node.js child_process exec errors */
function isExecError(
  err: unknown
): err is { status: number | null; stderr: string | Buffer } {
  return typeof err === "object" && err !== null && "status" in err;
}
