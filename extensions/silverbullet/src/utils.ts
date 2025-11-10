import { FileInfo, Note } from "./types";

export const SILVERBULLET_HEADERS = {
  "X-Sync-Mode": "true",
} as const;

export function buildApiUrl(apiUrl: string, path: string): string {
  return `${apiUrl}/.fs/${encodeURIComponent(path)}`;
}

export function buildNoteUrl(apiUrl: string, filePath: string): string {
  return `${apiUrl}/${filePath.replace(/\.md$/, "")}`;
}

export async function fetchFileContent(
  apiUrl: string,
  filePath: string,
  token?: string,
): Promise<string> {
  const headers: Record<string, string> = { ...SILVERBULLET_HEADERS };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const response = await fetch(buildApiUrl(apiUrl, filePath), { headers });
  if (!response.ok) {
    throw new Error(`Failed to fetch file content: ${response.status}`);
  }
  return response.text();
}

export async function deleteFile(
  apiUrl: string,
  filePath: string,
  token?: string,
): Promise<void> {
  const headers: Record<string, string> = { ...SILVERBULLET_HEADERS };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const response = await fetch(buildApiUrl(apiUrl, filePath), {
    method: "DELETE",
    headers,
  });
  if (!response.ok) {
    throw new Error(`Failed to delete file: ${response.status}`);
  }
}

export function parseNote(fileInfo: FileInfo, content?: string): Note {
  let title = fileInfo.name.replace(/\.md$/, "");
  let contentLoaded = false;

  if (content) {
    contentLoaded = true;
    // Extract title from first line or filename
    const lines = content.split("\n");
    if (lines.length > 0 && lines[0].startsWith("# ")) {
      title = lines[0].substring(2).trim();
    }
  }

  return {
    id: fileInfo.name,
    title,
    content: content || "",
    filePath: fileInfo.name,
    modified: fileInfo.lastModified,
    contentLoaded,
  };
}

export async function fetchFileList(
  apiUrl: string,
  token?: string,
): Promise<FileInfo[]> {
  const headers: Record<string, string> = { ...SILVERBULLET_HEADERS };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const response = await fetch(`${apiUrl}/.fs/`, { headers });
  if (!response.ok) {
    throw new Error(`Failed to fetch file list: ${response.status}`);
  }
  return response.json() as Promise<FileInfo[]>;
}
