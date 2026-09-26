import { constants } from "node:fs";
import { access, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { runProcess } from "../utils/process";
import {
  appStreamSearchTerm,
  parseAppStreamSearchOutput,
  type AppStreamComponent,
} from "./appstream-parsing";

const APPSTREAM_CLI = "/usr/bin/appstreamcli";
const APPSTREAM_ENV = { ...process.env, LC_ALL: "C", LANG: "C" };
const SEARCH_LIMIT = 100;
const SEARCH_MAX_LINES = 1_200;
const SEARCH_TIMEOUT_MS = 5_000;
const DETAILS_TIMEOUT_MS = 3_000;
const ICON_SIZES = ["128x128", "64x64", "48x48"] as const;

export class AppStreamBackend {
  private iconDirectories?: Promise<string[]>;
  private readonly iconCache = new Map<string, string | null>();

  async search(
    query: string,
    signal?: AbortSignal,
  ): Promise<AppStreamComponent[]> {
    const normalizedQuery = query.trim().slice(0, 100);
    if (normalizedQuery.length < 2) return [];
    await access(APPSTREAM_CLI, constants.X_OK);

    const result = await runProcess(
      APPSTREAM_CLI,
      [
        "search",
        "--no-color",
        "--",
        appStreamSearchTerm(normalizedQuery),
      ],
      {
        signal,
        env: APPSTREAM_ENV,
        maxLines: SEARCH_MAX_LINES,
        maxOutputBytes: 768 * 1024,
        timeoutMs: SEARCH_TIMEOUT_MS,
      },
    );
    signal?.throwIfAborted();

    return this.resolveIcons(
      parseAppStreamSearchOutput(result.stdout, SEARCH_LIMIT),
      signal,
    );
  }

  async getDetails(
    componentId: string,
    signal?: AbortSignal,
  ): Promise<AppStreamComponent[]> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(componentId)) return [];
    await access(APPSTREAM_CLI, constants.X_OK);
    const result = await runProcess(
      APPSTREAM_CLI,
      ["get", "--details", "--no-color", "--", componentId],
      {
        signal,
        env: APPSTREAM_ENV,
        maxOutputBytes: 768 * 1024,
        timeoutMs: DETAILS_TIMEOUT_MS,
      },
    );
    signal?.throwIfAborted();
    return this.resolveIcons(parseAppStreamSearchOutput(result.stdout, 10), signal);
  }

  private async resolveIcons(
    components: readonly AppStreamComponent[],
    signal?: AbortSignal,
  ): Promise<AppStreamComponent[]> {
    const enriched = await Promise.all(components.map(async (component) => {
      if (!component.iconName || component.kind !== "desktop-application") {
        return component;
      }
      const iconPath = await this.resolveIcon(component.iconName, signal);
      return iconPath ? { ...component, iconPath } : component;
    }));
    signal?.throwIfAborted();
    return enriched;
  }

  private async resolveIcon(
    iconName: string,
    signal?: AbortSignal,
  ): Promise<string | undefined> {
    if (this.iconCache.has(iconName)) {
      return this.iconCache.get(iconName) ?? undefined;
    }

    const path = await this.findIcon(iconName, signal);
    signal?.throwIfAborted();
    this.iconCache.set(iconName, path ?? null);
    return path;
  }

  private async findIcon(
    iconName: string,
    signal?: AbortSignal,
  ): Promise<string | undefined> {
    const directories = await (this.iconDirectories ??= collectIconDirectories());
    for (const directory of directories) {
      signal?.throwIfAborted();
      const path = join(directory, iconName);
      try {
        await access(path, constants.R_OK);
        return path;
      } catch {
        // Try the next fixed AppStream icon cache directory.
      }
    }
    return undefined;
  }
}

async function collectIconDirectories(): Promise<string[]> {
  const directories: string[] = [];

  for (const root of ["/var/lib/swcatalog/icons", "/usr/share/swcatalog/icons"]) {
    for (const collection of await childDirectories(root)) {
      for (const size of ICON_SIZES) directories.push(join(root, collection, size));
    }
  }

  for (const root of [
    join(homedir(), ".local/share/flatpak/appstream"),
    "/var/lib/flatpak/appstream",
  ]) {
    for (const remote of await childDirectories(root)) {
      const remotePath = join(root, remote);
      for (const architecture of await childDirectories(remotePath)) {
        const iconsPath = join(remotePath, architecture, "active/icons");
        for (const size of ICON_SIZES) directories.push(join(iconsPath, size));
      }
    }
  }

  return directories;
}

async function childDirectories(path: string): Promise<string[]> {
  try {
    return (await readdir(path, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

export const appStreamBackend = new AppStreamBackend();
