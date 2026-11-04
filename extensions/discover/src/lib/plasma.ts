import { readdirSync, readFileSync, existsSync, realpathSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { run } from "./system";
import type { Plan } from "./types";

export interface AddonStore {
  id: string;
  title: string;
  file: string;
}
export interface Addon {
  id: string;
  title: string;
  description: string;
  version: string;
  type: string;
  path: string;
  user: boolean;
}
export function addonStores(): AddonStore[] {
  const dir = "/usr/share/knsrcfiles";
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".knsrc"))
    .map((f) => {
      const text = readFileSync(join(dir, f), "utf8");
      return {
        id: f,
        title: /^Name\[en_GB\]=(.*)$/m.exec(text)?.[1] ?? /^Name=(.*)$/m.exec(text)?.[1] ?? f,
        file: join(dir, f),
      };
    });
}
const locations: Record<string, string> = {
  "Plasma/Applet": "plasma/plasmoids",
  "Plasma/Theme": "plasma/desktoptheme",
  "Plasma/LookAndFeel": "plasma/look-and-feel",
  "Plasma/Wallpaper": "plasma/wallpapers",
  "KWin/Script": "kwin/scripts",
  "KWin/Effect": "kwin/effects",
  "KWin/WindowSwitcher": "kwin/tabbox",
  "KSysguard/SensorFace": "ksysguard/sensorfaces",
};
export function installedAddons(): Addon[] {
  const roots = [
    process.env.XDG_DATA_HOME || join(homedir(), ".local/share"),
    ...(process.env.XDG_DATA_DIRS || "/usr/local/share:/usr/share").split(":"),
  ];
  const seen = new Set<string>();
  const result: Addon[] = [];
  for (const root of roots)
    for (const [type, relative] of Object.entries(locations)) {
      const dir = join(root, relative);
      if (!existsSync(dir)) continue;
      for (const id of readdirSync(dir)) {
        const path = join(dir, id);
        if (!existsSync(join(path, "metadata.json"))) continue;
        try {
          const data = JSON.parse(readFileSync(join(path, "metadata.json"), "utf8"));
          const plugin = data.KPlugin || {};
          const key = `${type}:${id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          result.push({
            id,
            title: plugin["Name[en_GB]"] || plugin.Name || id,
            description: plugin["Description[en_GB]"] || plugin.Description || "",
            version: plugin.Version || "",
            type,
            path,
            user: root === roots[0],
          });
        } catch {}
      }
    }
  return result;
}
export function removeAddonPlan(addon: Addon): Plan {
  if (!addon.user) throw new Error("System add-ons must be removed using the package manager.");
  return {
    backend: "plasma",
    title: `Remove ${addon.title}`,
    description: "The user-installed Plasma package will be removed.",
    preview: [addon.type, addon.id],
    commands: [{ file: "kpackagetool6", args: ["--type", addon.type, "--remove", addon.id] }],
  };
}
export async function localPlan(
  path: string,
  type: string,
  scope: "user" | "system",
  name: string,
): Promise<Plan> {
  path = realpathSync(path);
  if (!statSync(path).isFile() && type !== "plasma") throw new Error("Select a package file.");
  if (type === "pacman") {
    if (!/\.pkg\.tar\.(zst|xz|gz|bz2|lz4|lrz|lzo|Z)$/.test(path))
      throw new Error("Select a .pkg.tar.zst or another supported pacman package file.");
    const preview = (await run("pacman", ["-Qip", "--", path])).split("\n");
    return {
      backend: "pacman",
      title: `Install ${basename(path)}`,
      description:
        "Install a local system package using pacman -U. Package signatures are verified according to system policy.",
      preview,
      commands: [{ file: "pkexec", args: ["/usr/bin/pacman", "-U", "--noconfirm", "--", path] }],
    };
  }
  if (type === "flatpak") {
    if (!/\.(flatpak|flatpakref|flatpakrepo)$/.test(path))
      throw new Error("Select a Flatpak package or repository file.");
    const repo = path.endsWith(".flatpakrepo");
    if (repo && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name))
      throw new Error("Enter a source name for the repository file.");
    return {
      backend: "flatpak",
      title: `Install ${basename(path)}`,
      description: `Install the Flatpak file in the ${scope} installation.`,
      preview: [path],
      commands: [
        {
          file: "flatpak",
          args: [
            `--${scope}`,
            ...(repo
              ? ["remote-add", "--from", name, path]
              : ["install", "--noninteractive", "--assumeyes", path]),
          ],
        },
      ],
    };
  }
  if (type !== "plasma") throw new Error("Unknown file type.");
  if (!Object.hasOwn(locations, name)) throw new Error("Invalid Plasma package type.");
  return {
    backend: "plasma",
    title: `Install Plasma package ${basename(path)}`,
    description: "Install in the user scope. System privileges are not required.",
    preview: [path, name],
    commands: [{ file: "kpackagetool6", args: ["--type", name, "--install", path] }],
  };
}
export const plasmaTypes = Object.keys(locations);
