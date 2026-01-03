import ColorJS from "colorjs.io";
import { Color } from "@/types";

export function isValidColor(input: string): boolean {
  try {
    new ColorJS(input);
    return true;
  } catch {
    return false;
  }
}

export function parseColorInput(input: string): Color | null {
  try {
    const color = new ColorJS(input);
    const srgb = color.to("srgb");
    return {
      red: srgb.coords[0],
      green: srgb.coords[1],
      blue: srgb.coords[2],
      alpha: srgb.alpha ?? 1,
      colorSpace: "srgb",
    };
  } catch {
    return null;
  }
}
