import { extname } from "node:path";

export const PACKAGE_EXTENSIONS = [
  ".deb",
  ".flatpak",
  ".flatpakref",
  ".appimage",
] as const;

export interface IndexedFile {
  path: string;
}

export type FileSearch = (
  query: string,
  limit: number,
) => Promise<readonly IndexedFile[]>;

/**
 * Searches the file index and keeps only the given extensions. Partial names
 * rarely rank target files first, so an empty direct search retries once per
 * extension with the extension appended to the query.
 */
export async function searchIndexedFiles(
  query: string,
  extensions: readonly string[],
  search: FileSearch,
  limitPerExtension: number,
): Promise<IndexedFile[]> {
  const directMatches = filesWithExtensions(
    await search(query, limitPerExtension),
    extensions,
  );
  if (directMatches.length > 0) return directMatches;

  const resultSets = await Promise.all(
    extensions.map((extension) =>
      search(`${query} ${extension}`, limitPerExtension)
    ),
  );
  return filesWithExtensions(resultSets.flat(), extensions);
}

function filesWithExtensions(
  files: readonly IndexedFile[],
  extensions: readonly string[],
): IndexedFile[] {
  const uniqueFiles = new Map<string, IndexedFile>();
  for (const file of files) {
    if (hasExtension(file.path, extensions)) uniqueFiles.set(file.path, file);
  }
  return [...uniqueFiles.values()];
}

export function hasExtension(
  filePath: string,
  extensions: readonly string[],
): boolean {
  return extensions.includes(extname(filePath).toLowerCase());
}
