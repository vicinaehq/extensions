import type { Output } from "../types";

export type Direction = "left" | "right" | "up" | "down";
export interface DisplayRect {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
export const directions: Direction[] = ["left", "right", "up", "down"];

export function outputLayout(outputs: Output[]): DisplayRect[] {
  return outputs.flatMap((output) =>
    output.logical ? [{ name: output.name, ...output.logical }] : [],
  );
}

export function overlaps(a: DisplayRect, b: DisplayRect): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

export function beside(
  rect: DisplayRect,
  anchor: DisplayRect,
  direction: Direction,
  alignment: "preserve" | "center" = "preserve",
): DisplayRect {
  const horizontal = direction === "left" || direction === "right";
  const alongEdge = (
    start: number,
    size: number,
    anchorStart: number,
    anchorSize: number,
  ) => {
    if (alignment === "center")
      return anchorStart + Math.round((anchorSize - size) / 2);
    // Retain any existing shared-edge overlap. If the old offset would leave
    // a gap, align the nearest end of the edge rather than forcing its center.
    if (start + size <= anchorStart) return anchorStart;
    if (start >= anchorStart + anchorSize)
      return anchorStart + anchorSize - size;
    return start;
  };
  return {
    ...rect,
    x: horizontal
      ? direction === "left"
        ? anchor.x - rect.width
        : anchor.x + anchor.width
      : alongEdge(rect.x, rect.width, anchor.x, anchor.width),
    y: horizontal
      ? alongEdge(rect.y, rect.height, anchor.y, anchor.height)
      : direction === "up"
        ? anchor.y - rect.height
        : anchor.y + anchor.height,
  };
}

function distance(a: DisplayRect, b: DisplayRect): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

export function normalizeLayout(layout: DisplayRect[]): DisplayRect[] {
  if (!layout.length) return [];
  const x = Math.min(...layout.map((rect) => rect.x));
  const y = Math.min(...layout.map((rect) => rect.y));
  return layout.map((rect) => ({ ...rect, x: rect.x - x, y: rect.y - y }));
}

/** Reattach every remaining display to a touching edge. Choosing the
 * nearest free attachment closes holes left by a removed middle display while
 * preserving as much of the previous arrangement as possible. */
function attachRemaining(
  placed: DisplayRect[],
  remaining: DisplayRect[],
  nearestFirst = false,
): DisplayRect[] {
  while (remaining.length) {
    let best: { index: number; rect: DisplayRect; cost: number } | undefined;
    remaining.forEach((rect, index) => {
      if (nearestFirst && index > 0) return;
      for (const anchor of placed) {
        for (const direction of directions) {
          const candidate = beside(rect, anchor, direction);
          if (placed.some((other) => overlaps(candidate, other))) continue;
          const cost = distance(candidate, rect);
          if (!best || cost < best.cost)
            best = { index, rect: candidate, cost };
        }
      }
    });
    // An extreme edge of a finite collection always has a free attachment.
    if (!best) throw new Error("Could not find a touching display position");
    placed.push(best.rect);
    remaining.splice(best.index, 1);
  }
  return normalizeLayout(placed);
}

export function compactLayout(layout: DisplayRect[]): DisplayRect[] {
  if (!layout.length) return [];
  // Preserve offsets in every connected layout; centering is opt-in.
  if (isConnectedLayout(layout)) return normalizeLayout(layout);
  return attachRemaining([{ ...layout[0] }], layout.slice(1));
}

function isConnectedLayout(layout: DisplayRect[]): boolean {
  if (!layout.length) return true;
  const connected = new Set([layout[0].name]);
  for (let i = 0; i < layout.length; i++) {
    for (const rect of layout) {
      if (
        layout.some(
          (anchor) =>
            connected.has(anchor.name) &&
            touchingSide(rect, anchor) !== undefined,
        )
      )
        connected.add(rect.name);
    }
  }
  return (
    connected.size === layout.length &&
    !layout.some((rect, index) =>
      layout.slice(index + 1).some((other) => overlaps(rect, other)),
    )
  );
}

function touchingSide(
  rect: DisplayRect,
  anchor: DisplayRect,
): Direction | undefined {
  if (
    Math.min(rect.y + rect.height, anchor.y + anchor.height) >
    Math.max(rect.y, anchor.y)
  ) {
    if (rect.x + rect.width === anchor.x) return "left";
    if (rect.x === anchor.x + anchor.width) return "right";
  }
  if (
    Math.min(rect.x + rect.width, anchor.x + anchor.width) >
    Math.max(rect.x, anchor.x)
  ) {
    if (rect.y + rect.height === anchor.y) return "up";
    if (rect.y === anchor.y + anchor.height) return "down";
  }
  return undefined;
}

function placeDisplay(
  layout: DisplayRect[],
  selected: DisplayRect,
  anchor: DisplayRect,
  direction: Direction,
  alignment: "preserve" | "center",
): RelativePosition {
  const position = beside(selected, anchor, direction, alignment);
  const others = layout.filter((rect) => rect.name !== selected.name);
  const direct = [...others, position];
  return {
    anchor: anchor.name,
    direction,
    layout: isConnectedLayout(direct)
      ? normalizeLayout(direct)
      : attachRemaining(
          [{ ...anchor }, position],
          others
            .filter((rect) => rect.name !== anchor.name)
            .sort(
              (a, b) =>
                distance(a, position) - distance(b, position) ||
                a.x - b.x ||
                a.y - b.y ||
                a.name.localeCompare(b.name),
            ),
          true,
        ),
  };
}

export function canMoveDisplay(layout: DisplayRect[], name: string): boolean {
  return layout.length > 1 && layout.some((rect) => rect.name === name);
}

export interface RelativePosition {
  anchor: string;
  direction: Direction;
  layout: DisplayRect[];
}

/** One placement on the requested side of EVERY other display. Keep the
 * selected/anchor pair fixed during gap repair so no requested side is lost.
 * Normalization shifts the canvas instead of rejecting placements at zero. */
export function relativePositions(
  layout: DisplayRect[],
  name: string,
  direction: Direction,
): RelativePosition[] {
  const selected = layout.find((rect) => rect.name === name);
  if (!selected) return [];
  const anchors = layout
    .filter((rect) => rect.name !== name)
    .sort(
      (a, b) =>
        distance(a, selected) - distance(b, selected) ||
        a.x - b.x ||
        a.y - b.y ||
        a.name.localeCompare(b.name),
    );
  return anchors.map((anchor) =>
    placeDisplay(layout, selected, anchor, direction, "preserve"),
  );
}

function samePositions(a: DisplayRect[], b: DisplayRect[]): boolean {
  return (
    a.length === b.length &&
    a.every((rect) =>
      b.some(
        (other) =>
          other.name === rect.name &&
          other.x === rect.x &&
          other.y === rect.y &&
          other.width === rect.width &&
          other.height === rect.height,
      ),
    )
  );
}

/** Repeated presses traverse a stable set of targets, so reflow cannot make
 * the nearest monitor win repeatedly and starve the other monitors. A new
 * direction (or external preview reset) starts from the current arrangement. */
export class PositionMovement {
  private direction?: Direction;
  private selected?: string;
  private lastLayout?: DisplayRect[];
  private options: RelativePosition[] = [];
  private index = -1;
  private reference?: string;
  private centered?: {
    selected: string;
    before: RelativePosition;
    after: DisplayRect[];
  };

