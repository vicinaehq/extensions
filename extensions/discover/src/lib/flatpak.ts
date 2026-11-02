import { assertRef, assertRepo, run } from "./system";
import type { Software, Scope, Plan, Source } from "./types";

export const scopes: Scope[] = ["user", "system"];
export function parseFlatpakList(
  text: string,
  scope: Scope,
  installed = true,
  kind: "app" | "runtime" = "app",
): Software[] {
  return text
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      const [title, summary, rawRef, version, origin] = line.split("\t");
      if (!rawRef || !origin) return [];
      const ref =
        rawRef.startsWith("app/") || rawRef.startsWith("runtime/") ? rawRef : kind + "/" + rawRef;
      const name = ref.split("/")[1];
      return [
        {
          id: `flatpak:${scope}:${origin}:${ref}`,
          backend: "flatpak" as const,
          name,
          title: title || name,
          summary: summary || "",
          ref,
          scope,
          version: version || "",
          source: origin,
          installed,
        },
      ];
    });
}
export async function installedFlatpak(scope: Scope): Promise<Software[]> {
  return parseFlatpakList(
    await run("flatpak", [
      `--${scope}`,
      "list",
      "--app",
      "--columns=name,description,ref,version,origin",
    ]),
    scope,
  );
}
export async function searchFlatpak(query: string, scope: Scope): Promise<Software[]> {
  const [text, arch, installed] = await Promise.all([
    run(
      "flatpak",
      [
        `--${scope}`,
        "search",
        "--columns=name,description,application,version,branch,remotes",
        "--",
        query,
      ],
      { timeout: 60000 },
    ),
    run("flatpak", ["--default-arch"]),
    installedFlatpak(scope),
  ]);
  return text
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      const [title, summary, name, version, branch, remotes] = line.split("\t");
      if (!name || !remotes) return [];
      const ref = `app/${name}/${arch.trim()}/${branch}`;
      return remotes
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((source) => {
          const old = installed.find((x) => x.ref === ref && x.source === source);
          return {
            id: `flatpak:${scope}:${source}:${ref}`,
            backend: "flatpak" as const,
            name,
            title,
            summary,
            version,
            ref,
            scope,
            source,
            installed: !!old,
            installedVersion: old?.version,
          };
        });
    })
    .slice(0, 150);
}
export async function flatpakUpdates(scope: Scope): Promise<Software[]> {
  // Query each kind explicitly: CLI refs may omit their app/runtime prefix.
  const results = await Promise.all(
    (["app", "runtime"] as const).map(async (kind) => {
      const text = await run(
        "flatpak",
        [
          `--${scope}`,
          "remote-ls",
          "--updates",
          `--${kind}`,
          "--columns=name,description,ref,version,origin",
        ],
        { timeout: 60000 },
      );
      return parseFlatpakList(text, scope, true, kind);
    }),
  );
  return results.flat();
}
export async function flatpakDetails(item: Software): Promise<Software> {
  const args = item.installed
    ? ["info", assertRef(item.ref!)]
    : ["remote-info", assertRepo(item.source), assertRef(item.ref!)];
  const description = await run("flatpak", [`--${item.scope!}`, ...args]);
  return { ...item, description };
}
export function flatpakPlan(
  item: Software | undefined,
  action: "install" | "remove" | "update",
  scope: Scope = "user",
): Plan {
  const s = item?.scope ?? scope;
  const args =
    action === "install"
      ? [
          "install",
          "--noninteractive",
          "--assumeyes",
          assertRepo(item!.source),
          assertRef(item!.ref!),
        ]
      : action === "remove"
        ? ["uninstall", "--noninteractive", "--assumeyes", assertRef(item!.ref!)]
        : ["update", "--noninteractive", "--assumeyes", ...(item ? [assertRef(item.ref!)] : [])];
  return {
    backend: "flatpak",
    title:
      action === "install"
        ? `Install ${item!.title}`
        : action === "remove"
          ? `Remove ${item!.title}`
          : `Update Flatpak (${s})`,
    description: `${s === "user" ? "User" : "System"} Flatpak transaction. Required runtimes are included in installations and updates. Removing an application preserves its data.`,
    preview: item
      ? [item.ref!, `Source: ${item.source}`]
      : ["All applications and runtimes in this installation"],
    commands: [{ file: "flatpak", args: [`--${s}`, ...args] }],
  };
}
export async function flatpakSources(scope: Scope): Promise<Source[]> {
  const text = await run("flatpak", [`--${scope}`, "remotes", "--columns=name,title,url,options"]);
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name, title, url, options] = line.split("\t");
      return {
        id: `flatpak:${scope}:${name}`,
        backend: "flatpak",
        title: name,
        description: title,
        url,
        scope,
        enabled: !options?.includes("disabled"),
      };
    });
}
export function flatpakSourcePlan(source: Source, action: "enable" | "disable" | "remove"): Plan {
  return {
    backend: "flatpak",
    title: `${source.title}: ${action === "enable" ? "enable" : action === "disable" ? "disable" : "Remove"}`,
    description: `Flatpak source (${source.scope}). Flatpak may refuse to remove a source used by installed applications.`,
    preview: [source.url],
    commands: [
      {
        file: "flatpak",
        args: [
          `--${source.scope!}`,
          action === "remove" ? "remote-delete" : "remote-modify",
          ...(action === "remove" ? [] : [`--${action}`]),
          assertRepo(source.title),
        ],
      },
    ],
  };
}
export function addFlatpakSource(name: string, url: string, scope: Scope): Plan {
  assertRepo(name);
  const u = new URL(url);
  if (u.protocol !== "https:" || u.username || u.password || !u.pathname.endsWith(".flatpakrepo"))
    throw new Error("Enter an HTTPS URL ending in .flatpakrepo.");
  return {
    backend: "flatpak",
    title: `Add ${name} source`,
    description: `Add the signed Flatpak repository to the ${scope} installation.`,
    preview: [url],
    commands: [{ file: "flatpak", args: [`--${scope}`, "remote-add", "--from", name, url] }],
  };
}
