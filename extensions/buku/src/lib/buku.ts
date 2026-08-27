import { getPreferenceValues } from "@vicinae/api";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { joinTags, parseTagListing, splitTags } from "./tags";

const exec = promisify(execFile);

const OUTPUT_LIMIT = 32 * 1024 * 1024;
const READ_TIMEOUT = 10_000;
const WRITE_TIMEOUT = 30_000;

/**
 * Directories buku is commonly installed into that are missing from the PATH Vicinae
 * hands to extensions — a `pip --user` or `pipx` install lands in ~/.local/bin, which a
 * desktop session's PATH usually does not carry.
 */
const EXTRA_PATH_ENTRIES = ["~/.local/bin", "/usr/local/bin", "/opt/homebrew/bin"];

export const BUKU_MISSING_HINT =
  "Install buku, or point the extension at it with the Additional PATH Entries preference.";

/** True when the failure is buku being absent rather than buku reporting a problem. */
export function isBukuMissing(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "ENOENT";
}

/**
 * True when we killed buku for taking too long. On `-a` this almost always means it is
 * still waiting on the network for a page title, which it does without a timeout of its
 * own — an unreachable host hangs until we cut it off.
 */
export function isBukuTimeout(error: unknown): boolean {
  return (error as { killed?: boolean } | null)?.killed === true;
}

function expandHome(dir: string): string {
  return dir.startsWith("~/") ? join(homedir(), dir.slice(2)) : dir;
}

function searchPath(): string {
  const { additionalPath } = getPreferenceValues<{
    additionalPath?: string;
  }>() ?? { additionalPath: "" };

  const entries = [...(additionalPath ?? "").split(":"), ...EXTRA_PATH_ENTRIES, ...(process.env.PATH ?? "").split(":")]
    .map((dir) => expandHome(dir.trim()))
    .filter(Boolean);

  return [...new Set(entries)].join(":");
}

/** A bookmark as returned by `buku -j`. */
export type Bookmark = {
  description: string;
  index: number;
  tags: string;
  title: string;
  uri: string;
};

/** The editable part of a bookmark, as produced by the bookmark form. */
export type BookmarkDraft = {
  url: string;
  title: string;
  tags: string[];
  description: string;
};

/**
 * Runs buku and returns its stdout. `--nostdin --np` keep it from ever blocking on
 * input, which it would otherwise happily do from inside the extension host.
 */
async function runBuku(args: string[], timeout: number): Promise<string> {
  const { stdout } = await exec("buku", ["--nostdin", "--np", ...args], {
    maxBuffer: OUTPUT_LIMIT,
    timeout,
    env: { ...process.env, PATH: searchPath() },
  });

  return stdout;
}

export async function listBookmarks(): Promise<Bookmark[]> {
  const stdout = await runBuku(["--nc", "-p", "-j"], READ_TIMEOUT);
  // buku prefixes its output with notices such as the one it prints the first time
  // it creates the database, so the JSON array has to be picked out of the stream.
  const start = stdout.indexOf("[");

  return start === -1 ? [] : (JSON.parse(stdout.slice(start)) as Bookmark[]);
}

export async function listTags(): Promise<string[]> {
  return parseTagListing(await runBuku(["-t"], READ_TIMEOUT));
}

/** Tags of a bookmark as a normalized list — `buku -j` returns them comma separated. */
export function bookmarkTags(bookmark: Bookmark): string[] {
  return splitTags(bookmark.tags);
}

/** A blank `draft.title` leaves `--title` off, which is buku's cue to fetch one. */
export async function addBookmark(draft: BookmarkDraft): Promise<void> {
  const args = ["-a", draft.url];

  // buku takes the whole tag list as a single positional argument after the URL.
  if (draft.tags.length > 0) args.push(joinTags(draft.tags));

  if (draft.title) args.push("--title", draft.title);
  if (draft.description) args.push("-c", draft.description);

  await runBuku([...args, "--tacit"], WRITE_TIMEOUT);
}

export async function updateBookmark(bookmark: Bookmark, draft: BookmarkDraft): Promise<void> {
  await runBuku(
    [
      "-u",
      String(bookmark.index),
      "--url",
      draft.url,
      "--title",
      draft.title,
      "-c",
      draft.description,
      // --tag has to stay last: it takes a variable number of arguments and only
      // stops at the next flag.
      ...tagUpdateArgs(bookmark, draft.tags),
      "--tacit",
    ],
    WRITE_TIMEOUT,
  );
}

/**
 * buku silently ignores `--tag ""`, so wiping every tag has to be spelled out as an
 * explicit removal of the current ones: `--tag - "old,tags"`. The leading `-` must be
 * an argument of its own and the tags a single comma separated one, otherwise buku
 * reads them as literal tag names.
 */
function tagUpdateArgs(bookmark: Bookmark, tags: string[]): string[] {
  if (tags.length > 0) return ["--tag", joinTags(tags)];

  const current = bookmarkTags(bookmark);

  return current.length > 0 ? ["--tag", "-", current.join(",")] : [];
}

export async function deleteBookmark(bookmark: Bookmark): Promise<void> {
  await runBuku(["-d", String(bookmark.index), "--tacit"], WRITE_TIMEOUT);
}
