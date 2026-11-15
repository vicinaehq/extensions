/**
 * Bundled line icons.
 *
 * The host renders extension SVGs by flattening them to `tintColor`, so the
 * files are drawn in `currentColor` and tinted at each call site. `fallback`
 * points at the equivalent builtin icon in case an asset cannot be loaded.
 */
import { Color, Icon, Image } from "@raycast/api";

export const crateIcon: Image.ImageLike = {
  source: "box.svg",
  fallback: Icon.Box,
  tintColor: Color.Orange,
};

export const symbolIcon: Image.ImageLike = {
  source: "brackets.svg",
  fallback: Icon.Code,
  tintColor: Color.Orange,
};

function lineIcon(source: string, fallback: Icon, tintColor: Color.ColorLike): Image.ImageLike {
  return { source, fallback, tintColor };
}

export const downloadIcon = (tintColor: Color.ColorLike) =>
  lineIcon("download.svg", Icon.Download, tintColor);

export const tagIcon = (tintColor: Color.ColorLike) => lineIcon("tag.svg", Icon.Tag, tintColor);

export const trendIcon = (tintColor: Color.ColorLike) =>
  lineIcon("trend.svg", Icon.BarChart, tintColor);

export const branchIcon = (tintColor: Color.ColorLike) =>
  lineIcon("branch.svg", Icon.Layers, tintColor);

export const clockIcon = (tintColor: Color.ColorLike) =>
  lineIcon("clock.svg", Icon.Clock, tintColor);

export const calendarIcon = (tintColor: Color.ColorLike) =>
  lineIcon("calendar.svg", Icon.Calendar, tintColor);
