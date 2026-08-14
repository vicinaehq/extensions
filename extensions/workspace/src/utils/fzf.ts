import { execFile, spawnSync } from "child_process";
import { existsSync } from "fs";
import { promisify } from "util";

import { Project } from "@/types";

const execFileAsync = promisify(execFile);

const FZF_TIMEOUT_MS = 2_000;
const COMMON_FZF_PATHS = ["/opt/homebrew/bin/fzf", "/usr/local/bin/fzf", "/usr/bin/fzf"];

let fzfPathCache: null | string | undefined;

export function fuzzySearch(projects: Project[], searchText: string, fzfPath: string): Project[] {
  if (!searchText) return projects;

  try {
    const input = projects.map((project, index) => `${index}\t${project.name}`).join("\n");
    const result = spawnSync(fzfPath, ["-f", searchText, "--nth=2..", "--delimiter=\t"], {
      encoding: "utf-8",
      input,
      timeout: FZF_TIMEOUT_MS,
    });

    if (result.status !== 0 || !result.stdout) {
      return [];
    }

    return result.stdout
      .trim()
      .split("\n")
      .flatMap((line) => {
        const tab = line.indexOf("\t");
        if (tab === -1) return [];
        const index = Number.parseInt(line.slice(0, tab), 10);
        const project = Number.isNaN(index) ? undefined : projects[index];
        return project ? [project] : [];
      });
  } catch {
    return [];
  }
}

export async function getFzfPath(): Promise<null | string> {
  if (fzfPathCache !== undefined) {
    return fzfPathCache;
  }

  for (const candidate of COMMON_FZF_PATHS) {
    if (existsSync(candidate)) {
      fzfPathCache = candidate;
      return candidate;
    }
  }

  try {
    const { stdout } = await execFileAsync("which", ["fzf"], { timeout: FZF_TIMEOUT_MS });
    const resolved = stdout.trim();
    fzfPathCache = resolved || null;
    return fzfPathCache;
  } catch {
    fzfPathCache = null;
    return null;
  }
}
