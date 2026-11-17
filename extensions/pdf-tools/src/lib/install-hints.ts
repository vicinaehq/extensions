import * as fs from "node:fs";

type LinuxPackageManager = "apt" | "pacman" | "dnf";

function detectLinuxPackageManager(): LinuxPackageManager | null {
  for (const pm of ["apt", "pacman", "dnf"] as const) {
    if (fs.existsSync(`/usr/bin/${pm}`)) return pm;
  }
  return null;
}

/**
 * Install command(s) for qpdf on the current platform, as listed in the README.
 */
export function qpdfInstallHint(): string {
  if (process.platform === "win32") return "'winget install QPDF.QPDF', then add its bin folder to PATH";
  if (process.platform === "darwin") return "'brew install qpdf'";
  switch (detectLinuxPackageManager()) {
    case "apt":
      return "'sudo apt install qpdf'";
    case "pacman":
      return "'sudo pacman -S qpdf'";
    case "dnf":
      return "'sudo dnf install qpdf'";
    default:
      return "'sudo apt install qpdf', 'sudo pacman -S qpdf' or 'sudo dnf install qpdf'";
  }
}

/**
 * Install command(s) for Pillow on the current platform, as listed in the README.
 */
export function pillowInstallHint(): string {
  if (process.platform === "win32") return "'python -m pip install Pillow'";
  if (process.platform === "darwin") return "'pip install Pillow'";
  switch (detectLinuxPackageManager()) {
    case "apt":
      return "'sudo apt install python3-pil'";
    case "pacman":
      return "'sudo pacman -S python-pillow'";
    case "dnf":
      return "'sudo dnf install python3-pillow'";
    default:
      return "'pip install Pillow'";
  }
}
