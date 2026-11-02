import { assertPackage, assertRepo, literalRegex, run } from "./system";
import type { Software, Plan, Source } from "./types";

export function parseSearch(text: string, local = false): Software[] {
  const result: Software[] = [];
  const seen = new Set<string>();
  let current: Software | undefined;
  for (const line of text.split("\n")) {
    const m = /^([^/\s]+)\/([^\s]+)\s+(\S+)(.*)$/.exec(line);
    if (m) {
      const [, repo, name, version, tail] = m;
      current = seen.has(name)
        ? undefined
        : {
            id: `pacman:${name}`,
            backend: "pacman",
            name,
            title: name,
            version,
            source: local ? "Installed package" : repo,
            summary: "",
            installed: local || tail.includes("[installed"),
            installedVersion: local
              ? version
              : tail.includes("[installed")
                ? /\[installed(?:: ([^\]]+))?\]/.exec(tail)?.[1] || version
                : undefined,
          };
      if (current) {
        result.push(current);
        seen.add(name);
      }
    } else if (current && /^\s+\S/.test(line))
      current.summary += (current.summary ? " " : "") + line.trim();
  }
  return result;
}
export function parseInfo(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  let last = "";
  for (const line of text.split("\n")) {
    const m = /^([^\s].*?)\s+: (.*)$/.exec(line);
    if (m) {
      last = m[1].trim();
      out[last] = m[2].trim();
    } else if (last && /^\s+\S/.test(line)) out[last] += "\n" + line.trim();
  }
  return out;
}
export async function searchPacman(query: string, installed = false): Promise<Software[]> {
  const terms = query.trim().split(/\s+/).filter(Boolean).map(literalRegex);
  const args = installed ? ["-Qs"] : ["-Ss"];
  const text = await run("pacman", [...args, "--color", "never", "--", ...terms], { codes: [1] });
  const items = parseSearch(text, installed);
  if (installed) return items;
  const needle = query.trim().toLowerCase();
  const rank = (item: Software) =>
    item.name.toLowerCase() === needle
      ? 0
      : item.name.toLowerCase().startsWith(needle)
        ? 1
        : item.name.toLowerCase().includes(needle)
          ? 2
          : 3;
  return items.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)).slice(0, 250);
}
export async function pacmanDetails(item: Software): Promise<Software> {
  const info = parseInfo(
    await run("pacman", [
      item.installed ? "-Qi" : "-Si",
      "--",
      item.installed
        ? assertPackage(item.name)
        : `${assertRepo(item.source)}/${assertPackage(item.name)}`,
    ]),
  );
  let desktopId: string | undefined;
  if (item.installed) {
    const files = await run("pacman", ["-Qlq", "--", item.name]);
    desktopId = files
      .split("\n")
      .find((p) => /^\/usr\/share\/applications\/[^/]+\.desktop$/.test(p));
  }
  return { ...item, details: info, url: info.URL !== "None" ? info.URL : undefined, desktopId };
}
export function parseUpdates(text: string): Software[] {
  return text.split("\n").flatMap((line) => {
    const m = /^(\S+) (\S+) -> (\S+)(?:\s.*)?$/.exec(line);
    return m
      ? [
          {
            id: `pacman:${m[1]}`,
            backend: "pacman" as const,
            name: m[1],
            title: m[1],
            version: m[3],
            installedVersion: m[2],
            source: "System repositories",
            installed: true,
            summary: `${m[2]} → ${m[3]}`,
          },
        ]
      : [];
  });
}
export async function pacmanUpdates(fresh = false): Promise<Software[]> {
  return parseUpdates(
    await run(fresh ? "checkupdates" : "pacman", fresh ? [] : ["-Qu"], {
      codes: fresh ? [2] : [1],
      timeout: 120000,
    }),
  );
}
export async function pacmanPlan(
  item: Software | undefined,
  action: "install" | "remove" | "update",
): Promise<Plan> {
  const name = item ? assertPackage(item.name) : "";
  let preview: string[] = [];
  const target = item && action === "install" ? `${assertRepo(item.source)}/${name}` : "";
  if (action === "remove") {
    const text = await run("pacman", ["-Rp", "--print-format", "%n %v", "--", name]);
    preview = text.trim().split("\n").filter(Boolean);
  } else {
    const text = await run("pacman", [
      "-Sup",
      "--print-format",
      "%n %v",
      ...(action === "install" ? ["--needed", "--", target] : []),
    ]);
    preview = text.trim().split("\n").filter(Boolean);
  }
  return {
    backend: "pacman",
    title:
      action === "remove"
        ? `Remove ${name}`
        : action === "install"
          ? `Install ${name} and update system`
          : "Update system",
    description:
      action === "remove"
        ? "Only the selected package is removed. Pacman refuses removal if another package requires it."
        : "CachyOS/Arch repository refresh and FULL system upgrade run together. This preview uses the current local database; the package list can change after refresh. Other installed packages may also be upgraded.",
    preview,
    commands: [
      {
        file: "pkexec",
        args: [
          "/usr/bin/pacman",
          ...(action === "remove"
            ? ["-R", "--noconfirm", "--", name]
            : ["-Syu", "--needed", "--noconfirm", ...(action === "install" ? ["--", target] : [])]),
        ],
      },
    ],
  };
}
export async function pacmanSources(): Promise<Source[]> {
  const names = (await run("pacman-conf", ["--repo-list"])).trim().split("\n").filter(Boolean);
  return Promise.all(
    names.map(async (name) => ({
      id: `pacman:${name}`,
      title: name,
      backend: "pacman" as const,
      enabled: true,
      url: (await run("pacman-conf", ["--repo", name, "Server"])).trim(),
      description:
        "Repository priority follows pacman.conf order. Edit repositories through the system configuration.",
    })),
  );
}
