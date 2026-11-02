export type Backend = "pacman" | "aur" | "flatpak" | "fwupd";
export type Scope = "user" | "system";
export interface Software {
  id: string;
  backend: Backend;
  name: string;
  title: string;
  version: string;
  summary: string;
  installed: boolean;
  source: string;
  installedVersion?: string;
  scope?: Scope;
  ref?: string;
  url?: string;
  icon?: string;
  description?: string;
  details?: Record<string, string>;
  desktopId?: string;
  screenshots?: string[];
}
export interface Batch<T> {
  items: T[];
  warnings: string[];
}
export interface CommandSpec {
  file: string;
  args: string[];
  terminal?: boolean;
  acceptedCodes?: number[];
}
export interface Plan {
  title: string;
  description: string;
  commands: CommandSpec[];
  preview: string[];
  backend: Backend | "plasma";
}
export interface Source {
  id: string;
  title: string;
  backend: Backend;
  url: string;
  enabled: boolean;
  scope?: Scope;
  description?: string;
}
export interface Job {
  id: string;
  title: string;
  backend: string;
  status: "queued" | "running" | "success" | "failed";
  startedAt: string;
  finishedAt?: string;
  pid?: number;
  command?: string;
  error?: string;
  exitCode?: number;
}
