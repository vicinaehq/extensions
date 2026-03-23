import {
  List,
  ActionPanel,
  Action,
  Icon,
  showToast,
  Toast,
  environment,
  getPreferenceValues,
  LaunchType,
} from "@vicinae/api";
import { useState, useEffect, useRef } from "react";
import { spawn } from "child_process";
import fs from "fs";
import { createReadStream, createWriteStream } from "fs";
import { promisify } from "util";
import { exec } from "child_process";
import { once } from "events";
import { createHash } from "crypto";
import readline from "readline";
import path from "path";
import { pathToFileURL } from "url";

const execAsync = promisify(exec);

type Result = {
  path: string;
  isDirectory: boolean;
  size?: number;
  mtimeMs?: number;
  extension?: string;
};

type Preferences = {
  reindexAfterMinutes?: string;
  maxResults?: string;
  indexedPaths?: string;
  excludePatterns?: string;
  includeHiddenFiles?: boolean;
  watcherPaths?: string;
};

type IndexSource = {
  path: string;
  mtimeMs: number;
};

type LockData = {
  pid: number;
  startedAt: number;
};

type IndexEntry = {
  path: string;
  isDirectory: boolean;
  size: number;
  mtimeMs: number;
  extension: string;
};

type IndexMetadata = {
  entryCount: number;
  updatedAt: number;
};

type WatcherSnapshotData = {
  signature: string;
  updatedAt: number;
};

type ScoredResult = {
  path: string;
  score: number;
  entry: IndexEntry;
};

type CachedIndexEntry = IndexEntry & {
  pathLower: string;
  leafName: string;
  leafNameLower: string;
  normalizedPath: string;
  normalizedLeafName: string;
  normalizedTokens: string[];
};

type CachedIndexData = {
  entries: CachedIndexEntry[];
  prefixIndex: Map<string, number[]>;
};

type IndexStatus = "idle" | "building" | "refreshing";

type SelectedItemDetails = {
  path: string;
  createdAt: string;
  modifiedAt: string;
  size?: number;
};

const ACTIVE_INDEX_FILE = path.join(environment.supportPath, "fd_vicinae_index.txt");
const TEMP_INDEX_FILE = `${ACTIVE_INDEX_FILE}.tmp`;
const LOCK_FILE = path.join(environment.supportPath, "fd_vicinae_index.lock");
const INDEX_METADATA_FILE = path.join(environment.supportPath, "fd_vicinae_index_meta.json");
const WATCHER_SNAPSHOT_FILE = path.join(environment.supportPath, "fd_vicinae_watch_snapshot.json");
const LEGACY_SUPPORT_INDEX_FILE = path.join(environment.supportPath, "fd_vicinae_index.txt.zst");
const LEGACY_SUPPORT_TEMP_FILE = `${LEGACY_SUPPORT_INDEX_FILE}.tmp`;
const LEGACY_SYSTEM_INDEX_FILE = "/tmp/fd_vicinae_index.txt";
const LEGACY_SYSTEM_TEMP_FILE = "/tmp/fd_vicinae_index.txt.tmp";

const DEFAULT_INDEXED_PATHS = ["/home"];
const DEFAULT_EXCLUDE_PATTERNS = [".git", "node_modules", "dist", "build", ".cache", ".venv", "venv", "__pycache__"];
const DEFAULT_MAX_RESULTS = 25;
const MIN_MAX_RESULTS = 10;
const MAX_MAX_RESULTS = 100;
const DEFAULT_REINDEX_AFTER_MINUTES = 5;
const MIN_REINDEX_AFTER_MINUTES = 0.5;
const MAX_REINDEX_AFTER_MINUTES = 20;
const INDEX_REFRESH_POLL_MS = 3000;
const CACHE_LOAD_YIELD_EVERY = 2000;
const SEARCH_CHUNK_SIZE = 1500;
const PARTIAL_RESULT_UPDATE_EVERY = 3000;

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function ensureSupportDirectory() {
  fs.mkdirSync(environment.supportPath, { recursive: true });
}

function safeUnlink(filePath: string) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
  }
}

