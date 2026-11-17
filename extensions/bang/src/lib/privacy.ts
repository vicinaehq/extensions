/** Conservative heuristics, not a secret detector or security boundary. */
export function hasLikelySecret(command: string): boolean {
  return /(?:password|passwd|token|secret|api[_-]?key|authorization)\s*(?:=|:|\s)\s*\S|(?:^|\s)(?:-p|--password|--token)\s*\S|\w+:\/\/[^\s/@]+:[^\s/@]+@|\b(?:gh[pousr]_[A-Za-z0-9]+|AKIA[A-Z0-9]{16})\b/i.test(command);
}

export function previewCommand(command: string): string {
  if (hasLikelySecret(command)) return "Sensitive command — review to reveal";
  return command.replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, c => c === "\n" ? " ↵ " : c === "\t" ? " ⇥ " : "�").slice(0, 220);
}

export function commandProblem(command: string): string | undefined {
  if (!command.trim()) return "Enter a command first.";
  if (Buffer.byteLength(command, "utf8") > 64 * 1024) return "Command exceeds the 64 KiB safety limit. Shorten it before running.";
  if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\ufffd\u202a-\u202e\u2066-\u2069]/.test(command)) return "Command contains invalid encoding or hidden control characters. Replace them in the editor before running.";
  return undefined;
}
