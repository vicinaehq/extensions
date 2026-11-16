/** Builds a throwaway Steam directory tree for tests. */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export function makeTempDir(prefix = "gl-test-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function writeFile(path: string, content: string | Buffer = "x"): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
  return path;
}

export function manifest(fields: { appid: number; name: string; installdir: string; StateFlags?: number; LastPlayed?: number; SizeOnDisk?: number }) {
  const lines = Object.entries({ StateFlags: 4, ...fields })
    .map(([k, v]) => `\t"${k}"\t\t"${v}"`)
    .join("\n");
  return `"AppState"\n{\n${lines}\n}\n`;
}

export function libraryFolders(paths: string[]) {
  const entries = paths.map((p, i) => `\t"${i}"\n\t{\n\t\t"path"\t\t"${p}"\n\t\t"apps"\n\t\t{\n\t\t}\n\t}`).join("\n");
  return `"libraryfolders"\n{\n${entries}\n}\n`;
}

export function localConfig(apps: Record<number, { LastPlayed?: number; Playtime?: number }>) {
  const entries = Object.entries(apps)
    .map(
      ([id, v]) =>
        `\t\t\t\t\t"${id}"\n\t\t\t\t\t{\n` +
        Object.entries(v)
          .map(([k, val]) => `\t\t\t\t\t\t"${k}"\t\t"${val}"`)
          .join("\n") +
        `\n\t\t\t\t\t}`,
    )
    .join("\n");
  return `"UserLocalConfigStore"\n{\n\t"Software"\n\t{\n\t\t"Valve"\n\t\t{\n\t\t\t"Steam"\n\t\t\t{\n\t\t\t\t"apps"\n\t\t\t\t{\n${entries}\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n}\n`;
}
