/**
 * Capitalizes the first character of a string.
 */
export function capitalizeFirst(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Formats optional dimensions as a resolution string.
 */
export function formatResolution(width?: number, height?: number) {
  if (width === undefined || height === undefined) {
    return 'Unknown';
  }

  return `${width}x${height}`;
}

/**
 * Formats an optional refresh rate with two decimal places.
 */
export function formatRefreshRate(refreshRate?: number) {
  if (refreshRate === undefined) {
    return 'Unknown';
  }

  return `${refreshRate.toFixed(2)}Hz`;
}

/**
 * Displays a workspace name, falling back to its numeric identifier.
 */
export function formatWorkspace(id: number, name: string) {
  return name || id.toString();
}
