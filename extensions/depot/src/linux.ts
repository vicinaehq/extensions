import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

/**
 * Trusted system executables on supported Ubuntu and Debian installations.
 * Keeping these absolute avoids resolving privileged tools through a mutable PATH.
 */
export const LINUX_EXECUTABLES = {
  apt: "/usr/bin/apt",
  aptCache: "/usr/bin/apt-cache",
  aptGet: "/usr/bin/apt-get",
  aptMark: "/usr/bin/apt-mark",
  appstreamCli: "/usr/bin/appstreamcli",
  dpkgDeb: "/usr/bin/dpkg-deb",
  dpkgQuery: "/usr/bin/dpkg-query",
  flatpak: "/usr/bin/flatpak",
  pkexec: "/usr/bin/pkexec",
  unsquashfs: "/usr/bin/unsquashfs",
  updateDesktopDatabase: "/usr/bin/update-desktop-database",
} as const;

export function userDataDirectory(
  xdgDataHome = process.env.XDG_DATA_HOME,
  homeDirectory = homedir(),
): string {
  return xdgDataHome && isAbsolute(xdgDataHome)
    ? xdgDataHome
    : join(homeDirectory, ".local", "share");
}
