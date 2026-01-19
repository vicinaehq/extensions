import { execJJ, JJStatus } from "./cli";

export { JJStatus };

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

export function getJJStatus(path?: string): JJStatus {
  const output = execJJ("status", path);
  return parseJJStatus(output);
}
