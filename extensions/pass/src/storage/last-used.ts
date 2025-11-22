import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { LastUsedRecord } from "@/types";

const STORAGE_DIR = path.join(os.homedir(), ".local", "state", "vicinae-pass");
const STORAGE_FILE = path.join(STORAGE_DIR, "last-used.json");

export async function getLastUsedPassword(ttlSeconds: number): Promise<LastUsedRecord | null> {
  try {
    const buffer = await fs.readFile(STORAGE_FILE, "utf-8");
    if (!buffer) return null;

    const parsed = JSON.parse(buffer) as LastUsedRecord;
    if (!parsed?.password || !parsed.option || !parsed.timestamp) {
      return null;
    }

    const delta = Date.now() - Number(parsed.timestamp);
    if (delta / 1000 > ttlSeconds) {
      return null;
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    console.error("Failed to read last-used cache:", error);
    return null;
  }
}

export async function updateLastUsedPassword(password: string, option: string): Promise<void> {
  try {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
    const payload: LastUsedRecord = {
      password,
      option,
      timestamp: Date.now(),
    };
    await fs.writeFile(STORAGE_FILE, JSON.stringify(payload));
  } catch (error) {
    console.error("Failed to persist last-used cache:", error);
  }
}
