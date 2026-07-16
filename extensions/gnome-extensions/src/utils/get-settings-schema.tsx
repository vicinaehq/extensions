import { join } from "node:path";
import { readFile } from "node:fs/promises";

export async function getSettingsSchema(path?: string): Promise<string | undefined> {
  if (!path) return undefined;

  try {
    const metadataPath = join(path, "metadata.json");
    const content = await readFile(metadataPath, "utf-8");
    const metadata = JSON.parse(content);
    return metadata["settings-schema"];
  } catch {
    return undefined;
  }
}
