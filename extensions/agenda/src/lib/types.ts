import { Color } from "@vicinae/api";

export interface Calendar {
  url: string;
  name: string;
  color: Color;
  /** macOS account the calendar belongs to, when read through EventKit. */
  source?: string;
}

export interface Preferences {
  refreshInterval: string;
  timeFormat: "12h" | "24h";
}
