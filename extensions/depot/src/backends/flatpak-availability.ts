import { constants } from "node:fs";
import { access } from "node:fs/promises";

export async function requireFlatpakExecutable(path: string): Promise<void> {
  await access(path, constants.X_OK);
}
