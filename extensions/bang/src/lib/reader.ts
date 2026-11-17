import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { parseBash, parseFish, parseZsh, uniqueRecent, type HistoryEntry, type ShellName } from "./history";

export const MAX_HISTORY_BYTES = 4 * 1024 * 1024;
export type Snapshot = { entries: HistoryEntry[]; notices: string[] };

/** Decode Zsh's byte-level Meta (0x83, byte ^ 32) before UTF-8 decoding. */
export function decodeHistory(bytes: Buffer, shell: ShellName): string {
  if (shell !== "zsh") return bytes.toString("utf8").replace(/^\ufeff/, "");
  const decoded = Buffer.allocUnsafe(bytes.length);
  let length = 0;
  for (let i = 0; i < bytes.length; i++) {
    decoded[length++] = bytes[i] === 0x83 && i + 1 < bytes.length ? bytes[++i] ^ 32 : bytes[i];
  }
  return decoded.subarray(0, length).toString("utf8").replace(/^\ufeff/, "");
}

export function parseSnapshot(bytes: Buffer, shell: ShellName, maxItems: number, truncated = false): Snapshot {
  let text = decodeHistory(bytes, shell);
  const notices: string[] = [];
  if (truncated) {
    notices.push("Large history: only the newest 4 MiB were read; older commands and frequency counts may be incomplete.");
    // Discard the partial first record, never offer a suffix as an executable entry.
    const boundary = shell === "fish" ? /\n(?=- cmd: )/ : shell === "zsh" ? /\n(?=: \d+:-?\d+;)/ : /\n(?=#\d{9,}\n)/;
    const match = boundary.exec(text);
    if (match) text = text.slice(match.index + 1);
    else if ((shell === "bash" && !/^#\d{9,}$/m.test(text)) || (shell === "zsh" && !/^: \d+:-?\d+;/m.test(text))) {
      // Plain histories have no reliable record markers. Skip through the first
      // non-continuation newline, including any leading continuation fragment.
      const end = text.search(/(?<!\\)\n/);
      text = end < 0 ? "" : text.slice(end + 1);
    } else text = "";
  }
  const lastLine = text.endsWith("\n") ? text.slice(text.lastIndexOf("\n", text.length - 2) + 1, -1) : "";
  const unfinishedContinuation = shell === "zsh" ? lastLine.endsWith("\\") : shell === "bash" && (lastLine.match(/\\+$/)?.[0].length ?? 0) % 2 === 1;
  if (text && (!text.endsWith("\n") || unfinishedContinuation)) {
    notices.push("An unfinished history record was skipped. Flush your shell history, then reload.");
    // Timestamped Bash entries can span lines: discard the entire final record.
    if (shell === "bash" && /^#\d{9,}$/m.test(text)) {
      const end = text.lastIndexOf("\n");
      if (/^#\d*$/.test(text.slice(end + 1))) text = text.slice(0, end + 1);
      else {
        const markers = [...text.matchAll(/^#\d{9,}\n/gm)];
        text = markers.length ? text.slice(0, markers.at(-1)!.index) : "";
      }
    } else {
      const end = text.lastIndexOf("\n");
      const fragment = text.slice(end + 1);
      text = end < 0 ? "" : text.slice(0, end + 1);
      if (shell === "fish" && !fragment.startsWith("-")) {
        // If metadata was mid-write, discard its cmd record too.
        const records = [...text.matchAll(/^- cmd: /gm)];
        text = records.length ? text.slice(0, records.at(-1)!.index) : "";
      }
    }
  }
  if (text.includes("�")) notices.push("Some history bytes are not valid UTF-8. Affected commands require editing before execution.");
  const parse = shell === "fish" ? parseFish : shell === "zsh" ? parseZsh : parseBash;
  return { entries: uniqueRecent(parse(text), maxItems), notices };
}

/** Bounded asynchronous snapshot, not a watch/read on each keystroke. */
export async function readHistory(file: string, shell: ShellName, maxItems: number): Promise<Snapshot> {
  // O_NONBLOCK prevents a custom FIFO path from blocking even before fstat.
  const handle = await open(file, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw Object.assign(new Error("Not a regular file"), { code: "NOT_FILE" });
    const size = Math.min(stat.size, MAX_HISTORY_BYTES);
    const bytes = Buffer.alloc(size);
    let read = 0;
    while (read < size) {
      const result = await handle.read(bytes, read, size - read, stat.size - size + read);
      if (!result.bytesRead) break;
      read += result.bytesRead;
    }
    const after = await handle.stat();
    if (after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) {
      return { entries: [], notices: ["History changed while reading. Flush your shell history and reload to take a fresh snapshot."] };
    }
    return parseSnapshot(bytes.subarray(0, read), shell, maxItems, stat.size > size);
  } finally {
    await handle.close();
  }
}

export function historyError(error: unknown): string {
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === "ENOENT") return "History file not found. Check History Path and Shell in preferences, or save your shell history and reload.";
  if (code === "EACCES" || code === "EPERM") return "History is not readable. Check file permissions or choose a readable history file in preferences.";
  if (code === "NOT_FILE" || code === "EISDIR") return "History Path must point to a regular file, not a directory or device.";
  return "Could not read history. Check preferences and file access, then reload.";
}