function readIndexMetadata(): IndexMetadata | null {
  try {
    if (!fs.existsSync(INDEX_METADATA_FILE)) {
      return null;
    }

    const content = fs.readFileSync(INDEX_METADATA_FILE, "utf8");
    const parsed = JSON.parse(content) as Partial<IndexMetadata>;

    if (typeof parsed.entryCount !== "number" || typeof parsed.updatedAt !== "number") {
      return null;
    }

    return {
      entryCount: parsed.entryCount,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

function writeIndexMetadata(entryCount: number) {
  ensureSupportDirectory();
  fs.writeFileSync(
    INDEX_METADATA_FILE,
    JSON.stringify({
      entryCount,
      updatedAt: Date.now(),
    }),
    "utf8",
  );
}

function getReindexIntervalMs(rawValue?: string): number {
  const parsedValue = Number(rawValue);
  const minutes = Number.isFinite(parsedValue)
    ? Math.min(MAX_REINDEX_AFTER_MINUTES, Math.max(MIN_REINDEX_AFTER_MINUTES, parsedValue))
    : DEFAULT_REINDEX_AFTER_MINUTES;

  return minutes * 60 * 1000;
}

function getMaxResults(rawValue?: string): number {
  const parsedValue = Number(rawValue);
  if (!Number.isFinite(parsedValue)) {
    return DEFAULT_MAX_RESULTS;
  }

  return Math.min(MAX_MAX_RESULTS, Math.max(MIN_MAX_RESULTS, Math.trunc(parsedValue)));
}

function parseSemicolonSeparatedList(rawValue: string | undefined, defaults: string[] = []): string[] {
  const source = rawValue?.trim() ? rawValue : defaults.join(";");

  return Array.from(
    new Set(
      source
        .split(";")
        .map((value) => stripTrailingSeparators(value.trim()))
        .filter(Boolean),
    ),
  );
}

function getIndexedPaths(rawValue?: string): string[] {
  return parseSemicolonSeparatedList(rawValue, DEFAULT_INDEXED_PATHS);
}

function getExcludePatterns(rawValue?: string): string[] {
  return parseSemicolonSeparatedList(rawValue, DEFAULT_EXCLUDE_PATTERNS);
}

function getWatcherPaths(rawValue?: string): string[] {
  return parseSemicolonSeparatedList(rawValue);
}

function isRootPath(filePath: string): boolean {
  return stripTrailingSeparators(filePath) === path.sep;
}

function toDisplayList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "(none)";
}

function partitionExistingPaths(paths: string[]): { directories: string[]; files: string[] } {
  const directories: string[] = [];
  const files: string[] = [];

  for (const candidatePath of paths) {
    try {
      const stats = fs.statSync(candidatePath);
      if (stats.isDirectory()) {
        directories.push(candidatePath);
      } else {
        files.push(candidatePath);
      }
    } catch {
    }
  }

  return { directories, files };
}

function readWatcherSnapshot(): WatcherSnapshotData | null {
  try {
    if (!fs.existsSync(WATCHER_SNAPSHOT_FILE)) {
      return null;
    }

    const content = fs.readFileSync(WATCHER_SNAPSHOT_FILE, "utf8");
    const parsed = JSON.parse(content) as Partial<WatcherSnapshotData>;
    if (typeof parsed.signature !== "string" || typeof parsed.updatedAt !== "number") {
      return null;
    }

    return {
      signature: parsed.signature,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

function writeWatcherSnapshot(signature: string) {
  ensureSupportDirectory();
  fs.writeFileSync(
    WATCHER_SNAPSHOT_FILE,
    JSON.stringify({
      signature,
      updatedAt: Date.now(),
    }),
    "utf8",
  );
}

function getFileIcon(filePath: string, isDirectory: boolean): Icon {
  if (isDirectory) {
    return Icon.Folder;
  }

  const ext = path.extname(filePath).toLowerCase();

  if ([".js", ".jsx", ".ts", ".tsx", ".py", ".java", ".c", ".cpp", ".go", ".rs", ".rb", ".php"].includes(ext)) {
    return Icon.Code;
  }

  if ([".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".bmp", ".ico"].includes(ext)) {
    return Icon.Image;
  }

  if ([".pdf", ".doc", ".docx", ".txt", ".md", ".rtf"].includes(ext)) {
    return Icon.Document;
  }

  if ([".xls", ".xlsx", ".csv"].includes(ext)) {
    return Icon.Spreadsheet;
  }

  if ([".mp4", ".avi", ".mov", ".mkv", ".webm", ".flv"].includes(ext)) {
    return Icon.Video;
  }

  if ([".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a"].includes(ext)) {
    return Icon.Music;
  }

  if ([".zip", ".tar", ".gz", ".7z", ".rar", ".bz2"].includes(ext)) {
    return Icon.Box;
  }

  if ([".exe", ".sh", ".bat", ".app", ".bin"].includes(ext) || !ext) {
    return Icon.Terminal;
  }

  return Icon.Document;
}

function fuzzyMatch(pattern: string, text: string): { matches: boolean; score: number } {
  const patternLower = pattern.toLowerCase();
  const textLower = text.toLowerCase();

  if (textLower.includes(patternLower)) {
    return { matches: true, score: 100 };
  }

  let patternIdx = 0;
  let score = 0;
  let consecutiveMatches = 0;

  for (let i = 0; i < textLower.length && patternIdx < patternLower.length; i++) {
    if (textLower[i] === patternLower[patternIdx]) {
      score += 1 + consecutiveMatches;
      consecutiveMatches++;
      patternIdx++;
    } else {
      consecutiveMatches = 0;
    }
  }

  if (patternIdx === patternLower.length) {
    return { matches: true, score };
  }

  return { matches: false, score: 0 };
}

function normalizeForSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[/\\._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTrailingSeparators(filePath: string): string {
  if (filePath === path.sep) {
    return filePath;
  }

  return filePath.replace(/[\\/]+$/g, "");
}

function getSearchSegments(text: string): string[] {
  return stripTrailingSeparators(text)
    .toLowerCase()
    .split(/[/\\]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function getPathLeafName(filePath: string): string {
  const normalizedPath = stripTrailingSeparators(filePath);
  return path.basename(normalizedPath);
}

function getPathParent(filePath: string): string {
  const normalizedPath = stripTrailingSeparators(filePath);
  return path.dirname(normalizedPath);
}

function isPathWithinScope(candidatePath: string, scopePath: string): boolean {
  const normalizedCandidate = stripTrailingSeparators(candidatePath);
  const normalizedScope = stripTrailingSeparators(scopePath);

  return (
    normalizedCandidate === normalizedScope ||
    normalizedCandidate.startsWith(`${normalizedScope}${path.sep}`)
  );
}

function getPathDepth(filePath: string): number {
  return getSearchSegments(filePath).length;
}

function parseRelativeTimeToMs(value: string): number | null {
  const match = value.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks)$/);
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = match[2];

  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  if (unit.startsWith("m")) {
    return amount * 60 * 1000;
  }

  if (unit.startsWith("h")) {
    return amount * 60 * 60 * 1000;
  }

  if (unit.startsWith("d")) {
    return amount * 24 * 60 * 60 * 1000;
  }

  return amount * 7 * 24 * 60 * 60 * 1000;
}

function parseSizeToBytes(value: string): number | null {
  const match = value.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)(b|kb|mb|gb|tb)?$/);
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = match[2] ?? "b";

  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  const unitMultipliers: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
    tb: 1024 * 1024 * 1024 * 1024,
  };

  return amount * unitMultipliers[unit];
}

function wildcardToRegExp(pattern: string): RegExp {
  const escapedPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");

  return new RegExp(escapedPattern, "i");
}

function createIndexEntry(filePath: string): IndexEntry | null {
  const normalizedPath = stripTrailingSeparators(filePath);

  try {
    const stats = fs.statSync(normalizedPath);
    return {
      path: normalizedPath,
      isDirectory: stats.isDirectory(),
      size: stats.size,
      mtimeMs: stats.mtimeMs,
      extension: stats.isDirectory() ? "" : path.extname(normalizedPath).toLowerCase(),
    };
  } catch {
    return null;
  }
}

function parseIndexedLine(line: string): IndexEntry | null {
  if (!line.trim()) {
    return null;
  }

  const parts = line.split("\t");
  if (parts.length >= 5) {
    const indexedPath = stripTrailingSeparators(parts[0]);
    const isDirectory = parts[1] === "1";
    const size = Number(parts[2]);
    const mtimeMs = Number(parts[3]);
    const extension = parts.slice(4).join("\t");

    if (indexedPath && Number.isFinite(size) && Number.isFinite(mtimeMs)) {
      return {
        path: indexedPath,
        isDirectory,
        size,
        mtimeMs,
        extension,
      };
    }
  }

  return createIndexEntry(line);
}

function buildIndexLine(entry: IndexEntry): string {
  return `${entry.path}\t${entry.isDirectory ? "1" : "0"}\t${entry.size}\t${Math.trunc(entry.mtimeMs)}\t${entry.extension}\n`;
}

function createCachedIndexEntry(entry: IndexEntry): CachedIndexEntry {
  const leafName = getPathLeafName(entry.path);
  const normalizedPath = normalizeForSearch(entry.path);

  return {
    ...entry,
    pathLower: entry.path.toLowerCase(),
    leafName,
    leafNameLower: leafName.toLowerCase(),
    normalizedPath,
    normalizedLeafName: normalizeForSearch(leafName),
    normalizedTokens: normalizedPath.split(" ").filter(Boolean),
  };
}

function getCandidateEntries(
  cachedIndexData: CachedIndexData,
  pathScope: string | null,
  searchText: string,
): CachedIndexEntry[] {
  if (!searchText) {
    return cachedIndexData.entries;
  }

  const normalizedTokens = normalizeForSearch(searchText).split(" ").filter(Boolean);
  if (normalizedTokens.length === 0) {
    return cachedIndexData.entries;
  }

  const anchorToken = normalizedTokens.reduce((longest, current) => (current.length > longest.length ? current : longest));
  const prefixKey = anchorToken.slice(0, Math.min(3, anchorToken.length));

  if (!prefixKey) {
    return cachedIndexData.entries;
  }

  const candidateIndexes = cachedIndexData.prefixIndex.get(prefixKey);
  if (!candidateIndexes || candidateIndexes.length === 0) {
    return cachedIndexData.entries;
  }

  if (candidateIndexes.length > cachedIndexData.entries.length * 0.6 && !pathScope) {
    return cachedIndexData.entries;
  }

  return candidateIndexes.map((index) => cachedIndexData.entries[index]);
}

function getEditDistanceWithinLimit(left: string, right: string, limit: number): number | null {
  if (Math.abs(left.length - right.length) > limit) {
    return null;
  }

  const previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    let currentRowValue = leftIndex;
    let minRowValue = currentRowValue;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      const nextValue = Math.min(
        previousRow[rightIndex] + 1,
        currentRowValue + 1,
        previousRow[rightIndex - 1] + substitutionCost,
      );

      previousRow[rightIndex - 1] = currentRowValue;
      currentRowValue = nextValue;
      minRowValue = Math.min(minRowValue, nextValue);
    }

    previousRow[right.length] = currentRowValue;

    if (minRowValue > limit) {
      return null;
    }
  }

  const distance = previousRow[right.length];
  return distance <= limit ? distance : null;
}

type ParsedSearchQuery = {
  pathScope: string | null;
  searchText: string;
  excludeTerms: string[];
  typeFilter: string | null;
  wildcardPattern: RegExp | null;
  sinceMs: number | null;
  minSizeBytes: number | null;
  maxSizeBytes: number | null;
};

function parseSearchQuery(rawQuery: string): ParsedSearchQuery {
  let workingQuery = rawQuery.trim();
  let pathScope: string | null = null;

  if (workingQuery.startsWith("/")) {
    const firstSpace = workingQuery.indexOf(" ");
    if (firstSpace === -1) {
      pathScope = stripTrailingSeparators(workingQuery);
      workingQuery = "";
    } else {
      pathScope = stripTrailingSeparators(workingQuery.slice(0, firstSpace));
      workingQuery = workingQuery.slice(firstSpace + 1).trim();
    }
  }

  const tokens = workingQuery.split(/\s+/).filter(Boolean);
  const excludeTerms: string[] = [];
  let sinceMs: number | null = null;
  let minSizeBytes: number | null = null;
  let maxSizeBytes: number | null = null;
  let typeFilter: string | null = null;
  const searchTokens: string[] = [];

  for (const token of tokens) {
    if (token.startsWith("-") && token.length > 1) {
      excludeTerms.push(normalizeForSearch(token.slice(1)));
      continue;
    }

    const sinceMatch = token.match(/^since:(.+)$/i);
    if (sinceMatch) {
      sinceMs = parseRelativeTimeToMs(sinceMatch[1]);
      continue;
    }

    const typeMatch = token.match(/^type:(.+)$/i);
    if (typeMatch) {
      typeFilter = typeMatch[1].trim().toLowerCase();
      continue;
    }

    const sizeMatch = token.match(/^size:(<=|>=|=|<|>)?(.+)$/i);
    if (sizeMatch) {
      const operator = sizeMatch[1] || "=";
      const parsedSize = parseSizeToBytes(sizeMatch[2]);

      if (parsedSize !== null) {
        if (operator === ">" || operator === ">=") {
          minSizeBytes = parsedSize;
        } else if (operator === "<" || operator === "<=") {
          maxSizeBytes = parsedSize;
        } else {
          minSizeBytes = parsedSize;
          maxSizeBytes = parsedSize;
        }
      }
      continue;
    }

    searchTokens.push(token);
  }

  const searchText = searchTokens.join(" ").trim();
  const commonExtensions = [
    "png",
    "jpg",
    "jpeg",
    "gif",
    "svg",
    "pdf",
    "doc",
    "docx",
    "txt",
    "md",
    "js",
    "ts",
    "py",
    "java",
    "cpp",
    "c",
    "go",
    "rs",
    "mp4",
    "avi",
    "mov",
    "mp3",
    "wav",
    "zip",
    "tar",
    "gz",
    "xlsx",
    "csv",
    "html",
    "css",
    "json",
  ];

  if (!typeFilter) {
    const queryLower = searchText.toLowerCase();
    typeFilter = commonExtensions.includes(queryLower) && !searchText.includes(" ") ? queryLower : null;
  }

  const wildcardPattern =
    searchText.includes("*") || searchText.includes("?") ? wildcardToRegExp(searchText) : null;

  return {
    pathScope,
    searchText,
    excludeTerms,
    typeFilter,
    wildcardPattern,
    sinceMs,
    minSizeBytes,
    maxSizeBytes,
  };
}

function getScopedResultScore(entry: IndexEntry, pathScope: string): number {
  const normalizedScope = stripTrailingSeparators(pathScope);

  if (entry.path === normalizedScope) {
    return 4000;
  }

  const depthDelta = Math.max(0, getPathDepth(entry.path) - getPathDepth(normalizedScope));
  return 3500 - depthDelta * 10;
}

function getCachedMatchScore(searchQuery: string, entry: CachedIndexEntry): number {
  const queryLower = searchQuery.toLowerCase();
  const normalizedQuery = normalizeForSearch(searchQuery);
  const queryTokens = normalizedQuery.split(" ").filter(Boolean);

  if (!normalizedQuery) {
    return 0;
  }

  let bestScore = 0;

  if (entry.leafNameLower === queryLower || entry.normalizedLeafName === normalizedQuery) {
    bestScore = Math.max(bestScore, 2000);
  } else if (entry.leafNameLower.startsWith(queryLower) || entry.normalizedLeafName.startsWith(normalizedQuery)) {
    bestScore = Math.max(bestScore, 1800);
  } else if (entry.leafNameLower.includes(queryLower) || entry.normalizedLeafName.includes(normalizedQuery)) {
    bestScore = Math.max(bestScore, 1600);
  } else if (entry.pathLower.includes(queryLower)) {
    bestScore = Math.max(bestScore, 1200);
  } else if (entry.normalizedPath.includes(normalizedQuery)) {
    bestScore = Math.max(bestScore, 1100);
  }

  if (queryTokens.length > 1) {
    const matchedTokens = queryTokens.filter((token) =>
      entry.normalizedTokens.some((candidateToken) => candidateToken.includes(token) || token.includes(candidateToken)),
    ).length;

    if (matchedTokens === queryTokens.length) {
      bestScore = Math.max(bestScore, 1750 + matchedTokens * 20);
    } else if (matchedTokens >= Math.max(1, queryTokens.length - 1)) {
      bestScore = Math.max(bestScore, 1300 + matchedTokens * 10);
    }
  }

  if (bestScore > 0) {
    return bestScore;
  }

  const filenameFuzzy = fuzzyMatch(queryLower, entry.leafNameLower);
  if (filenameFuzzy.matches) {
    return 700 + filenameFuzzy.score;
  }

  const pathFuzzy = fuzzyMatch(normalizedQuery, entry.normalizedPath);
  if (pathFuzzy.matches) {
    return 300 + pathFuzzy.score;
  }

  const typoLimit = normalizedQuery.length >= 7 ? 2 : 1;
  if (normalizedQuery.length >= 4) {
    for (const token of entry.normalizedTokens) {
      const distance = getEditDistanceWithinLimit(normalizedQuery, token, typoLimit);
      if (distance !== null) {
        return distance === 0 ? 1600 : 900 - distance * 100;
      }
    }
  }

  return 0;
}

function matchesRequestedType(entry: CachedIndexEntry, requestedType: string): boolean {
  const normalizedType = requestedType.replace(/^\./, "").toLowerCase();

  if (normalizedType === "folder" || normalizedType === "dir" || normalizedType === "directory") {
    return entry.isDirectory;
  }

  if (normalizedType === "file" || normalizedType === "files") {
    return !entry.isDirectory;
  }

  const typeGroups: Record<string, string[]> = {
    images: [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp", ".ico"],
    image: [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp", ".ico"],
    documents: [".pdf", ".doc", ".docx", ".txt", ".md", ".rtf"],
    document: [".pdf", ".doc", ".docx", ".txt", ".md", ".rtf"],
    code: [".js", ".jsx", ".ts", ".tsx", ".py", ".java", ".c", ".cpp", ".go", ".rs", ".rb", ".php", ".html", ".css"],
    videos: [".mp4", ".avi", ".mov", ".mkv", ".webm", ".flv"],
    video: [".mp4", ".avi", ".mov", ".mkv", ".webm", ".flv"],
    audio: [".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a"],
    archives: [".zip", ".tar", ".gz", ".7z", ".rar", ".bz2"],
    archive: [".zip", ".tar", ".gz", ".7z", ".rar", ".bz2"],
  };

  const group = typeGroups[normalizedType];
  if (group) {
    return group.includes(entry.extension);
  }

  return entry.extension === `.${normalizedType}`;
}

function formatTimestamp(timestampMs: number): string {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) {
    return "Unknown";
  }

  return new Date(timestampMs).toLocaleString();
}

function shouldRankBefore(candidate: ScoredResult, existing: ScoredResult): boolean {
  if (candidate.score !== existing.score) {
    return candidate.score > existing.score;
  }

  if (candidate.path.length !== existing.path.length) {
    return candidate.path.length < existing.path.length;
  }

  return candidate.path.localeCompare(existing.path) < 0;
}

function insertTopResult(results: ScoredResult[], candidate: ScoredResult, maxResults: number) {
  if (results.length === 0) {
    results.push(candidate);
    return;
  }

  let insertAt = -1;
  for (let i = 0; i < results.length; i++) {
    if (shouldRankBefore(candidate, results[i])) {
      insertAt = i;
      break;
    }
  }

  if (insertAt === -1) {
    if (results.length < maxResults) {
      results.push(candidate);
    }
    return;
  }

  results.splice(insertAt, 0, candidate);
  if (results.length > maxResults) {
    results.pop();
  }
}

function getIndexSource(): IndexSource | null {
  try {
    if (fs.existsSync(ACTIVE_INDEX_FILE)) {
      return {
        path: ACTIVE_INDEX_FILE,
        mtimeMs: fs.statSync(ACTIVE_INDEX_FILE).mtimeMs,
      };
    }
  } catch {
    return null;
  }

  return null;
}

function getIndexFingerprint(source: IndexSource): string {
  return `${source.path}:${source.mtimeMs}`;
}

function readLockData(): LockData | null {
  try {
    if (!fs.existsSync(LOCK_FILE)) {
      return null;
    }

    const content = fs.readFileSync(LOCK_FILE, "utf8");
    const parsed = JSON.parse(content) as Partial<LockData>;
    if (typeof parsed.pid !== "number" || typeof parsed.startedAt !== "number") {
      return null;
    }

    return {
      pid: parsed.pid,
      startedAt: parsed.startedAt,
    };
  } catch {
    return null;
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function removeStaleLockIfNeeded() {
  if (!fs.existsSync(LOCK_FILE)) {
    return;
  }

  const lockData = readLockData();
  if (!lockData || !isProcessRunning(lockData.pid)) {
    safeUnlink(LOCK_FILE);
  }
}

function isExternalIndexBuildActive(ownsLock: boolean): boolean {
  if (ownsLock) {
    return false;
  }

  removeStaleLockIfNeeded();
  const lockData = readLockData();
  return Boolean(lockData && lockData.pid !== process.pid && isProcessRunning(lockData.pid));
}

function acquireIndexLock(): boolean {
  ensureSupportDirectory();
  removeStaleLockIfNeeded();

  try {
    const fd = fs.openSync(LOCK_FILE, "wx");
    fs.writeFileSync(
      fd,
      JSON.stringify({
        pid: process.pid,
        startedAt: Date.now(),
      }),
      "utf8",
    );
    fs.closeSync(fd);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return false;
    }
    throw error;
  }
}

function cleanupLegacyArtifacts() {
  safeUnlink(LEGACY_SYSTEM_INDEX_FILE);
  safeUnlink(LEGACY_SYSTEM_TEMP_FILE);
}

function cleanupSupportArtifacts(ownsLock: boolean) {
  ensureSupportDirectory();
  cleanupLegacyArtifacts();
  removeStaleLockIfNeeded();

  if (!ownsLock && !isExternalIndexBuildActive(false)) {
    safeUnlink(TEMP_INDEX_FILE);
    safeUnlink(LEGACY_SUPPORT_TEMP_FILE);
  }

  if (fs.existsSync(ACTIVE_INDEX_FILE)) {
    safeUnlink(LEGACY_SUPPORT_INDEX_FILE);
  }
}

async function openTerminal(dirPath: string) {
  try {
    const userShell = process.env.SHELL || "bash";

    const terminals = ["kitty", "konsole", "gnome-terminal", "xfce4-terminal", "alacritty", "xterm"];

    let opened = false;

    for (const term of terminals) {
      try {
        await execAsync(`command -v ${term}`);
        await execAsync(`${term} -e ${userShell} -c "cd '${dirPath}'; clear; exec ${userShell}"`);
        opened = true;
        break;
      } catch {
        continue;
      }
    }

    if (!opened) {
      throw new Error(
        "No compatible terminal found. Install kitty, konsole, gnome-terminal, alacritty, or xterm.",
      );
    }

    showToast({
      style: Toast.Style.Success,
      title: "Terminal opened",
    });
  } catch (e) {
    showToast({
      style: Toast.Style.Failure,
      title: "Failed to open terminal",
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

export default function Command() {
  const preferences = getPreferenceValues<Preferences>();
  const reindexIntervalMs = getReindexIntervalMs(preferences.reindexAfterMinutes);
  const maxResults = getMaxResults(preferences.maxResults);
  const indexedPaths = getIndexedPaths(preferences.indexedPaths);
  const excludePatterns = getExcludePatterns(preferences.excludePatterns);
  const includeHiddenFiles = Boolean(preferences.includeHiddenFiles);
  const watcherPaths = getWatcherPaths(preferences.watcherPaths);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [indexStatus, setIndexStatus] = useState<IndexStatus>("idle");
  const [filterType, setFilterType] = useState<string>("all");
  const [hasIndex, setHasIndex] = useState(false);
  const [indexedCount, setIndexedCount] = useState<number | null>(null);
  const [selectedItemPath, setSelectedItemPath] = useState<string>("");
  const [selectedItemDetails, setSelectedItemDetails] = useState<SelectedItemDetails | null>(null);

  const currentSearchAbort = useRef<AbortController | null>(null);
  const indexingProcess = useRef<ReturnType<typeof spawn> | null>(null);
  const hasInitialized = useRef(false);
  const hasLock = useRef(false);
  const latestQueryRef = useRef("");
  const latestFilterTypeRef = useRef("all");
  const indexFingerprintRef = useRef<string | null>(null);
  const searchGenerationRef = useRef(0);
  const cachedIndexRef = useRef<CachedIndexData | null>(null);
  const cachedIndexFingerprintRef = useRef<string | null>(null);
  const cachedIndexPromiseRef = useRef<Promise<CachedIndexData> | null>(null);

  latestQueryRef.current = query;
  latestFilterTypeRef.current = filterType;

  function releaseOwnedLock() {
    if (!hasLock.current) {
      return;
    }

    safeUnlink(LOCK_FILE);
    hasLock.current = false;
  }

  function invalidateCachedIndex() {
    cachedIndexRef.current = null;
    cachedIndexFingerprintRef.current = null;
    cachedIndexPromiseRef.current = null;
  }

  async function getFdCommand(): Promise<string | null> {
    try {
      await execAsync("which fd");
      return "fd";
    } catch {
      try {
        await execAsync("which fdfind");
        return "fdfind";
      } catch {
        showToast({
          style: Toast.Style.Failure,
          title: "fd not found",
          message: "Install fd-find: sudo apt install fd-find",
        });
        return null;
      }
    }
  }

  function getIndexBuildArgs(targetPaths: string[]) {
    const args = ["--absolute-path", "--no-follow", "--type", "f", "--type", "d"];

    if (includeHiddenFiles) {
      args.push("--hidden");
    } else {
      args.push("--no-hidden");
    }

    for (const pattern of excludePatterns) {
      args.push("--exclude", pattern);
    }

    args.push(".", ...targetPaths);
    return args;
  }

  async function maybeWarnAboutRiskySettings() {
    const warnings: string[] = [];

    if (includeHiddenFiles) {
      warnings.push("hidden-file indexing is enabled");
    }

    if (indexedPaths.some(isRootPath)) {
      warnings.push("indexing '/' can be extremely slow");
    }

    if (watcherPaths.some(isRootPath)) {
      warnings.push("watching '/' can be extremely expensive");
    }

    if (warnings.length === 0) {
      return;
    }

    showToast({
      style: Toast.Style.Animated,
      title: "Risky indexing settings enabled",
      message: warnings.join(" | "),
    });
  }

  async function computeWatcherSignature(fdCmd: string): Promise<string | null> {
    if (watcherPaths.length === 0) {
      return null;
    }

    const { directories: watcherDirectories, files: watcherFiles } = partitionExistingPaths(watcherPaths);
    if (watcherDirectories.length === 0 && watcherFiles.length === 0) {
      return "missing-watchers";
    }

    const hash = createHash("sha256");

    for (const filePath of watcherFiles) {
      const entry = createIndexEntry(filePath);
      if (entry) {
        hash.update(buildIndexLine(entry));
      }
    }

    if (watcherDirectories.length === 0) {
      return hash.digest("hex");
    }

    const child = spawn(fdCmd, getIndexBuildArgs(watcherDirectories));

    if (!child.stdout || !child.stderr) {
      throw new Error("Watcher scan streams are unavailable");
    }

    let stderrOutput = "";
    child.stderr.on("data", (chunk) => {
      stderrOutput += chunk.toString();
    });

    const rl = readline.createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    });

    const exitCodePromise = new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve(code));
    });

    for await (const line of rl) {
      const entry = createIndexEntry(line);
      if (!entry) {
        continue;
      }

      hash.update(buildIndexLine(entry));
    }

    const exitCode = await exitCodePromise;
    if (exitCode !== 0) {
      throw new Error(stderrOutput.trim() || `Watcher scan failed with code ${exitCode}`);
    }

    return hash.digest("hex");
  }

  async function loadCachedIndex(source: IndexSource): Promise<CachedIndexData> {
    const fingerprint = getIndexFingerprint(source);

    if (cachedIndexRef.current && cachedIndexFingerprintRef.current === fingerprint) {
      return cachedIndexRef.current;
    }

    if (cachedIndexPromiseRef.current && cachedIndexFingerprintRef.current === fingerprint) {
      return cachedIndexPromiseRef.current;
    }

    cachedIndexFingerprintRef.current = fingerprint;
    cachedIndexPromiseRef.current = (async () => {
      const cachedIndexData: CachedIndexData = {
        entries: [],
        prefixIndex: new Map<string, number[]>(),
      };
      cachedIndexRef.current = cachedIndexData;
      const fileStream = createReadStream(source.path, { encoding: "utf8" });
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      try {
        let processedCount = 0;

        for await (const line of rl) {
          const entry = parseIndexedLine(line);
          if (!entry) {
            continue;
          }

          const cachedEntry = createCachedIndexEntry(entry);
          const entryIndex = cachedIndexData.entries.length;
          cachedIndexData.entries.push(cachedEntry);

          const prefixKeys = new Set<string>();
          const tokens = cachedEntry.normalizedPath.split(" ").filter(Boolean);

          for (const token of tokens) {
            const maxPrefixLength = Math.min(3, token.length);
            for (let prefixLength = 1; prefixLength <= maxPrefixLength; prefixLength++) {
              prefixKeys.add(token.slice(0, prefixLength));
            }
          }

          for (const key of prefixKeys) {
            const existing = cachedIndexData.prefixIndex.get(key);
            if (existing) {
              existing.push(entryIndex);
            } else {
              cachedIndexData.prefixIndex.set(key, [entryIndex]);
            }
          }

          processedCount += 1;
          if (processedCount % CACHE_LOAD_YIELD_EVERY === 0) {
            await new Promise<void>((resolve) => setImmediate(resolve));
          }
        }
        cachedIndexPromiseRef.current = null;

        if (latestQueryRef.current.trim() || latestFilterTypeRef.current !== "all") {
          setImmediate(() => {
            void runSearch(latestQueryRef.current);
          });
        }

        return cachedIndexData;
      } finally {
        cachedIndexPromiseRef.current = null;
        rl.close();
        if (!fileStream.destroyed) {
          fileStream.destroy();
        }
      }
    })();

    return cachedIndexPromiseRef.current;
  }

  async function runSearch(q: string) {
    const searchGeneration = ++searchGenerationRef.current;

    if (currentSearchAbort.current) {
      currentSearchAbort.current.abort();
    }

    currentSearchAbort.current = new AbortController();
    const abortSignal = currentSearchAbort.current.signal;

    const source = getIndexSource();
    if (!source) {
      if (searchGeneration === searchGenerationRef.current) {
        setResults([]);
        setLoading(false);
        setHasIndex(false);
        indexFingerprintRef.current = null;
      }
      return;
    }

    setHasIndex(true);
    indexFingerprintRef.current = getIndexFingerprint(source);
    setLoading(true);
    void loadCachedIndex(source);
    const {
      pathScope,
      searchText,
      excludeTerms,
      typeFilter,
      wildcardPattern,
      sinceMs,
      minSizeBytes,
      maxSizeBytes,
    } = parseSearchQuery(q);

    const filterExtensions: { [key: string]: string[] } = {
      images: [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp", ".ico"],
      documents: [".pdf", ".doc", ".docx", ".txt", ".md", ".rtf"],
      code: [".js", ".jsx", ".ts", ".tsx", ".py", ".java", ".c", ".cpp", ".go", ".rs", ".rb", ".php", ".html", ".css"],
      videos: [".mp4", ".avi", ".mov", ".mkv", ".webm", ".flv"],
      audio: [".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a"],
      archives: [".zip", ".tar", ".gz", ".7z", ".rar", ".bz2"],
    };

    const cachedIndexData = cachedIndexRef.current;
    if (!cachedIndexData) {
      setLoading(true);
      return;
    }

    if (searchGeneration !== searchGenerationRef.current || abortSignal.aborted) {
      return;
    }

    const candidateEntries = getCandidateEntries(cachedIndexData, pathScope, searchText);

    const topMatches: ScoredResult[] = [];

    const processEntry = (cachedEntry: CachedIndexEntry) => {

      if (pathScope && !isPathWithinScope(cachedEntry.path, pathScope)) {
        return;
      }

      if (excludeTerms.some((term) => cachedEntry.normalizedPath.includes(term))) {
        return;
      }

      if (sinceMs !== null && Date.now() - cachedEntry.mtimeMs > sinceMs) {
        return;
      }

      if (minSizeBytes !== null && cachedEntry.size < minSizeBytes) {
        return;
      }

      if (maxSizeBytes !== null && cachedEntry.size > maxSizeBytes) {
        return;
      }

      const ext = cachedEntry.extension;

      if (filterType !== "all" && filterExtensions[filterType]) {
        if (cachedEntry.isDirectory || !filterExtensions[filterType].includes(ext)) {
          return;
        }
      }

      if (typeFilter && !matchesRequestedType(cachedEntry, typeFilter)) {
        return;
      }

      let matches = false;
      let score = 0;

      if (!searchText) {
        matches = true;
        score = pathScope ? getScopedResultScore(cachedEntry, pathScope) : 50;
      } else if (wildcardPattern) {
        if (wildcardPattern.test(cachedEntry.path) || wildcardPattern.test(cachedEntry.leafName)) {
          matches = true;
          score = cachedEntry.path === searchText ? 2000 : getCachedMatchScore(searchText, cachedEntry);
        }
      } else {
        score = getCachedMatchScore(searchText, cachedEntry);
        if (score > 0) {
          matches = true;
        }
      }

      if (matches && pathScope && !searchText) {
        score = Math.max(score, getScopedResultScore(cachedEntry, pathScope));
      }

      if (matches) {
        insertTopResult(topMatches, {
          path: cachedEntry.path,
          score,
          entry: cachedEntry,
        }, maxResults);
      }
    };

    try {
      let processedCount = 0;

      for (const cachedEntry of candidateEntries) {
        if (abortSignal.aborted) {
          return;
        }

        processEntry(cachedEntry);
        processedCount += 1;

        if (processedCount % PARTIAL_RESULT_UPDATE_EVERY === 0) {
          if (searchGeneration === searchGenerationRef.current && !abortSignal.aborted) {
            setResults(
              topMatches.map((match) => ({
                path: match.entry.path,
                isDirectory: match.entry.isDirectory,
                size: match.entry.size,
                mtimeMs: match.entry.mtimeMs,
                extension: match.entry.extension,
              })),
            );
          }
        }

        if (processedCount % SEARCH_CHUNK_SIZE === 0) {
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
      }

      if (abortSignal.aborted) {
        return;
      }

      const finalResults = topMatches.map((match) => ({
        path: match.entry.path,
        isDirectory: match.entry.isDirectory,
        size: match.entry.size,
        mtimeMs: match.entry.mtimeMs,
        extension: match.entry.extension,
      }));

      if (searchGeneration !== searchGenerationRef.current || abortSignal.aborted) {
        return;
      }

      setResults(finalResults);
      setLoading(Boolean(cachedIndexPromiseRef.current));
    } catch (e) {
      if ((e as Error).name === "AbortError" || abortSignal.aborted || searchGeneration !== searchGenerationRef.current) {
        return;
      }

      showToast({
        style: Toast.Style.Failure,
        title: "Search failed",
        message: e instanceof Error ? e.message : String(e),
      });
      setLoading(false);
    }
  }

  async function syncIndexStateFromDisk() {
    cleanupSupportArtifacts(hasLock.current);

    const source = getIndexSource();
    const nextFingerprint = source ? getIndexFingerprint(source) : null;
    const fingerprintChanged = nextFingerprint !== indexFingerprintRef.current;

    setHasIndex(Boolean(source));
    setIndexedCount(source ? readIndexMetadata()?.entryCount ?? null : null);

    if (!indexingProcess.current) {
      if (isExternalIndexBuildActive(hasLock.current)) {
        setIndexStatus(source ? "refreshing" : "building");
      } else {
        setIndexStatus("idle");
      }
    }

    if (!fingerprintChanged) {
      return;
    }

    indexFingerprintRef.current = nextFingerprint;
    invalidateCachedIndex();

    if (!source) {
      setResults([]);
      return;
    }

    void loadCachedIndex(source);

    if (latestQueryRef.current.trim() || latestFilterTypeRef.current !== "all") {
      void runSearch(latestQueryRef.current);
    }
  }

  async function buildIndex(silent = false) {
    if (indexingProcess.current) {
      return;
    }

    ensureSupportDirectory();
    cleanupSupportArtifacts(hasLock.current);

    const activeSourceBeforeBuild = getIndexSource();
    const hasExistingIndex = Boolean(activeSourceBeforeBuild);
    setHasIndex(hasExistingIndex);

    if (!acquireIndexLock()) {
      setIndexStatus(hasExistingIndex ? "refreshing" : "building");

      if (!silent) {
        showToast({
          style: Toast.Style.Animated,
          title: "Index already rebuilding",
          message: hasExistingIndex
            ? "Using the current index until refresh completes"
            : "Another command instance is building the first index",
        });
      }
      return;
    }

    hasLock.current = true;

    const fdCmd = await getFdCommand();
    if (!fdCmd) {
      releaseOwnedLock();
      setIndexStatus("idle");
      return;
    }

    try {
      await execAsync(`${fdCmd} --version`);
    } catch {
      releaseOwnedLock();
      setIndexStatus("idle");
      showToast({
        style: Toast.Style.Failure,
        title: "fd command failed",
        message: "fd is installed but cannot execute",
      });
      return;
    }

    try {
      setIndexStatus(hasExistingIndex ? "refreshing" : "building");

      if (!silent) {
        showToast({
          style: Toast.Style.Animated,
          title: hasExistingIndex ? "Refreshing index..." : "Indexing filesystem...",
          message: hasExistingIndex ? "Current results remain available" : "This may take a minute",
        });
      }

      safeUnlink(TEMP_INDEX_FILE);
      safeUnlink(LEGACY_SUPPORT_TEMP_FILE);

      const { directories: existingSearchDirs, files: explicitFiles } = partitionExistingPaths(indexedPaths);
      if (existingSearchDirs.length === 0 && explicitFiles.length === 0) {
        throw new Error(`No valid index paths found. Current setting: ${toDisplayList(indexedPaths)}`);
      }

      let entryCount = 0;
      const fileWriter = createWriteStream(TEMP_INDEX_FILE);

      const writeCompleted = new Promise<void>((resolve, reject) => {
        fileWriter.once("error", reject);
        fileWriter.once("close", () => resolve());
      });

      for (const filePath of explicitFiles) {
        const entry = createIndexEntry(filePath);
        if (!entry) {
          continue;
        }

        entryCount += 1;
        if (!fileWriter.write(buildIndexLine(entry))) {
          await once(fileWriter, "drain");
        }
      }

      if (existingSearchDirs.length > 0) {
        const child = spawn(fdCmd, getIndexBuildArgs(existingSearchDirs));
        indexingProcess.current = child;

        if (!child.stdout || !child.stderr) {
          throw new Error("fd process streams are unavailable");
        }

        let stderrOutput = "";
        child.stderr.on("data", (chunk) => {
          stderrOutput += chunk.toString();
        });

        const rl = readline.createInterface({
          input: child.stdout,
          crlfDelay: Infinity,
        });

        const exitCodePromise = new Promise<number | null>((resolve, reject) => {
          child.once("error", reject);
          child.once("close", (code) => resolve(code));
        });

        for await (const line of rl) {
          const entry = createIndexEntry(line);
          if (!entry) {
            continue;
          }

          entryCount += 1;
          if (!fileWriter.write(buildIndexLine(entry))) {
            await once(fileWriter, "drain");
          }
        }

        const exitCode = await exitCodePromise;
        if (exitCode !== 0) {
          throw new Error(stderrOutput.trim() || `fd exited with code ${exitCode}`);
        }
      }

      fileWriter.end();
      await writeCompleted;

      fs.renameSync(TEMP_INDEX_FILE, ACTIVE_INDEX_FILE);
      safeUnlink(LEGACY_SUPPORT_INDEX_FILE);
      cleanupLegacyArtifacts();
      writeIndexMetadata(entryCount);

      if (watcherPaths.length > 0) {
        try {
          const watcherSignature = await computeWatcherSignature(fdCmd);
          if (watcherSignature) {
            writeWatcherSnapshot(watcherSignature);
          }
        } catch {
        }
      } else {
        safeUnlink(WATCHER_SNAPSHOT_FILE);
      }

      indexingProcess.current = null;
      releaseOwnedLock();
      setHasIndex(true);
      setIndexedCount(entryCount);
      setIndexStatus("idle");

      const newSource = getIndexSource();
      indexFingerprintRef.current = newSource ? getIndexFingerprint(newSource) : null;
      invalidateCachedIndex();
      if (newSource) {
        void loadCachedIndex(newSource);
      }

      if (latestQueryRef.current.trim() || latestFilterTypeRef.current !== "all") {
        void runSearch(latestQueryRef.current);
      } else {
        setResults([]);
      }

      if (!silent) {
        showToast({
          style: Toast.Style.Success,
          title: "Indexing complete",
          message: `Indexed ${entryCount} files and directories`,
        });
      }
    } catch (e) {
      if (indexingProcess.current) {
        indexingProcess.current.kill();
      }

      indexingProcess.current = null;
      safeUnlink(TEMP_INDEX_FILE);
      releaseOwnedLock();
      setHasIndex(Boolean(getIndexSource()));
      setIndexStatus("idle");

      if (!silent || !hasExistingIndex) {
        showToast({
          style: Toast.Style.Failure,
          title: "Indexing failed",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  useEffect(() => {
    if (hasInitialized.current) {
      return;
    }

    hasInitialized.current = true;

    async function initialize() {
      cleanupSupportArtifacts(hasLock.current);

      const source = getIndexSource();
      setHasIndex(Boolean(source));
      setIndexedCount(source ? readIndexMetadata()?.entryCount ?? null : null);
      indexFingerprintRef.current = source ? getIndexFingerprint(source) : null;
      invalidateCachedIndex();
      if (watcherPaths.length === 0) {
        safeUnlink(WATCHER_SNAPSHOT_FILE);
      }
      if (source) {
        void loadCachedIndex(source);
      }

      if (environment.launchType !== LaunchType.UserInitiated) {
        await syncIndexStateFromDisk();
        return;
      }

      await maybeWarnAboutRiskySettings();

      const latestSource = getIndexSource();
      let watcherTriggeredRebuild = false;

      if (latestSource && watcherPaths.length > 0) {
        const fdCmd = await getFdCommand();
        if (fdCmd) {
          try {
            const currentWatcherSignature = await computeWatcherSignature(fdCmd);
            const savedWatcherSnapshot = readWatcherSnapshot();
            watcherTriggeredRebuild =
              Boolean(currentWatcherSignature) &&
              (!savedWatcherSnapshot || savedWatcherSnapshot.signature !== currentWatcherSignature);
          } catch {
          }
        }
      }

      const needsRebuild =
        !latestSource ||
        !fs.existsSync(ACTIVE_INDEX_FILE) ||
        Date.now() - latestSource.mtimeMs > reindexIntervalMs ||
        watcherTriggeredRebuild;

      if (needsRebuild) {
        if (watcherTriggeredRebuild) {
          showToast({
            style: Toast.Style.Animated,
            title: "Watcher change detected",
            message: "Refreshing index because a watched path changed",
          });
        }
        void buildIndex(Boolean(latestSource));
      } else {
        await syncIndexStateFromDisk();
      }
    }

    void initialize();

    return () => {
      if (indexingProcess.current) {
        indexingProcess.current.kill();
      } else {
        releaseOwnedLock();
      }

      if (currentSearchAbort.current) {
        currentSearchAbort.current.abort();
      }
    };
  }, [reindexIntervalMs]);

  useEffect(() => {
    const timer = setInterval(() => {
      void syncIndexStateFromDisk();
    }, INDEX_REFRESH_POLL_MS);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!query.trim() && filterType === "all") {
      setResults([]);
      setLoading(false);
      return;
    }

    if (!hasIndex) {
      setResults([]);
      setLoading(false);
      return;
    }

    void runSearch(query);
  }, [query, filterType, hasIndex]);

  useEffect(() => {
    if (!selectedItemPath) {
      setSelectedItemDetails(null);
      return;
    }

    const selectedResult = results.find((item) => item.path === selectedItemPath);
    if (!selectedResult) {
      setSelectedItemDetails(null);
      return;
    }

    try {
      const stats = fs.statSync(stripTrailingSeparators(selectedItemPath));
      setSelectedItemDetails({
        path: selectedItemPath,
        createdAt: formatTimestamp(stats.birthtimeMs),
        modifiedAt: formatTimestamp(stats.mtimeMs),
        size: stats.size,
      });
    } catch {
      setSelectedItemDetails({
        path: selectedItemPath,
        createdAt: "Unknown",
        modifiedAt: formatTimestamp(selectedResult.mtimeMs ?? 0),
        size: selectedResult.size,
      });
    }
  }, [results, selectedItemPath]);

  const isBusy = loading || indexStatus !== "idle";
  const searchBarPlaceholder =
    indexStatus !== "idle" ? "Indexing filesystem..." : "Search for files...";
  const navigationTitle = indexedCount !== null ? `Indexed ${indexedCount.toLocaleString()} files` : undefined;

  return (
    <List
      isLoading={isBusy}
      filtering={false}
      isShowingDetail
      searchBarPlaceholder={searchBarPlaceholder}
      navigationTitle={navigationTitle}
      onSearchTextChange={setQuery}
      onSelectionChange={setSelectedItemPath}
      searchBarAccessory={
        <List.Dropdown tooltip="Filter by File Type" value={filterType} onChange={setFilterType}>
          <List.Dropdown.Item title="All Files" value="all" />
          <List.Dropdown.Item title="Images" value="images" />
          <List.Dropdown.Item title="Documents" value="documents" />
          <List.Dropdown.Item title="Code" value="code" />
          <List.Dropdown.Item title="Videos" value="videos" />
          <List.Dropdown.Item title="Audio" value="audio" />
          <List.Dropdown.Item title="Archives" value="archives" />
        </List.Dropdown>
      }
      throttle
    >
      {indexStatus === "building" && !hasIndex && (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title="Indexing filesystem..."
          description="Building the first search index. This may take a minute."
        />
      )}

      {indexStatus === "refreshing" && !results.length && !query && hasIndex && (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title="Updating index in background..."
          description="You can search now. Results will refresh when the new index is ready."
        />
      )}

      {!isBusy && !hasIndex && (
        <List.EmptyView
          icon={Icon.XMarkCircle}
          title="No index available"
          description="Build the index to start searching your filesystem."
          actions={
            <ActionPanel>
              <Action
                title="Build Index"
                icon={Icon.RotateClockwise}
                onAction={() => void buildIndex(false)}
              />
            </ActionPanel>
          }
        />
      )}

      {!isBusy && !results.length && query && hasIndex && (
        <List.EmptyView
          icon={Icon.XMarkCircle}
          title="No results found"
          description={`No files matching "${query}"`}
          actions={
            <ActionPanel>
              <Action
                title="Rebuild Index"
                icon={Icon.RotateClockwise}
                onAction={() => void buildIndex(false)}
              />
            </ActionPanel>
          }
        />
      )}

      {!isBusy && !results.length && !query && hasIndex && (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title="Search your filesystem"
          description={`Using the current index from ${toDisplayList(indexedPaths)}.`}
          actions={
            <ActionPanel>
              <Action
                title="Rebuild Index Now"
                icon={Icon.RotateClockwise}
                shortcut={{ modifiers: ["cmd"], key: "r" }}
                onAction={() => void buildIndex(false)}
              />
            </ActionPanel>
          }
        />
      )}

      {results.map((item) => {
        const normalizedItemPath = stripTrailingSeparators(item.path);
        const filename = getPathLeafName(normalizedItemPath);
        const parentDir = getPathParent(normalizedItemPath);
        const ext = item.extension || path.extname(normalizedItemPath).toLowerCase();
        const isSelected = selectedItemPath === item.path;
        const activeDetails = isSelected && selectedItemDetails?.path === item.path ? selectedItemDetails : null;
        const createdAt = activeDetails?.createdAt ?? "Unknown";
        const modifiedAt = activeDetails?.modifiedAt ?? formatTimestamp(item.mtimeMs ?? 0);
        const liveSize = activeDetails?.size ?? item.size;

        const imageExts = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp", ".ico"];
        const isImage = imageExts.includes(ext);
        const icon = isImage ? { source: normalizedItemPath } : getFileIcon(normalizedItemPath, item.isDirectory);
        const detailMarkdown = isImage
          ? `![Preview](${pathToFileURL(normalizedItemPath).href})`
          : `# ${filename}\n\n\`${normalizedItemPath}\``;

        const accessories = [];
        if (item.size !== undefined && !item.isDirectory) {
          accessories.push({ text: formatFileSize(liveSize ?? item.size) });
        } else if (item.isDirectory) {
          accessories.push({ text: "Folder" });
        } else if (ext) {
          accessories.push({ text: ext.toUpperCase().replace(".", "") });
        }

        return (
          <List.Item
            key={item.path}
            id={item.path}
            title={filename}
            subtitle={parentDir}
            icon={icon}
            accessories={accessories}
            detail={
              <List.Item.Detail
                markdown={detailMarkdown}
                metadata={
                  <List.Item.Detail.Metadata>
                    <List.Item.Detail.Metadata.Label title="Type" text={item.isDirectory ? "Folder" : ext || "File"} />
                    <List.Item.Detail.Metadata.Label title="Size" text={item.isDirectory ? "Folder" : formatFileSize(liveSize ?? 0)} />
                    <List.Item.Detail.Metadata.Label title="Created" text={createdAt} />
                    <List.Item.Detail.Metadata.Label title="Modified" text={modifiedAt} />
                    <List.Item.Detail.Metadata.Separator />
                    <List.Item.Detail.Metadata.Label title="Name" text={filename} />
                    <List.Item.Detail.Metadata.Label title="Parent" text={parentDir} />
                    <List.Item.Detail.Metadata.Link title="Path" target={normalizedItemPath} text={normalizedItemPath} />
                  </List.Item.Detail.Metadata>
                }
              />
            }
            actions={
              <ActionPanel>
                <ActionPanel.Section title="File Actions">
                  <Action.Open title="Open" target={item.path} />
                  <Action.Open
                    title="Open Parent Folder"
                    target={parentDir}
                    shortcut={{ modifiers: ["cmd", "shift"], key: "o" }}
                  />
                  {item.isDirectory && (
                    <Action
                      title="Open Terminal Here"
                      icon={Icon.Terminal}
                      shortcut={{ modifiers: ["cmd"], key: "t" }}
                      onAction={() => void openTerminal(item.path)}
                    />
                  )}
                </ActionPanel.Section>
                <ActionPanel.Section title="Copy">
                  <Action.CopyToClipboard
                    title="Copy Full Path"
                    content={item.path}
                    shortcut={{ modifiers: ["cmd"], key: "c" }}
                  />
                  <Action.CopyToClipboard
                    title="Copy Name"
                    content={filename}
                    shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                  />
                  <Action.CopyToClipboard
                    title="Copy Parent Directory"
                    content={parentDir}
                    shortcut={{ modifiers: ["cmd", "shift"], key: "d" }}
                  />
                </ActionPanel.Section>
                <ActionPanel.Section title="Index Management">
                  <Action
                    title="Rebuild Index"
                    icon={Icon.RotateClockwise}
                    shortcut={{ modifiers: ["cmd"], key: "r" }}
                    onAction={() => void buildIndex(false)}
                  />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
