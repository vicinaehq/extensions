import colorNamer from "color-namer";
import { Colors, Palette, Color } from "color-namer";
import uniqBy from "lodash/uniqBy";
import { normalizeColorHex } from "./color-formatter";

export function getColorByPlatform(normalizedSearchString: string, colors?: Colors<Palette>): [string, Color[]][] {
  return Object.entries(colors ?? {}).sort(([, a], [, b]) => {
    if (normalizeColorHex(a[0].hex) === normalizeColorHex(b[0].hex)) return 0;
    if (normalizedSearchString === normalizeColorHex(a[0].hex)) return -1;
    return 1;
  });
}

export function getColorByProximity(colors?: Colors<Palette>): Color[] {
  return uniqBy(Object.values(colors ?? {}).flat(), (x) => x.name.toLowerCase()).sort(
    (a, b) => a.distance - b.distance
  );
}

export function getColorName(hex: string): string {
  const colors = colorNamer(hex);
  const colorsByDistance = getColorByProximity(colors);
  return colorsByDistance[0]?.name || hex;
}
