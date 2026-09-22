import { Clipboard, closeMainWindow, getPreferenceValues, showHUD } from "@vicinae/api";
import colorNamer from "color-namer";
import { addToHistory } from "./lib/history";
import type { Color, PickColorPreferences } from "./lib/types";
import { getColorByProximity, getFormattedColor } from "./lib/utils";
import { pickScreenColor } from "./native/picker";

export default async function Command() {
  let showColorName = false;
  try {
    const prefs = getPreferenceValues<PickColorPreferences>();
    showColorName = Boolean(prefs.showColorName);
  } catch {
    // default false
  }

  await closeMainWindow();

  try {
    const pickedColor: Color | null = await pickScreenColor();
    if (!pickedColor) {
      return;
    }

    addToHistory(pickedColor);

    const formattedColor = getFormattedColor(pickedColor);
    if (!formattedColor) {
      throw new Error("Failed to format color");
    }

    await Clipboard.copy(formattedColor);

    if (showColorName) {
      try {
        const colors = colorNamer(formattedColor);
        const colorsByDistance = getColorByProximity(colors);
        const firstColorName = colorsByDistance[0]?.name;
        await showHUD(`Copied color ${formattedColor} (${firstColorName}) to clipboard`);
      } catch {
        await showHUD(`Copied color ${formattedColor} to clipboard`);
      }
    } else {
      await showHUD(`Copied color ${formattedColor} to clipboard`);
    }
  } catch (e: any) {
    console.error("Pick color error:", e);
    await showHUD("❌ Failed picking color");
  }
}
