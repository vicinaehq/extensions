import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import { colord, extend } from "colord";
import cmykPlugin from "colord/plugins/cmyk";
import labPlugin from "colord/plugins/lab";
import namesPlugin from "colord/plugins/names";
import { useState } from "react";
import { tailwindColors } from "./tailwind-colors";

extend([cmykPlugin, namesPlugin, labPlugin]);

export default function Command() {
  const [searchText, setSearchText] = useState("");

  const color = colord(searchText);
  const isValid = color.isValid();

  let closestTailwindColor = null;
  if (isValid) {
    let minDelta = Number.POSITIVE_INFINITY;
    for (const [colorName, shades] of Object.entries(tailwindColors)) {
      for (const [shade, hex] of Object.entries(shades)) {
        const delta = color.delta(hex);
        if (delta < minDelta) {
          minDelta = delta;
          closestTailwindColor = {
            name: `text-${colorName}-${shade}`,
            hex: hex,
            delta: delta,
          };
        }
      }
    }
  }

  return (
    <List
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Enter a color (e.g., #FF0000, rgb(255, 0, 0), blue)"
      throttle
    >
      {!searchText ? (
        <List.EmptyView
          icon={Icon.Pencil}
          title="Type a color"
          description="Support Hex, RGB, HSL, and HTML color names"
        />
      ) : !isValid ? (
        <List.EmptyView
          icon={Icon.Warning}
          title="Invalid color"
          description="Please enter a valid color code or name"
        />
      ) : (
        <List.Section title="Conversions">
          <ColorItem
            label="HEX"
            value={color.toHex()}
            icon={{ source: Icon.CircleFilled, tintColor: color.toHex() }}
          />
          <ColorItem
            label="RGB"
            value={color.toRgbString()}
            icon={{ source: Icon.CircleFilled, tintColor: color.toHex() }}
          />
          <ColorItem
            label="HSL"
            value={color.toHslString()}
            icon={{ source: Icon.CircleFilled, tintColor: color.toHex() }}
          />
          <ColorItem
            label="CMYK"
            value={color.toCmykString()}
            icon={{ source: Icon.CircleFilled, tintColor: color.toHex() }}
          />
          {color.toName() && (
            <ColorItem
              label="Name"
              value={color.toName() || ""}
              icon={{ source: Icon.CircleFilled, tintColor: color.toHex() }}
            />
          )}
          {!color.toName() && color.toName({ closest: true }) && (
            <ColorItem
              label="Closest Name"
              value={color.toName({ closest: true }) || ""}
              icon={{ source: Icon.CircleFilled, tintColor: color.toHex() }}
            />
          )}
          {closestTailwindColor && (
            <ColorItem
              label={`Tailwind (${closestTailwindColor.name})`}
              value={closestTailwindColor.hex}
              copyValue={closestTailwindColor.name}
              icon={{
                source: Icon.CircleFilled,
                tintColor: closestTailwindColor.hex,
              }}
            />
          )}
        </List.Section>
      )}
    </List>
  );
}

function ColorItem({
  label,
  value,
  copyValue,
  icon,
}: {
  label: string;
  value: string;
  copyValue?: string;
  icon: { source: string; tintColor: string };
}) {
  const contentToCopy = copyValue || value;
  return (
    <List.Item
      title={value}
      subtitle={label}
      icon={icon}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard
            content={contentToCopy}
            title={`Copy ${label}`}
          />
          <Action.Paste content={contentToCopy} title={`Paste ${label}`} />
        </ActionPanel>
      }
    />
  );
}
