import { execJJ } from "./exec";

export function pushToGit(bookmark?: string, path?: string): string {
  const bookmarkArg = bookmark ? ` --bookmark ${bookmark}` : " --all";
  return execJJ(`git push${bookmarkArg}`, path);
}

export function pullFromGit(path?: string): string {
  return execJJ("git pull", path);
}
