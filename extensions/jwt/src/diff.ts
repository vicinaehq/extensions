import type { Claims } from "./jwt.ts";

export type ChangeKind = "added" | "removed" | "changed";

export type Change = {
  key: string;
  kind: ChangeKind;
  previous?: unknown;
  current?: unknown;
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Claim-level diff of two decoded sections, ordered added → changed → removed, then by key. */
export function diffClaims(previous: Claims, current: Claims): Change[] {
  const keys = new Set([...Object.keys(previous), ...Object.keys(current)]);
  const changes: Change[] = [];

  for (const key of keys) {
    const inPrevious = key in previous;
    const inCurrent = key in current;

    if (inPrevious && !inCurrent) changes.push({ key, kind: "removed", previous: previous[key] });
    else if (!inPrevious && inCurrent) changes.push({ key, kind: "added", current: current[key] });
    else if (!same(previous[key], current[key])) {
      changes.push({ key, kind: "changed", previous: previous[key], current: current[key] });
    }
  }

  const rank: Record<ChangeKind, number> = { added: 0, changed: 1, removed: 2 };
  return changes.sort((a, b) => rank[a.kind] - rank[b.kind] || a.key.localeCompare(b.key));
}

export type DiffLine = { kind: "add" | "remove" | "context"; text: string };

/** Longest common subsequence of lines, the basis of a unified diff. */
function commonLines(previous: string[], current: string[]): number[][] {
  const table: number[][] = Array.from({ length: previous.length + 1 }, () =>
    new Array<number>(current.length + 1).fill(0),
  );

  for (let i = previous.length - 1; i >= 0; i--) {
    for (let j = current.length - 1; j >= 0; j--) {
      table[i]![j] =
        previous[i] === current[j]
          ? table[i + 1]![j + 1]! + 1
          : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  return table;
}

export function diffLines(previous: string[], current: string[]): DiffLine[] {
  const table = commonLines(previous, current);
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;

  while (i < previous.length && j < current.length) {
    if (previous[i] === current[j]) {
      lines.push({ kind: "context", text: previous[i]! });
      i++;
      j++;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      lines.push({ kind: "remove", text: previous[i]! });
      i++;
    } else {
      lines.push({ kind: "add", text: current[j]! });
      j++;
    }
  }
  while (i < previous.length) lines.push({ kind: "remove", text: previous[i++]! });
  while (j < current.length) lines.push({ kind: "add", text: current[j++]! });

  return lines;
}

const MARKERS = { add: "+", remove: "-", context: " " } as const;

/**
 * A unified diff body, with unchanged runs collapsed to `context` lines either side
 * of a change so a large payload still shows only what moved.
 */
export function unifiedDiff(previous: string, current: string, context = 3): string {
  const lines = diffLines(previous.split("\n"), current.split("\n"));
  if (lines.every((line) => line.kind === "context")) return "";

  const keep = new Set<number>();
  lines.forEach((line, index) => {
    if (line.kind === "context") return;
    for (let n = index - context; n <= index + context; n++) {
      if (n >= 0 && n < lines.length) keep.add(n);
    }
  });

  const out: string[] = [];
  let previousIndex = -1;
  for (const index of [...keep].sort((a, b) => a - b)) {
    if (previousIndex !== -1 && index > previousIndex + 1) out.push("@@");
    out.push(`${MARKERS[lines[index]!.kind]}${lines[index]!.text}`);
    previousIndex = index;
  }
  return out.join("\n");
}
