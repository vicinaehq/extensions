import { Action, ActionPanel, Clipboard, List, LocalStorage, popToRoot, showHUD } from "@vicinae/api";
import type { ColorFormatType } from "../lib/types";
import { getFormattedColor } from "../lib/utils";

type ColorFormatProps = {
  text: string;
  title: string;
  value: string;
};

function getConvertedColor(text: string, format: ColorFormatType) {
  try {
    const convertedColor = getFormattedColor(text, format);
    return convertedColor;
  } catch {
    // Invalid input is reported by the list's empty view.
    return undefined;
  }
}

export const ColorConvertListItem = ({ text, title, value }: ColorFormatProps) => {
  const convertedColor = getConvertedColor(text, value as ColorFormatType);
  if (!convertedColor) return null;

  return (
    <List.Item
      title={title}
      subtitle={convertedColor}
      actions={
        <ActionPanel>
          <Action
            title="Copy Converted Color"
            onAction={async () => {
              if (convertedColor) {
                await Clipboard.copy(convertedColor);
                await showHUD("Copied color to clipboard");
              }
              await LocalStorage.setItem("lastConvertedColorFormat", value);
              popToRoot({ clearSearchBar: true });
            }}
          />
        </ActionPanel>
      }
    />
  );
};