  move(
    layout: DisplayRect[],
    name: string,
    direction: Direction,
  ): RelativePosition | undefined {
    this.centered = undefined;
    if (
      this.direction !== direction ||
      this.selected !== name ||
      this.lastLayout !== layout
    ) {
      this.direction = direction;
      this.selected = name;
      this.options = relativePositions(layout, name, direction);
      this.index = -1;
      // If already in the first placement, start with the next reference.
      if (
        this.options.length > 1 &&
        samePositions(this.options[0].layout, layout)
      )
        this.index = 0;
    }
    if (!this.options.length) return undefined;
    this.index = (this.index + 1) % this.options.length;
    const result = this.options[this.index];
    this.lastLayout = result.layout;
    this.reference = result.anchor;
    return result;
  }

  center(layout: DisplayRect[], name: string): RelativePosition | undefined {
    if (
      this.centered?.selected === name &&
      samePositions(layout, this.centered.after)
    ) {
      const restored = this.centered.before;
      this.centered = undefined;
      this.selected = name;
      this.reference = restored.anchor;
      this.lastLayout = restored.layout;
      this.direction = undefined;
      this.options = [];
      this.index = -1;
      return restored;
    }
    this.centered = undefined;
    const selected = layout.find((rect) => rect.name === name);
    if (!selected) return undefined;
    const preferred =
      this.selected === name && this.lastLayout === layout
        ? this.reference
        : undefined;
    // Use the most recently targeted neighbor. On opening/selecting a display,
    // prefer the largest touching neighbor (e.g. the desktop beside a laptop).
    const anchor = layout
      .filter(
        (rect) =>
          rect.name !== name && touchingSide(selected, rect) !== undefined,
      )
      .sort(
        (a, b) =>
          Number(b.name === preferred) - Number(a.name === preferred) ||
          b.width * b.height - a.width * a.height ||
          a.name.localeCompare(b.name),
      )[0];
    if (!anchor) return undefined;
    const direction = touchingSide(selected, anchor)!;
    const result = placeDisplay(layout, selected, anchor, direction, "center");
    // Restore the whole arrangement on the next press: centering may have
    // reflowed neighbors or shifted the origin as well as the selected output.
    this.centered = {
      selected: name,
      before: {
        anchor: anchor.name,
        direction,
        layout: layout.map((rect) => ({ ...rect })),
      },
      after: result.layout,
    };
    this.selected = name;
    this.reference = anchor.name;
    this.lastLayout = result.layout;
    this.direction = undefined;
    this.options = [];
    this.index = -1;
    return result;
  }
}

const escapeXml = (value: string) =>
  value.replace(
    /[<>&"']/g,
    (char) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[char] ?? char,
  );

export function layoutImage(layout: DisplayRect[], selected: string): string {
  // This SVG is an alpha mask, recolored by Vicinae's native image provider.
  // currentColor is only mask ink, not the final on-screen theme color.
  const normalized = normalizeLayout(layout);
  const width = Math.max(1, ...normalized.map((rect) => rect.x + rect.width));
  const height = Math.max(1, ...normalized.map((rect) => rect.y + rect.height));
  const scale = Math.min(660 / width, 360 / height);
  const ox = (720 - width * scale) / 2;
  const oy = (420 - height * scale) / 2;
  const panels = normalized
    .map((rect) => {
      const active = rect.name === selected;
      const w = rect.width * scale;
      const h = rect.height * scale;
      const font = Math.min(
        26,
        w / Math.max(rect.name.length * 0.65, 1),
        h / 4,
      );
      return `<g transform="translate(${ox + rect.x * scale},${oy + rect.y * scale})"><rect x="1" y="1" width="${Math.max(0, w - 2)}" height="${Math.max(0, h - 2)}" fill="currentColor" fill-opacity="${active ? 0.16 : 0.04}" stroke="currentColor" stroke-opacity="${active ? 1 : 0.75}" stroke-width="${active ? 3 : 1}"/><text x="${w / 2}" y="${h / 2}" text-anchor="middle" font-family="sans-serif" font-size="${font}" font-weight="${active ? 700 : 400}" fill="currentColor">${escapeXml(rect.name)}</text><text x="${w / 2}" y="${h / 2 + font * 1.5}" text-anchor="middle" font-family="monospace" font-size="${font * 0.7}" fill="currentColor" fill-opacity="0.85">${rect.x}, ${rect.y}</text></g>`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="420" viewBox="0 0 720 420">${panels}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
