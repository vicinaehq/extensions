import { execJJ, JJChange, JJChangeDetails, JJFileChange, JJOplogEntry, JJ_LOG_TEMPLATE } from "./cli";

export { JJChange };

export function getJJLog(limit = 20, path?: string): JJChange[] {
  const output = execJJ(`log --limit ${limit} --template '${JJ_LOG_TEMPLATE}'`, path);
  const lines = output.split('\n').filter(line => line.trim());
  return lines.map(line => {
    const parts = line.split('\t');
    return {
      commit_id: parts[0] || '',
      change_id: parts[1] || '',
      author: parts[2] || '',
      description: parts[3] || '',
      bookmarks: parts[4] ? parts[4].split(',').filter(b => b.trim()) : [],
      is_working_copy: parts[5] === 'working_copy',
      parents: parts[6] ? parts[6].split(',').filter(p => p.trim()) : []
    };
  });
}

export function getJJChangeDetails(changeId: string, path?: string): JJChangeDetails {
  const output = execJJ(`log -r ${changeId} --limit 1 --template '${JJ_LOG_TEMPLATE}'`, path);
  const line = output.trim();
  
  if (!line) {
    throw new Error(`Change not found: ${changeId}`);
  }
  
  const changeParts = line.split('\t');
  const change: JJChange = {
    commit_id: changeParts[0] || '',
    change_id: changeParts[1] || '',
    author: changeParts[2] || '',
    description: changeParts[3] || '',
    bookmarks: changeParts[4] ? changeParts[4].split(',').filter(b => b.trim()) : [],
    is_working_copy: changeParts[5] === 'working_copy',
    parents: changeParts[6] ? changeParts[6].split(',').filter(p => p.trim()) : []
  };
  
  const filesTemplate = "file ++ \"\\t\" ++ if(type == \"modified\", \"modified\", if(type == \"added\", \"added\", if(type == \"removed\", \"removed\", if(type == \"renamed\", \"renamed\", \"unknown\")))) ++ \"\\t\" ++ old_path ++ \"\\n\"";
  const filesOutput = execJJ(`show --template '${filesTemplate}'`, path);
  const fileLines = filesOutput.split('\n').filter(line => line.trim());
  
  const files = fileLines.map(fileLine => {
    const fileParts = fileLine.split('\t');
    return {
      path: fileParts[0] || '',
      type: (fileParts[1] as JJFileChange['type']) || 'modified',
      old_path: fileParts[2] || undefined
    };
  });

  return {
    ...change,
    parent_ids: change.parents || [],
    child_ids: [],
    files
  };
}

export function getJJOplog(limit = 50, path?: string): JJOplogEntry[] {
  const template = 'operation_id ++ "\\t" ++ command ++ "\\t" ++ time ++ "\\t" ++ tags ++ "\\n"';
  const output = execJJ(`op log --limit ${limit} --template '${template}'`, path);
  const lines = output.split('\n').filter(line => line.trim());

  return lines.map(line => {
    const parts = line.split('\t');
    return {
      operation_id: parts[0] || '',
      command: parts[1] || '',
      timestamp: parts[2] || '',
      tags: parts[3] ? parts[3].split(',').filter(t => t.trim()) : []
    };
  });
}
