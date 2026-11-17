import ColorJS from "colorjs.io";
import type { ColorFormatType, HistoryColor } from "./types";

export function formatColor(_color: HistoryColor, format?: ColorFormatType) {
  let color: any;
  if (typeof _color === "string") {
    color = new ColorJS(_color);
  } else if ("colorSpace" in _color) {
    color = new ColorJS(_color.colorSpace, [_color.red, _color.green, _color.blue], _color.alpha);
  } else {
    color = new ColorJS("srgb", [_color.red / 255, _color.green / 255, _color.blue / 255], _color.alpha);
  }

  switch (format) {
    default:
    case "hex": {
      return color.to("srgb").toString({ format: "hex", collapse: false }).toUpperCase();
    }
    case "hex-lower-case": {
      return color.to("srgb").toString({ format: "hex", collapse: false }).toLowerCase();
    }
    case "hex-no-prefix": {
      return color.to("srgb").toString({ format: "hex", collapse: false }).replace("#", "");
    }
    case "rgb": {
      return toRgb255(color).toString({ format: "rgb_number" });
    }
    case "rgb-percentage": {
      return color.to("srgb").toString({ format: "rgb" });
    }
    case "rgba": {
      return toRgb255(color).toString({ format: "rgba_number" });
    }
    case "rgba-percentage": {
      return color.to("srgb").toString({ format: "rgba" });
    }
    case "hsla": {
      return color.to("hsl").toString({ format: "hsla" });
    }
    case "hsva": {
      return color.to("hsv").toString({ format: "color" });
    }
    case "oklch": {
      return color.to("oklch").toString();
    }
    case "lch": {
      const lchColor = color.to("lch");
      const [l, c, h] = lchColor.coords;
      return `lch(${l.toFixed(2)}% ${roundCoord(c)} ${roundCoord(h)})`;
    }
    case "p3": {
      return color.to("p3").toString({ format: "p3" });
    }
  }
}

/** sRGB color with each channel rounded to a whole 0-255 value, like the HEX output. */
function toRgb255(color: any) {
  const srgb = color.to("srgb");
  srgb.coords = srgb.coords.map((c: number) => Math.round(c * 255) / 255);
  return srgb;
}

/** Same precision colorjs uses for the other formats; a missing hue is "none" in CSS. */
function roundCoord(value: number | null) {
  if (value === null || Number.isNaN(value)) return "none";
  return String(Number(value.toPrecision(5)));
}
