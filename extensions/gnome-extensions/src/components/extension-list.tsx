import { access } from "node:fs/promises";
import { join } from "node:path";
import { GnomeExtension } from "../interfaces/gnome-extension";
import { executeCommand } from "../utils/execute-command";
import { getExtensionInfo } from "../utils/get-extension-info";
import { getSettingsSchema } from "../utils/get-settings-schema";
import { getNameFromUuid } from "../utils/get-name-from-uuid";

async function hasPrefsFile(path?: string): Promise<boolean> {
  if (!path) return false;
  try {
    await access(join(path, "prefs.js"));
    return true;
  } catch {
    return false;
  }
}

function parseSimpleList(output: string): string[] {
  return output
    .split("\n")
    .map(line => line.trim())
    .filter(line => 0 < line.length);
}

export async function extensionList(): Promise<GnomeExtension[]> {
  const enabledResult = await executeCommand("gnome-extensions list --enabled");
  const disabledResult = await executeCommand("gnome-extensions list --disabled");

  const enabledUuids = enabledResult.stdout ? parseSimpleList(enabledResult.stdout) : [];
  const disabledUuids = disabledResult.stdout ? parseSimpleList(disabledResult.stdout) : [];

  if (0 === enabledUuids.length && 0 === disabledUuids.length) {
    return [];
  }

  const allUuids = [...enabledUuids, ...disabledUuids];
  const extensions: GnomeExtension[] = [];

  for (const uuid of allUuids) {
    const info = await getExtensionInfo(uuid);
    const [settingsSchema, hasPrefs] = await Promise.all([
      getSettingsSchema(info.path),
      hasPrefsFile(info.path),
    ]);
    extensions.push({
      uuid,
      name: info.name || getNameFromUuid(uuid),
      description: info.description || "",
      enabled: enabledUuids.includes(uuid),
      version: info.version,
      author: info.author,
      path: info.path,
      url: info.url,
      state: info.state,
      settingsSchema,
      hasPrefs,
    });
  }

  return extensions;
}
