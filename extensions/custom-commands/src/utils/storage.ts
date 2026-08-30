import { LocalStorage } from "@vicinae/api";
import type { CustomCommand, CreateCommandInput, UpdateCommandInput } from "../types";

const STORAGE_KEY = "custom-commands:commands";

function generateId(): string {
  return crypto.randomUUID();
}

export async function loadCommands(): Promise<CustomCommand[]> {
  try {
    const data = await LocalStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    const parsed = JSON.parse(String(data));
    if (!Array.isArray(parsed)) {
      console.warn("Invalid storage format for custom commands");
      return [];
    }
    return parsed as CustomCommand[];
  } catch (error) {
    console.error("Failed to load commands:", error);
    return [];
  }
}

export async function saveCommands(commands: CustomCommand[]): Promise<void> {
  await LocalStorage.setItem(STORAGE_KEY, JSON.stringify(commands));
}

export async function addCommand(input: CreateCommandInput): Promise<CustomCommand> {
  const commands = await loadCommands();
  const newCommand: CustomCommand = {
    id: generateId(),
    name: input.name.trim(),
    command: input.command.trim(),
    description: input.description?.trim() || undefined,
    workdir: input.workdir?.trim() || undefined,
    terminal: input.terminal ?? false,
    icon: input.icon?.trim() || undefined,
    group: input.group?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  commands.push(newCommand);
  await saveCommands(commands);
  return newCommand;
}

export async function updateCommand(id: string, updates: UpdateCommandInput): Promise<CustomCommand | null> {
  const commands = await loadCommands();
  const index = commands.findIndex((c) => c.id === id);
  if (index === -1) return null;
  const updated: CustomCommand = {
    ...commands[index],
    ...Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined)),
    name: updates.name !== undefined ? updates.name.trim() : commands[index].name,
    command: updates.command !== undefined ? updates.command.trim() : commands[index].command,
    description: updates.description !== undefined ? updates.description?.trim() || undefined : commands[index].description,
    workdir: updates.workdir !== undefined ? updates.workdir?.trim() || undefined : commands[index].workdir,
    icon: updates.icon !== undefined ? updates.icon?.trim() || undefined : commands[index].icon,
    group: updates.group !== undefined ? updates.group?.trim() || undefined : commands[index].group,
  } as CustomCommand;
  commands[index] = updated;
  await saveCommands(commands);
  return updated;
}

export async function deleteCommand(id: string): Promise<boolean> {
  const commands = await loadCommands();
  const index = commands.findIndex((c) => c.id === id);
  if (index === -1) return false;
  commands.splice(index, 1);
  await saveCommands(commands);
  return true;
}

export async function duplicateCommand(id: string): Promise<CustomCommand | null> {
  const commands = await loadCommands();
  const original = commands.find((c) => c.id === id);
  if (!original) return null;
  const dup: CustomCommand = {
    ...original,
    id: generateId(),
    name: `${original.name} copy`,
    createdAt: new Date().toISOString(),
  };
  commands.push(dup);
  await saveCommands(commands);
  return dup;
}
