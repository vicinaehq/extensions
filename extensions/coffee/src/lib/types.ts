export const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export type SessionMode = "indefinite" | "timed" | "until" | "while" | "schedule";

export type InhibitBackend = "caffeinate" | "systemd-inhibit" | "gnome-session-inhibit";

export interface Session {
  pid: number;
  processIdentity: string | null;
  mode: SessionMode;
  startedAt: number;
  endsAt: number | null;
  waitPid: number | null;
  waitName: string | null;
  reason: string;
  backend: InhibitBackend;
}

export interface Schedule {
  id: string;
  days: Weekday[];
  from: string;
  to: string;
  paused: boolean;
  skipUntil: number | null;
}

export interface CoffeeStats {
  totalCoffees: number;
  startedAt: number[];
}

export interface State {
  version: 3;
  session: Session | null;
  schedules: Schedule[];
  stats: CoffeeStats;
}

export interface Preferences {
  "prevent-display": boolean;
  "prevent-system": boolean;
  "prevent-lid": boolean;
  "prevent-disk": boolean;
}

export interface Status {
  caffeinated: boolean;
  session: Session | null;
  remainingMs: number | null;
  summary: string;
  backend: InhibitBackend | null;
}

export interface RunningProcess {
  pid: number;
  name: string;
}
