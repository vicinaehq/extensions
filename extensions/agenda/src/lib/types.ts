import { Color } from "@vicinae/api";

export interface Calendar {
  url: string;
  name: string;
  color: Color;
}

export interface Preferences {
  refreshInterval: string;
  timeFormat: "12h" | "24h";
}
