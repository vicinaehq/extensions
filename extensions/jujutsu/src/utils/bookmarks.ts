import { execJJ, JJBookmark } from "./cli";

export { JJBookmark };

export function getJJBookmarks(path?: string): JJBookmark[] {
  const output = execJJ("bookmark list", path);
  const lines = output.split('\n').filter(line => line.trim());

  const bookmarks: JJBookmark[] = [];
  let currentBookmark: JJBookmark | null = null;

  for (const line of lines) {
    if (!line.startsWith(' ')) {
      if (currentBookmark) {
        bookmarks.push(currentBookmark);
      }
      const match = line.match(/^([^:]+):\s+(\w+)\s+(\w+)\s+(.+)$/);
      if (match) {
        const [, name, change_id, commit_id, description] = match;
        currentBookmark = {
          name,
          commit_id,
          change_id,
          remote_refs: []
        };
      } else if (line.includes('(deleted)')) {
        const name = line.replace(' (deleted)', '');
        currentBookmark = {
          name,
          commit_id: '',
          change_id: '',
          remote_refs: []
        };
      }
    } else {
      if (currentBookmark) {
        const match = line.trim().match(/^@(\w+).*/);
        if (match) {
          currentBookmark.remote_refs.push(match[1]);
        }
      }
    }
  }

  if (currentBookmark) {
    bookmarks.push(currentBookmark);
  }

  return bookmarks;
}

export function forgetBookmark(bookmark: string, path?: string): void {
  execJJ(`bookmark forget ${bookmark}`, path);
}
