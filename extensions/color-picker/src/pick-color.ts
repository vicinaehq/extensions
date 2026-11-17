import { Clipboard, closeMainWindow, getPreferenceValues, showHUD } from "@vicinae/api";
import colorNamer from "color-namer";
import { addToHistory } from "./lib/history";
import type { Color, PickColorPreferences } from "./lib/types";
import { getColorByProximity, getFormattedColor } from "./lib/utils";
import { PickerTimeoutError, pickScreenColor } from "./native/picker";

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

    await addToHistory(pickedColor);

    const formattedColor = getFormattedColor(pickedColor);
    if (!formattedColor) {
      throw new Error("Failed to format color");
    }

    await Clipboard.copy(formattedColor);

    if (showColorName) {
      try {
        const colors = colorNamer(getFormattedColor(pickedColor, "hex"));
        const colorsByDistance = getColorByProximity(colors);
        const firstColorName = colorsByDistance[0]?.name;
        await showHUD(`Copied ${formattedColor} (${firstColorName})`);
      } catch {
        await showHUD(`Copied ${formattedColor}`);
      }
    } else {
      await showHUD(`Copied ${formattedColor}`);
    }
  } catch (e: any) {
    if (e instanceof PickerTimeoutError) {
      await showHUD("Color picker timed out, no color picked");
      return;
    }
    console.error("Pick color error:", e);
    await showHUD("❌ Failed picking color");
  }
}
