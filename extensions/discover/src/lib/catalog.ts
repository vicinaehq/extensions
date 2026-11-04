import type { Backend, Batch, Software, Source } from "./types";
import { binary, collect, run } from "./system";
import { searchPacman, pacmanDetails, pacmanUpdates, pacmanSources } from "./pacman";
import { searchAur, aurDetails, aurUpdates } from "./aur";
import {
  installedFlatpak,
  searchFlatpak,
  flatpakUpdates,
  flatpakDetails,
  flatpakSources,
  scopes,
} from "./flatpak";
import { firmware, firmwareSources } from "./firmware";

export type Filter = "all" | Backend;
const available = (filter: Filter, backend: Backend, command: string) =>
  (filter === "all" || filter === backend) && !!binary(command);
export async function search(
  query: string,
  filter: Filter,
  aur: boolean,
): Promise<Batch<Software>> {
  const result = await collect([
    ...(available(filter, "pacman", "pacman")
      ? [{ label: "System repositories", run: () => searchPacman(query) }]
      : []),
    ...(aur && (filter === "all" || filter === "aur") && query.length >= 2
      ? [{ label: "AUR", run: () => searchAur(query) }]
      : []),
    ...(available(filter, "flatpak", "flatpak") && query
      ? scopes.map((scope) => ({
          label: `Flatpak (${scope})`,
          run: () => searchFlatpak(query, scope),
        }))
      : []),
    ...(filter === "fwupd" && binary("fwupdmgr")
      ? [
          {
            label: "Firmware",
            run: async () => {
              const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
              return (await firmware()).filter((item) =>
                terms.every((term) => `${item.title} ${item.summary}`.toLowerCase().includes(term)),
              );
            },
          },
        ]
      : []),
  ]);
  if (filter === "flatpak" && !binary("flatpak"))
    result.warnings.push("Flatpak is not installed. Install it from System and Support.");
  return result;
}
export async function installed(filter: Filter): Promise<Batch<Software>> {
  const result = await collect([
    ...((filter === "all" || filter === "pacman" || filter === "aur") && binary("pacman")
      ? [
          {
            label: "System packages",
            run: async () => {
              const [items, foreign] = await Promise.all([
                searchPacman("", true),
                run("pacman", ["-Qmq"], { codes: [1] }),
              ]);
              const names = new Set(foreign.trim().split("\n"));
              return items
                .map((x) =>
                  names.has(x.name)
                    ? {
                        ...x,
                        id: `aur:${x.name}`,
                        backend: "aur" as const,
                        source: "AUR / local package",
                      }
                    : x,
                )
                .filter((x) => filter === "all" || x.backend === filter);
            },
          },
        ]
      : []),
    ...(available(filter, "flatpak", "flatpak")
      ? scopes.map((scope) => ({ label: `Flatpak (${scope})`, run: () => installedFlatpak(scope) }))
      : []),
    ...(available(filter, "fwupd", "fwupdmgr")
      ? [{ label: "Firmware", run: () => firmware() }]
      : []),
  ]);
  return result;
}
export async function updates(fresh = false): Promise<Batch<Software>> {
  return collect([
    ...(binary("pacman") ? [{ label: "System", run: () => pacmanUpdates(fresh) }] : []),
    ...(binary("paru") || binary("yay") ? [{ label: "AUR", run: aurUpdates }] : []),
    ...(binary("flatpak")
      ? scopes.map((scope) => ({ label: `Flatpak (${scope})`, run: () => flatpakUpdates(scope) }))
      : []),
    ...(binary("fwupdmgr") ? [{ label: "Firmware", run: () => firmware(true) }] : []),
  ]);
}
export async function sources(): Promise<Batch<Source>> {
  return collect([
    ...(binary("pacman-conf") ? [{ label: "System", run: pacmanSources }] : []),
    ...(binary("flatpak")
      ? scopes.map((scope) => ({ label: `Flatpak (${scope})`, run: () => flatpakSources(scope) }))
      : []),
    ...(binary("fwupdmgr") ? [{ label: "Firmware", run: firmwareSources }] : []),
  ]);
}
export async function details(item: Software, assets: string): Promise<Software> {
  let result = await (item.backend === "pacman" || (item.backend === "aur" && item.installed)
    ? pacmanDetails(item)
    : item.backend === "flatpak"
      ? flatpakDetails(item)
      : Promise.resolve(item));
  if (item.backend === "aur") {
    try {
      const aur = await aurDetails(item);
      result = {
        ...result,
        ...aur,
        desktopId: result.desktopId,
        details: { ...result.details, ...aur.details },
      };
    } catch {
      /* Local/foreign packages may have no AUR entry. */
    }
  }
  if (item.backend === "fwupd" || !binary("python3")) return result;
  try {
    const text = await run("python3", [`${assets}/appstream.py`, item.name], { timeout: 10000 });
    const data = JSON.parse(text) as {
      id: string;
      title: string;
      summary: string;
      description: string;
      packages: string[];
      desktopIds: string[];
      url?: string;
      screenshots: string[];
    }[];
    const meta = data.find(
      (x) =>
        x.packages.includes(item.name) ||
        x.desktopIds.includes(item.name + ".desktop") ||
        x.id === item.name,
    );
    if (meta)
      return {
        ...result,
        title: meta.title || result.title,
        summary: meta.summary || result.summary,
        description: meta.description?.replace(/<[^>]*>/g, " ") || result.description,
        url: meta.url || result.url,
        screenshots: meta.screenshots,
      };
  } catch {
    /* AppStream is optional; package manager metadata remains available. */
  }
  return result;
}
