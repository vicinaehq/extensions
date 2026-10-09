import { appendFile, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadSnapshot, Store } from "../src/snapshot";
import { payload } from "./fixtures";

export function fileStore(directory: string): Store {
  return {
    async get(key) {
      try {
        return await readFile(path.join(directory, `${key}.json`), "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
          return undefined;
        throw error;
      }
    },
    async set(key, value) {
      const file = path.join(directory, `${key}.json`);
      await writeFile(`${file}.${process.pid}`, value);
      await rename(`${file}.${process.pid}`, file);
    },
  };
}

if (process.argv[1]?.endsWith("worker.ts")) {
  const directory = process.argv[2];
  loadSnapshot("test-key", {
    directory,
    store: fileStore(directory),
    now: () => 1_000_000,
    request: async () => {
      await appendFile(path.join(directory, "requests"), "request\n");
      if (process.argv[3] === "crash") process.exit(37);
      await new Promise((resolve) => setTimeout(resolve, 250));
      return Response.json(payload);
    },
  }).then((result) => process.stdout.write(JSON.stringify(result)));
}
