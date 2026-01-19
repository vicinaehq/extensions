import { execSync } from "child_process";

export function execJJ(command: string, cwd?: string): string {
  const result = execSync(`jj ${command}`, {
    cwd,
    encoding: "utf-8",
    maxBuffer: 1024 * 1024 * 10,
  });
  return result.trim();
}

export function isJJRepo(path?: string): boolean {
  try {
    execJJ("status", path);
    return true;
  } catch {
    return false;
  }
}

export function getWorkingCopyPath(): string | null {
  try {
    const output = execJJ("workspace root");
    return output.trim();
  } catch {
    return null;
  }
}

export interface JJArguments {
  "repo-path": string;
}

export interface JJChange {
  commit_id: string;
  change_id: string;
  author: string;
  description: string;
  bookmarks: string[];
  is_working_copy?: boolean;
  parents?: string[];
}

export interface JJChangeDetails extends JJChange {
  parent_ids: string[];
  child_ids: string[];
  files: JJFileChange[];
}

export interface JJFileChange {
  path: string;
  type: 'modified' | 'added' | 'removed' | 'renamed';
  old_path?: string;
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

export interface JJOplogEntry {
  operation_id: string;
  command: string;
  timestamp: string;
  tags: string[];
}

export interface RevsetPreset {
  name: string;
  description: string;
  query: string;
}

export const REVSET_PRESETS: RevsetPreset[] = [
  { name: '@', description: 'Working copy', query: '@' },
  { name: '@-', description: 'Working copy parent', query: '@-' },
  { name: '@--', description: 'Two parents ago', query: '@--' },
  { name: '::', description: 'All ancestors of working copy', query: '::' },
  { name: '@::', description: 'Current and ancestors', query: '@::' },
  { name: '@-::', description: 'Parent and ancestors', query: '@-::' },
  { name: '@ | @-', description: 'Working copy and parent', query: '@ | @-' },
  { name: '@- | @', description: 'Parent and working copy', query: '@- | @' },
  { name: '::@', description: 'All ancestors', query: '::@' },
  { name: '@::@', description: 'From root to working copy', query: '@::@' },
];

export const JJ_LOG_TEMPLATE = "commit_id ++ \"\\t\" ++ change_id ++ \"\\t\" ++ author ++ \"\\t\" ++ description ++ \"\\t\" ++ bookmarks.map(|b| b.name()).join(\",\") ++ \"\\t\" ++ if(is_working_copy, \"working_copy\", \"false\") ++ \"\\t\" ++ parents.map(|p| p.change_id).join(\",\") ++ \"\\n\";";

export function parseJJChangeFromLine(line: string, invertOrder = false): JJChange {
  const parts = line.split('\t');
  return invertOrder
    ? {
        commit_id: parts[1] || '',
        change_id: parts[0] || '',
        author: parts[2] || '',
        description: parts[3] || '',
        bookmarks: parts[4] ? parts[4].split(',').filter(b => b.trim()) : [],
        is_working_copy: false
      }
    : {
        commit_id: parts[0] || '',
        change_id: parts[1] || '',
        author: parts[2] || '',
        description: parts[3] || '',
        bookmarks: parts[4] ? parts[4].split(',').filter(b => b.trim()) : [],
        is_working_copy: parts[5] === 'working_copy',
        parents: parts[6] ? parts[6].split(',').filter(p => p.trim()) : []
      };
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
