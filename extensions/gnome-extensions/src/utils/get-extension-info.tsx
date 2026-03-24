import { GnomeExtension } from "../interfaces/gnome-extension";
import { executeCommand } from "./execute-command";
import { getNameFromUuid } from "./get-name-from-uuid";

export async function getExtensionInfo(uuid: string): Promise<Partial<GnomeExtension>> {
  const result = await executeCommand(`gnome-extensions info "${uuid}"`);

  if (result.error || !result.stdout) {
    return {
      name: getNameFromUuid(uuid),
      description: "",
      enabled: true,
    };
  }

  const lines = result.stdout.split("\n");
  const info: Partial<GnomeExtension> = {
    name: getNameFromUuid(uuid),
    description: "",
    enabled: true,
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("Name:")) {
      info.name = trimmed.replace("Name:", "").trim();
    } else if (trimmed.startsWith("Description:")) {
      info.description = trimmed.replace("Description:", "").trim();
    } else if (trimmed.startsWith("Version:")) {
      info.version = trimmed.replace("Version:", "").trim();
    } else if (trimmed.startsWith("Enabled:")) {
      const state = trimmed.replace("Enabled:", "").trim();
      info.enabled = "yes" === state.toLowerCase();
    } else if (trimmed.startsWith("State:")) {
      info.state = trimmed.replace("State:", "").trim();
    } else if (trimmed.startsWith("Author:")) {
      info.author = trimmed.replace("Author:", "").trim();
    } else if (trimmed.startsWith("Path:")) {
      info.path = trimmed.replace("Path:", "").trim();
    } else if (trimmed.startsWith("URL:")) {
      info.url = trimmed.replace("URL:", "").trim();
    }
  }

  return info;
}
