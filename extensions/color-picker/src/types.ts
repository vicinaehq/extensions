// Core color representation (normalized sRGB)
export interface Color {
  red: number; // 0-1 range
  green: number; // 0-1 range
  blue: number; // 0-1 range
  alpha: number; // 0-1 range (1 = opaque)
  colorSpace: string; // "srgb"
}

// Legacy format support (for migration from Raycast)
export interface DeprecatedColor {
  red: number; // 0-255 range
  green: number; // 0-255 range
  blue: number; // 0-255 range
  alpha: number; // 0-1 range
}

// History can contain either format or raw hex strings
export type HistoryColor = Color | DeprecatedColor | string;

// History storage item
export interface HistoryItem {
  date: string; // ISO 8601
  color: HistoryColor;
  title?: string; // User-editable label
}

// All supported color formats
export type ColorFormatType =
  | "hex"
  | "hex-lower-case"
  | "hex-no-prefix"
  | "rgb"
  | "rgb-percentage"
  | "rgba"
  | "rgba-percentage"
  | "hsla"
  | "hsva"
  | "oklch"
  | "lch"
  | "p3";

// Color name sorting modes
export type SortType = "platform" | "proximity";

// Picked color from hyprpicker
export interface PickedColor {
  hex: string; // #FF6363
}
