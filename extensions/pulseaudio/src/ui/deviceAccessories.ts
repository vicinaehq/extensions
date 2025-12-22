import { Color, Icon, List } from "@vicinae/api";

export function deviceAccessories(args: {
  isDefault: boolean;
  muted: boolean;
  volumePercent?: number;
}): List.Item.Accessory[] {
  const accessories: List.Item.Accessory[] = [];

  if (args.isDefault) {
    accessories.push({
      icon: Icon.Crown,
      tooltip: "Default device",
      tag: { value: "Default", color: Color.Green },
    });
  }

  if (args.muted) {
    accessories.push({ tag: { value: "Muted", color: Color.Red } });
  }

  if (typeof args.volumePercent === "number") {
    accessories.push({ text: { value: `${args.volumePercent}%`, color: Color.PrimaryText } });
  }

  return accessories;
}


