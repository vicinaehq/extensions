import { Action, ActionPanel, Clipboard, closeMainWindow, Detail, popToRoot, showHUD } from "@vicinae/api";
import { useEffect, useRef } from "react";
import { addToHistory } from "./lib/history";
import type { Color } from "./lib/types";
import { getFormattedColor } from "./lib/utils";
import { pickScreenColor } from "./native/picker";

const COLOR_WHEEL_MARKDOWN = `
# Color Wheel

Click the **Pick from Wheel** button below or use the screen picker to select any color from the spectrum.

![RGB Color Wheel](rgb-color-wheel.png)
`;

export default function Command() {
  const hasInitialized = useRef(false);

  async function pickAndHandleColor() {
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
      await showHUD(`Copied color ${formattedColor} to clipboard`);
      await closeMainWindow();
      await popToRoot();
    } catch (e) {
      console.error(e);
      await showHUD("❌ Failed picking color");
    }
  }

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    pickAndHandleColor();
  }, []);

  return (
    <Detail
      markdown={COLOR_WHEEL_MARKDOWN}
      actions={
        <ActionPanel>
          <Action title="Pick Color Again" onAction={pickAndHandleColor} />
        </ActionPanel>
      }
    />
  );
}
