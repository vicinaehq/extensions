import { getPreferenceValues } from "@vicinae/api";
import { join } from "path";
import { resolveAbsolutePath } from "./utils/path";

const preferences = getPreferenceValues();

export const HYPRLAND_CONFIG_PATH = resolveAbsolutePath(
  preferences["hyprland-config-path"],
);
export const VICINAE_MONITORS_CONFIG_PATH = join(
  resolveAbsolutePath(preferences["vicinae-monitors-config-path"]),
  "vicinae-monitors.conf",
);
export const VICINAE_SOURCE_LINE = `source = ${VICINAE_MONITORS_CONFIG_PATH}`;

export const PERSIST_CHANGES = preferences["persist-changes"] as boolean;

export const POSITIONS = [
  {
    value: "0x0",
    label: "Primary",
  },
  {
    value: "auto-left",
    label: "Left",
  },
  {
    value: "auto-right",
    label: "Right",
  },
  {
    value: "auto-up",
    label: "Above",
  },
  {
    value: "auto-down",
    label: "Below",
  },
];

export const TRANSFORMS = [
  {
    value: 0,
    label: "Normal",
  },
  {
    value: 1,
    label: "90°",
  },
  {
    value: 2,
    label: "180°",
  },
];

export const SCALES = [1, 1.33, 1.6, 2];
