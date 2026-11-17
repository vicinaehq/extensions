/** Pure history parsing. No shell, YAML loader, or evaluation is involved. */
export type ShellName = "bash" | "zsh" | "fish";
export type HistoryEntry = {
  command: string;
  timestamp?: number;
  source: ShellName;
  frequency?: number;
};

function entry(command: string, source: ShellName, timestamp?: number): HistoryEntry[] {
  return command.trim() ? [{ command, source, timestamp }] : [];
}

export function parseBash(content: string): HistoryEntry[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  // With timestamps, each marker delimits a logical entry (including lithist newlines).
  // Without markers, multiline boundaries are unrecoverable, except explicit continuations.
  if (lines.some(line => /^#\d{9,}$/.test(line))) {
    const result: HistoryEntry[] = [];
    let command: string[] = [];
    let timestamp: number | undefined;
    for (const line of lines) {
      if (/^#\d{9,}$/.test(line)) {
        if (timestamp === undefined) {
          for (const item of parseContinued(command)) result.push(item);
        } else result.push(...entry(command.join("\n"), "bash", timestamp));
        command = [];
        timestamp = Number(line.slice(1));
      } else command.push(line);
    }
    return result.concat(entry(command.join("\n"), "bash", timestamp));
  }
  return parseContinued(lines);
}

function continued(line: string): boolean {
  return (line.match(/\\+$/)?.[0].length ?? 0) % 2 === 1;
}

function parseContinued(lines: string[]): HistoryEntry[] {
  const output: HistoryEntry[] = [];
  let parts: string[] = [];
  for (const line of lines) {
    parts.push(line);
    if (!continued(line)) {
      output.push(...entry(parts.join("\n"), "bash"));
      parts = [];
    }
  }
  // An unfinished continuation is a partial write, not a runnable suggestion.
  return output;
}

export function parseZsh(content: string): HistoryEntry[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  const output: HistoryEntry[] = [];
  let parts: string[] = [];
  let timestamp: number | undefined;
  for (const line of lines) {
    const match = parts.length === 0 ? line.match(/^: (\d+):-?\d+;(.*)$/) : null;
    let text = match ? match[2] : line;
    if (match) timestamp = Number(match[1]);
    else if (!parts.length && text.startsWith("\\:")) text = text.slice(1);
    // Zsh readhistline joins ANY backslash before a physical newline, not just
    // odd runs. Its writer also pads trailing backslashes/spaces with one space.
    if (text.endsWith("\\")) parts.push(text.slice(0, -1));
    else {
      if (/\\ * $/.test(text)) text = text.slice(0, -1);
      parts.push(text);
      output.push(...entry(parts.join("\n"), "zsh", timestamp));
      parts = [];
      timestamp = undefined;
    }
  }
  return output;
}

/** Fish's history serializer only escapes backslash and newline; this is not YAML. */
export function parseFish(content: string): HistoryEntry[] {
  const output: HistoryEntry[] = [];
  let current: HistoryEntry | undefined;
  for (const line of content.replace(/\r\n/g, "\n").split("\n")) {
    const match = line.match(/^- cmd: (.*)$/);
    if (match) {
      current = entry(match[1].replace(/\\([\\n])/g, (_, c: string) => c === "n" ? "\n" : "\\"), "fish")[0];
      if (current) output.push(current);
    }
    const when = line.match(/^  when: (\d+)$/);
    if (when && current) current.timestamp = Number(when[1]);
  }
  return output;
}

/** Last file occurrence wins; preserve exact whitespace and accumulate frequency. */
export function uniqueRecent(entries: HistoryEntry[], limit = 10000): HistoryEntry[] {
  const unique = new Map<string, HistoryEntry>();
  for (let i = entries.length - 1; i >= 0; i--) {
    const item = entries[i];
    if (!item.command.trim()) continue;
    const previous = unique.get(item.command);
    if (previous) previous.frequency = (previous.frequency ?? 1) + (item.frequency ?? 1);
    else if (unique.size < limit) unique.set(item.command, { ...item, frequency: item.frequency ?? 1 });
  }
  return [...unique.values()];
}
