import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import type { Color } from "color-namer";
import ColorJS from "colorjs.io";
import { normalizeColorHex } from "../lib/utils";

/** Keep the hue but darken/lighten the tag text until it is readable on the theme background. */
function readableTagColor(hex: string, background: "white" | "black") {
  try {
    const color = new ColorJS(hex);
    if (Math.abs(color.contrast(background, "WCAG21")) >= 3) return hex;
    const oklch = color.to("oklch");
    oklch.coords[0] = background === "white" ? 0.5 : 0.8;
    return oklch.to("srgb").toString({ format: "hex", collapse: false });
  } catch {
    return hex;
  }
}

export const ColorNameListItem = ({ color }: { color: Color }) => {
  const hexCode = `#${color.hex.replace(/^#/, "")}`;

  return (
    <List.Item
      icon={{
        source: Icon.CircleFilled,
        tintColor: {
          light: hexCode,
          dark: hexCode,
          adjustContrast: false,
        },
      }}
      title={color.name}
      accessories={[
        {
          tag: {
            value: normalizeColorHex(color.hex),
            color: {
              light: readableTagColor(hexCode, "white"),
              dark: readableTagColor(hexCode, "black"),
              adjustContrast: false,
            },
          },
        },
      ]}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard content={color.name} title="Copy Name" />
          <Action.CopyToClipboard content={color.hex} title="Copy Hex" />
        </ActionPanel>
      }
    />
  );
};
