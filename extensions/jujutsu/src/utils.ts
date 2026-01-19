import { execSync } from "child_process";

export interface JJChange {
  commit_id: string;
  change_id: string;
  author: string;
  description: string;
  bookmarks: string[];
  is_working_copy?: boolean;
}

export interface JJStatus {
  working_copy: {
    commit_id: string;
    change_id: string;
  };
  working_copy_changes: {
    modified: string[];
    added: string[];
    removed: string[];
    renamed: string[];
  };
  parent_changes: JJChange[];
}

export interface JJBookmark {
  name: string;
  commit_id: string;
  change_id: string;
  remote_refs: string[];
}

export function execJJ(command: string, cwd?: string): string {
  const result = execSync(`jj ${command}`, {
    cwd,
    encoding: "utf-8",
    maxBuffer: 1024 * 1024 * 10, // 10MB buffer
  });
  return result.trim();
}

export function isJJRepo(path?: string): boolean {
  execJJ("status", path);
  return true;
}

export function parseJJStatus(output: string): JJStatus {
  const lines = output.split('\n');
  const status: JJStatus = {
    working_copy: { commit_id: '', change_id: '' },
    working_copy_changes: { modified: [], added: [], removed: [], renamed: [] },
    parent_changes: []
  };

  let inWorkingCopyChanges = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === 'Working copy changes:') {
      inWorkingCopyChanges = true;
      continue;
    }

    if (trimmed.startsWith('Working copy')) {
      inWorkingCopyChanges = false;
      // Parse working copy info: "Working copy  (@) : wyqwzqqm 0a2a4a75 implement @extensions/jujutsu/"
      const match = trimmed.match(/Working copy\s+\(@\)\s*:\s+(\w+)\s+([\w]+)\s+(.+)/);
      if (match) {
        status.working_copy.change_id = match[1];
        status.working_copy.commit_id = match[2];
      }
      continue;
    }

    if (inWorkingCopyChanges) {
      if (trimmed.startsWith('M ')) {
        status.working_copy_changes.modified.push(trimmed.substring(2));
      } else if (trimmed.startsWith('A ')) {
        status.working_copy_changes.added.push(trimmed.substring(2));
      } else if (trimmed.startsWith('D ')) {
        status.working_copy_changes.removed.push(trimmed.substring(2));
      }
    }
  }

  return status;
}

export function getJJStatus(path?: string): JJStatus {
  const output = execJJ("status", path);
  return parseJJStatus(output);
}

export function getJJLog(limit = 20, path?: string): JJChange[] {
  const template = 'commit_id ++ "\\t" ++ change_id ++ "\\t" ++ author ++ "\\t" ++ description ++ "\\t" ++ bookmarks.map(|b| b.name()).join(",") ++ "\\t" ++ if(is_working_copy, "working_copy", "false") ++ "\\n"';
  const output = execJJ(`log --limit ${limit} --template '${template}'`, path);
  const lines = output.split('\n').filter(line => line.trim());

  return lines.map(line => {
    const parts = line.split('\t');
    return {
      commit_id: parts[0] || '',
      change_id: parts[1] || '',
      author: parts[2] || '',
      description: parts[3] || '',
      bookmarks: parts[4] ? parts[4].split(',').filter(b => b.trim()) : [],
      is_working_copy: parts[5] === 'working_copy'
    };
  });
}

export function getJJDiff(path?: string): string {
  return execJJ("diff", path);
}

export function getJJBookmarks(path?: string): JJBookmark[] {
  const output = execJJ("bookmark list", path);
  const lines = output.split('\n').filter(line => line.trim());

  const bookmarks: JJBookmark[] = [];
  let currentBookmark: JJBookmark | null = null;

  for (const line of lines) {
    if (!line.startsWith(' ')) {
      // New bookmark
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
      // Remote ref
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

export function createNewChange(description?: string, path?: string): void {
  if (description) {
    execJJ(`new -m "${description.replace(/"/g, '\\"')}"`, path);
  } else {
    execJJ("new", path);
  }
}

export function describeChange(description: string, path?: string): void {
  execJJ(`describe -m "${description.replace(/"/g, '\\"')}"`, path);
}

export function pushToGit(bookmark?: string, path?: string): string {
  const bookmarkArg = bookmark ? ` --bookmark ${bookmark}` : " --all";
  return execJJ(`git push${bookmarkArg}`, path);
}

export function pullFromGit(path?: string): string {
  return execJJ("git pull", path);
}

export function forgetBookmark(bookmark: string, path?: string): void {
  execJJ(`bookmark forget ${bookmark}`, path);
}

export function getCurrentDescription(path?: string): string {
  const output = execJJ("log -r @ --template description", path);
  return output;
}

export function getWorkingCopyPath(): string | null {
  const output = execJJ("workspace root");
  return output.trim();
}

// Workflow utilities for chaining operations
export interface WorkflowStep {
  name: string;
  command: string;
  description: string;
  cwd?: string;
}

export interface WorkflowResult {
  success: boolean;
  results: { step: string; output: string; error?: string }[];
  error?: string;
}

export async function executeWorkflow(steps: WorkflowStep[]): Promise<WorkflowResult> {
  const results: { step: string; output: string; error?: string }[] = [];

  for (const step of steps) {
    try {
      const output = execJJ(step.command, step.cwd);
      results.push({
        step: step.name,
        output: output
      });
    } catch (error: any) {
      results.push({
        step: step.name,
        output: '',
        error: error.message || 'Unknown error'
      });
      return {
        success: false,
        results,
        error: `${step.name} failed: ${error.message}`
      };
    }
  }

  return {
    success: true,
    results
  };
}

export function createSyncWorkflow(repoPath: string): WorkflowStep[] {
  return [
    {
      name: "pull",
      command: "git pull --all",
      description: "Pull latest changes from remote",
      cwd: repoPath
    },
    {
      name: "push",
      command: "git push --all",
      description: "Push local changes to remote",
      cwd: repoPath
    }
  ];
}

export function createPullWorkflow(repoPath: string): WorkflowStep[] {
  return [
    {
      name: "pull",
      command: "git pull --all",
      description: "Pull latest changes from remote",
      cwd: repoPath
    }
  ];
}

export function createPushWorkflow(repoPath: string): WorkflowStep[] {
  return [
    {
      name: "push",
      command: "git push --all",
      description: "Push local changes to remote",
      cwd: repoPath
    }
  ];
}