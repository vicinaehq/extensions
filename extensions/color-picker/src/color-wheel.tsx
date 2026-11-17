import { Action, ActionPanel, Clipboard, closeMainWindow, Detail, environment, popToRoot, showHUD } from "@vicinae/api";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { useEffect, useRef } from "react";
import { addToHistory } from "./lib/history";
import type { Color } from "./lib/types";
import { getFormattedColor } from "./lib/utils";
import { PickerTimeoutError, pickScreenColor } from "./native/picker";

const COLOR_WHEEL_MARKDOWN = `
# Color Wheel Reference

A reference RGB color wheel spectrum. Use the desktop screen picker to sample colors directly from the wheel or anywhere on your screen.

![RGB Color Wheel](${pathToFileURL(path.join(environment.assetsPath, "rgb-color-wheel.png")).href})
`;

export default function Command() {
  const hasInitialized = useRef(false);

  async function pickAndHandleColor() {
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
      await showHUD(`Copied ${formattedColor}`);
      await closeMainWindow();
      await popToRoot();
    } catch (e) {
      if (e instanceof PickerTimeoutError) {
        await showHUD("Color picker timed out, no color picked");
        return;
      }
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
          <Action title="Pick Color from Screen" onAction={pickAndHandleColor} />
        </ActionPanel>
      }
    />
  );
}
