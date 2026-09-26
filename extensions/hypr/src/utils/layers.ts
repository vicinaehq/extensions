import type {
  FlatHyprLayerSurface,
  HyprLayerSurface,
  HyprLayersResponse,
} from '../types';

/**
 * Formats a layer surface rectangle as dimensions and coordinates.
 */
export function formatRect(surface: HyprLayerSurface) {
  return `${surface.w}x${surface.h}+${surface.x}+${surface.y}`;
}

/**
 * Flattens monitor-level layer data into a list of layer surfaces.
 */
export function flattenLayers(
  layers: HyprLayersResponse
): FlatHyprLayerSurface[] {
  return Object.entries(layers).flatMap(([monitor, monitorLayers]) =>
    Object.entries(monitorLayers.levels).flatMap(([level, surfaces]) =>
      surfaces.map((surface) => {
        const levelNumber = Number(level);

        return {
          ...surface,
          monitor,
          level: levelNumber,
          layer: getLayerName(levelNumber),
        };
      })
    )
  );
}

/**
 * Maps a numeric layer level to its Hyprland layer name.
 */
function getLayerName(level: number) {
  const layers: Record<number, string> = {
    0: 'background',
    1: 'bottom',
    2: 'top',
    3: 'overlay',
  };

  return layers[level] ?? `level ${level}`;
}
