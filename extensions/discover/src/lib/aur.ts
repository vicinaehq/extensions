import { assertPackage, binary, run } from "./system";
import { parseUpdates } from "./pacman";
import type { Software, Plan } from "./types";

interface AurResult {
  Name: string;
  Version: string;
  Description: string | null;
  URL: string | null;
  URLPath: string;
  Maintainer: string | null;
  NumVotes: number;
  Popularity: number;
  OutOfDate: number | null;
  Depends?: string[];
  MakeDepends?: string[];
  License?: string[];
}
async function rpc(url: URL, signal?: AbortSignal): Promise<AurResult[]> {
  const r = await fetch(url, { signal: signal ?? AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`AUR: HTTP ${r.status}`);
  const data = (await r.json()) as { results: AurResult[]; error?: string };
  if (data.error) throw new Error(data.error);
  return data.results;
}
export function aurItem(r: AurResult, installedVersion?: string): Software {
  return {
    id: `aur:${r.Name}`,
    backend: "aur",
    name: r.Name,
    title: r.Name,
    summary: r.Description || "",
    version: r.Version,
    installed: !!installedVersion,
    installedVersion,
    source: "AUR",
    url: r.URL || undefined,
    details: {
      Maintainer: r.Maintainer || "Orphaned",
      Votes: String(r.NumVotes),
      Status: r.OutOfDate ? "Flagged out of date" : "Up to date",
      Dependencies: (r.Depends || []).join(", "),
      "Build dependencies": (r.MakeDepends || []).join(", "),
      License: (r.License || []).join(", "),
    },
  };
}
export async function searchAur(query: string, signal?: AbortSignal): Promise<Software[]> {
  if (query.trim().length < 2) return [];
  const u = new URL("https://aur.archlinux.org/rpc/v5/search/" + encodeURIComponent(query.trim()));
  u.searchParams.set("by", "name-desc");
  const [results, installed] = await Promise.all([rpc(u, signal), run("pacman", ["-Q"])]);
  const versions = new Map(
    installed
      .trim()
      .split("\n")
      .map((x) => x.split(" ") as [string, string]),
  );
  return results
    .sort(
      (a, b) =>
        Number(b.Name === query.trim()) - Number(a.Name === query.trim()) ||
        b.Popularity - a.Popularity,
    )
    .slice(0, 100)
    .map((r) => aurItem(r, versions.get(r.Name)));
}
export async function aurDetails(item: Software): Promise<Software> {
  const u = new URL("https://aur.archlinux.org/rpc/v5/info");
  u.searchParams.append("arg[]", assertPackage(item.name));
  const r = (await rpc(u))[0];
  return r ? { ...item, ...aurItem(r, item.installedVersion) } : item;
}
export async function aurUpdates(): Promise<Software[]> {
  const helper = binary("paru") ? "paru" : binary("yay") ? "yay" : undefined;
  if (!helper) throw new Error("AUR updates require paru or yay.");
  return parseUpdates(await run(helper, ["-Qua"], { codes: [1], timeout: 60000 })).map((x) => ({
    ...x,
    id: `aur:${x.name}`,
    backend: "aur",
    source: "AUR",
  }));
}
export function aurPlan(item?: Software): Plan {
  const helper = binary("paru") ?? binary("yay");
  if (!helper) throw new Error("AUR installation requires paru or yay.");
  return {
    backend: "aur",
    title: item ? `Install ${item.name} from AUR` : "Update system and AUR packages",
    description:
      "AUR packages are community-maintained. Review PKGBUILDs, dependencies and build options in an interactive terminal. The helper runs as your normal user and requests authentication when needed. This also performs a full system upgrade.",
    preview: item ? [item.name + " " + item.version] : ["All system and AUR updates"],
    commands: [
      {
        file: helper,
        args: ["-Syu", ...(item ? ["--", assertPackage(item.name)] : [])],
        terminal: true,
      },
    ],
  };
}
