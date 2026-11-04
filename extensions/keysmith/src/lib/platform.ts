/**
 * Where this extension can run.
 *
 * `Keysmith.conf` is written by KDE Keysmith, and the lock policies read
 * `/proc` to find the Vicinae session. Neither exists off Linux, so the
 * commands say so up front instead of failing on a missing file.
 */

/** A readable name for the current platform, for use in messages. */
function platformName(): string {
  switch (process.platform) {
    case "darwin":
      return "macOS";
    case "win32":
      return "Windows";
    default:
      return process.platform;
  }
}

/**
 * Why the extension cannot run here, or null when it can. The message is meant
 * to be shown directly to the user.
 */
export function unsupportedPlatformReason(): string | null {
  if (process.platform === "linux") return null;
  return `Keysmith reads the KDE Keysmith vault, so this extension only runs on Linux. This machine is ${platformName()}.`;
}

export function isSupportedPlatform(): boolean {
  return unsupportedPlatformReason() === null;
}
