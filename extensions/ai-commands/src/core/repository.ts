import { randomUUID } from "node:crypto";
import { HARNESS_IDS, type AICommand, type HistoryEntry } from "./types";

export interface StoragePort {
  allItems(): Promise<Record<string, unknown>>;
  getItem(key: string): Promise<unknown>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const COMMAND_PREFIX = "ai-command:v1:";
const HISTORY_PREFIX = "ai-history:v1:";

function decode<T>(raw: unknown, validate: (value: unknown) => value is T): T {
  let value: unknown;
  try {
    value = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    throw new Error(
      "Saved AI Commands data is unreadable. Back up your extension data before resetting it.",
    );
  }
  if (!validate(value))
    throw new Error(
      "Saved AI Commands data has an unsupported format. It has not been overwritten.",
    );
  return value;
}

export function isCommand(value: unknown): value is AICommand {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    item.schemaVersion === 1 &&
    HARNESS_IDS.includes(item.harness as AICommand["harness"]) &&
    [
      "id",
      "name",
      "prompt",
      "systemPrompt",
      "model",
      "effort",
      "createdAt",
      "updatedAt",
    ].every((key) => typeof item[key] === "string") &&
    Boolean(item.id && item.name && item.prompt && item.model)
  );
}

function isHistory(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    item.schemaVersion === 1 &&
    isCommand(item.command) &&
    typeof item.id === "string" &&
    typeof item.createdAt === "string" &&
    typeof item.result === "string" &&
    typeof item.renderedPrompt === "string" &&
    !!item.input &&
    typeof item.input === "object" &&
    Object.values(item.input).every((entry) => typeof entry === "string")
  );
}

export class Repository {
  constructor(private readonly storage: StoragePort) {}

  async commands(): Promise<AICommand[]> {
    return Object.entries(await this.storage.allItems())
      .filter(([key]) => key.startsWith(COMMAND_PREFIX))
      .map(([, value]) => decode(value, isCommand))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async command(id: string): Promise<AICommand> {
    const raw = await this.storage.getItem(COMMAND_PREFIX + id);
    if (raw === undefined || raw === null)
      throw new Error(
        "This AI command no longer exists. Remove its old launcher entry or create a new command.",
      );
    return decode(raw, isCommand);
  }

  async saveCommand(
    values: Omit<AICommand, "id" | "schemaVersion" | "createdAt" | "updatedAt">,
    existing?: AICommand,
  ): Promise<AICommand> {
    const now = new Date().toISOString();
    const command: AICommand = {
      ...values,
      name: values.name.trim(),
      schemaVersion: 1,
      id: existing?.id ?? randomUUID(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    if (!isCommand(command) || !command.prompt.trim())
      throw new Error("Name, prompt, harness, and model are required.");
    // One key per command avoids lost updates between independent extension commands.
    await this.storage.setItem(
      COMMAND_PREFIX + command.id,
      JSON.stringify(command),
    );
    return command;
  }

  async deleteCommand(id: string): Promise<void> {
    await this.storage.removeItem(COMMAND_PREFIX + id);
  }

  async history(): Promise<HistoryEntry[]> {
    return Object.entries(await this.storage.allItems())
      .filter(([key]) => key.startsWith(HISTORY_PREFIX))
      .map(([, value]) => decode(value, isHistory))
      .sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
      );
  }

  async saveHistory(
    entry: Omit<HistoryEntry, "id" | "createdAt" | "schemaVersion">,
  ): Promise<void> {
    const record: HistoryEntry = {
      ...entry,
      schemaVersion: 1,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    await this.storage.setItem(
      HISTORY_PREFIX + record.id,
      JSON.stringify(record),
    );
    const history = await this.history();
    let characters = 0;
    for (let index = 0; index < history.length; index++) {
      const item = history[index]!;
      characters += JSON.stringify(item).length;
      if (index >= 100 || characters > 5_000_000)
        await this.storage.removeItem(HISTORY_PREFIX + item.id);
    }
  }

  async clearHistory(): Promise<void> {
    const keys = Object.keys(await this.storage.allItems()).filter((key) =>
      key.startsWith(HISTORY_PREFIX),
    );
    await Promise.all(keys.map((key) => this.storage.removeItem(key)));
  }
}
