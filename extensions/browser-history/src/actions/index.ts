import { exec } from "node:child_process";
import { promisify } from "node:util";
import { closeMainWindow, popToRoot } from "@raycast/api";
import { runAppleScript } from "run-applescript";
import { SupportedBrowsers } from "../interfaces";

const execAsync = promisify(exec);
const isMacOS = process.platform === "darwin";
const isLinux = process.platform === "linux";

export async function openNewTab(
  browser: SupportedBrowsers,
  url: string
): Promise<boolean | string> {
  popToRoot();
  closeMainWindow({ clearRootSearch: true });

  if (isMacOS) {
    // macOS implementation using AppleScript
    let appName = "";
    switch (browser) {
      case SupportedBrowsers.Chrome:
        appName = "Google Chrome";
        break;
      case SupportedBrowsers.Safari:
        appName = "Safari";
        break;
      case SupportedBrowsers.Edge:
        appName = "Microsoft Edge";
        break;
      case SupportedBrowsers.Brave:
        appName = "Brave Browser";
        break;
      case SupportedBrowsers.Vivaldi:
        appName = "Vivaldi";
        break;
      case SupportedBrowsers.Opera:
        appName = "Opera";
        break;
      case SupportedBrowsers.Iridium:
        appName = "Iridium";
        break;
      case SupportedBrowsers.Orion:
        appName = "Orion";
        break;
      case SupportedBrowsers.Sidekick:
        appName = "Sidekick";
        break;
      default:
        throw new Error(`Unsupported browser: ${browser}`);
    }

    const script = `
      tell application "${appName}"
        activate
        tell window 1
            set ${
              browser === SupportedBrowsers.Safari ? "current tab" : "newTab"
            } to make new tab with properties {URL:"${url}"}
        end tell
      end tell
      return
    `;

    return await runAppleScript(script);
  } else if (isLinux) {
    // Linux implementation using direct browser commands
    let command = "";
    switch (browser) {
      case SupportedBrowsers.Chrome:
        command = `google-chrome --new-tab "${url}"`;
        break;
      case SupportedBrowsers.Safari:
        // Safari is not available on Linux, fallback to xdg-open
        command = `xdg-open "${url}"`;
        break;
      case SupportedBrowsers.Edge:
        command = `microsoft-edge --new-tab "${url}"`;
        break;
      case SupportedBrowsers.Brave:
        command = `brave-browser --new-tab "${url}"`;
        break;
      case SupportedBrowsers.Vivaldi:
        command = `vivaldi --new-tab "${url}"`;
        break;
      case SupportedBrowsers.Opera:
        command = `opera --new-tab "${url}"`;
        break;
      case SupportedBrowsers.Iridium:
        command = `iridium-browser --new-tab "${url}"`;
        break;
      case SupportedBrowsers.Orion:
        // Orion is macOS only, fallback to xdg-open
        command = `xdg-open "${url}"`;
        break;
      case SupportedBrowsers.Sidekick:
        // Sidekick may not be available on Linux, fallback to xdg-open
        command = `xdg-open "${url}"`;
        break;
      default:
        throw new Error(`Unsupported browser: ${browser}`);
    }

    try {
      await execAsync(command);
      return true;
    } catch (error) {
      // If the specific browser command fails, try xdg-open as fallback
      try {
        await execAsync(`xdg-open "${url}"`);
        return true;
      } catch (_fallbackError) {
        throw new Error(`Failed to open URL in browser: ${error}`);
      }
    }
  } else {
    throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

export async function openNewArcTab(url: string): Promise<boolean | string> {
  popToRoot();
  closeMainWindow({ clearRootSearch: true });

  if (isMacOS) {
    const script = `
      return do shell script "open -a Arc ${url}"
    `;
    return await runAppleScript(script);
  } else if (isLinux) {
    // Arc browser may not be available on Linux, try common alternatives
    const commands = [
      `arc --new-tab "${url}"`, // If Arc has a Linux version
      `arc-browser --new-tab "${url}"`,
      `xdg-open "${url}"`, // Fallback to default browser
    ];

    for (const command of commands) {
      try {
        await execAsync(command);
        return true;
      } catch (_error) {}
    }
    throw new Error("Failed to open URL in Arc browser");
  } else {
    throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

export async function openNewFirefoxTab(url: string): Promise<boolean | string> {
  popToRoot();
  closeMainWindow({ clearRootSearch: true });

  if (isMacOS) {
    const script = `
      tell application "Firefox"
        activate
        repeat while not frontmost
          delay 0.1
        end repeat
        tell application "System Events"
          keystroke "t" using {command down}
          keystroke "l" using {command down}
             keystroke "a" using {command down}
             key code 51
             keystroke "${url}"
             key code 36
        end tell
      end tell
    `;
    return await runAppleScript(script);
  } else if (isLinux) {
    // On Linux, use firefox command with -new-tab flag
    try {
      await execAsync(`firefox --new-tab "${url}"`);
      return true;
    } catch (error) {
      // Fallback to xdg-open if firefox command fails
      try {
        await execAsync(`xdg-open "${url}"`);
        return true;
      } catch (_fallbackError) {
        throw new Error(`Failed to open URL in Firefox: ${error}`);
      }
    }
  } else {
    throw new Error(`Unsupported platform: ${process.platform}`);
  }
}
