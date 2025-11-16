import { $ } from 'execa';
import path from 'node:path';
import {
  Project,
  EditorProgram as EditorProgram,
  TerminalProgram,
} from './types';

// Preferences for finding projects
interface ListProjectsOpts {
  basePath: string;
  searchDepth?: number;
}

/**
 * Find Git projects in the specified directory.
 * @param opts Options including projectsPath and optional searchDepth.
 * @returns A promise that resolves to an array of Project objects.
 */
export const listProjects = async (
  opts: ListProjectsOpts
): Promise<Project[]> => {
  const { basePath, searchDepth = 3 } = opts;

  let stdout = '';
  const pattern = '^\\.git$';
  try {
    // Prefer fd
    await $`fd --version`;
    const res =
      await $`fd --hidden --no-ignore --type d --max-depth ${searchDepth} ${pattern} ${basePath}`;
    stdout = res.stdout;
  } catch {
    try {
      // Debian/Ubuntu package installs as `fdfind`
      await $`fdfind --version`;
      const res =
        await $`fdfind --hidden --no-ignore --type d --max-depth ${searchDepth} ${pattern} ${basePath}`;
      stdout = res.stdout;
    } catch {
      // Fallback to POSIX find
      const res =
        await $`find ${basePath} -maxdepth ${searchDepth} -type d -name .git`;
      stdout = res.stdout;
    }
  }

  // fd prints paths relative to the search root by default; find prints absolute paths.
  // Make paths absolute and strip a trailing .git (with or without a preceding slash/backslash).
  const projectDirs = stdout
    .split('\n')
    .map((s: string) => s.trim())
    .filter((p: string) => p.length > 0)
    .map((gitPath: string) => {
      // If the last segment is .git, return its parent directory
      if (path.basename(gitPath) === '.git') {
        const parent = path.dirname(gitPath);
        return parent === '.' ? basePath : parent; // fd in repo root could yield '.git'
      }
      return gitPath;
    })
    .filter((p: string) => p.length > 0);

  const projectsList: Project[] = projectDirs.map((projectPath: string) => {
    const title = path.basename(projectPath);
    return { title, path: projectPath };
  });

  return projectsList;
};

export const openInTerminal = async (
  terminal: string,
  projectPath: string
): Promise<void> => {
  const opts = { detached: true, stdio: 'ignore' as const };
  switch (terminal) {
    case TerminalProgram.GnomeTerminal:
      $({ ...opts })`${terminal} --working-directory=${projectPath}`.unref();
      break;
    case TerminalProgram.Ptyxis:
      $({ ...opts })`${terminal} -d ${projectPath} --tab`.unref();
      break;
    case TerminalProgram.Ghostty:
      $({ ...opts })`${terminal} --working-directory=${projectPath}`.unref();
      break;
    default:
      throw new Error(`Unsupported terminal program: ${terminal}`);
  }
};

export const openInEditor = async (
  editor: EditorProgram,
  projectPath: string
): Promise<void> => {
  switch (editor) {
    case EditorProgram.VSCode:
    case EditorProgram.Zed:
      await $`${editor} ${projectPath}`;
      break;
    default:
      throw new Error(`Unsupported code editor program: ${editor}`);
  }
};
