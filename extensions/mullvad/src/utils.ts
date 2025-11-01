import { showToast, Toast } from "@vicinae/api";
import { execSync } from "child_process";
import Style = Toast.Style;

export async function verifyIsMullvadInstalled() {
  try {
    // Weirdly, `which` is not available here
    execSync("mullvad --version");
    return true;
  } catch (e) {
    console.error(e);
    await showToast(Style.Failure, "Mullvad is not installed", "You can install it from https://mullvad.net/download/");
    return false;
  }
}

export function getEmojiFlag(countryCode: string) {
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));

  return String.fromCodePoint(...codePoints);
}

export const mullvadNotInstalledHint = `
# Mullvad is not installed 
  
Please install it from [https://mullvad.net/download/](https://mullvad.net/download/)
`;
