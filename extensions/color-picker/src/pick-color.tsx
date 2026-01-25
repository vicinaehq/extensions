import { Clipboard, closeMainWindow, getPreferenceValues, showHUD } from "@vicinae/api";
import { pickColorFromScreen } from "@/services/hyprpicker";
import { addToHistory } from "@/hooks/useHistory";
import { getFormattedColor } from "@/utils/color-formatter";
import { getColorName } from "@/utils/color-namer";
import { parseColorInput } from "@/utils/validation";

// Global variable to store picked color in case process is killed
let pendingColor: any = null;

// Try to save pending color if process is being killed
process.on('SIGTERM', () => {
  console.log("[pick-color] SIGTERM received, trying to save pending color...");
  if (pendingColor) {
    try {
      // Try to save synchronously before process dies
      addToHistory(pendingColor).catch(() => {});
    } catch (e) {
      // Ignore errors
    }
  }
});

process.on('exit', () => {
  console.log("[pick-color] Process exiting, pending color:", !!pendingColor);
});

export default async function Command() {
  const { showColorName } = getPreferenceValues<Preferences.PickColor>();
  await closeMainWindow();

  try {
    const pickedColor = await pickColorFromScreen();
    if (!pickedColor) {
      return; // User cancelled
    }

    // Parse the picked hex color into Color format
    const color = parseColorInput(pickedColor.hex);
    if (!color) {
      await showHUD("❌ Failed to parse color");
      return;
    }

    // Store in global variable in case process is killed
    pendingColor = color;

    // Add to history
    await addToHistory(color);

    // Clear pending color after successful save
    pendingColor = null;

    const formattedColor = getFormattedColor(color);
    if (!formattedColor) {
      await showHUD("❌ Failed to format color");
      return;
    }

    await Clipboard.copy(formattedColor);

    if (showColorName) {
      const colorName = getColorName(formattedColor);
      await showHUD(`Copied ${formattedColor} (${colorName})`);
    } else {
      await showHUD(`Copied ${formattedColor}`);
    }
  } catch (error) {
    console.error(error);
    await showHUD(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}
