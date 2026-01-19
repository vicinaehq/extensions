import { execJJ } from "./exec";
import { JJChange, parseJJChangeFromLine } from "./cli";

export function execRevsetQuery(revset: string, path?: string): JJChange[] {
  const template = 'change_id ++ "\\t" ++ commit_id ++ "\\t" ++ author ++ "\\t" ++ description ++ "\\t" ++ bookmarks.map(|b| b.name()).join(",") ++ "\\n"';
  const output = execJJ(`log -r '${revset}' --template '${template}'`, path);
  const lines = output.split('\n').filter(line => line.trim());
  return lines.map(line => parseJJChangeFromLine(line, true));
}
