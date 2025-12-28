import { showToast, Toast, getPreferenceValues } from "@vicinae/api";
import { getImagesFromPath, Image } from "./utils/image";
import { omniCommand } from "./utils/hyprland";
import { WindowManagement as wm } from "@vicinae/api";

export default async function RandomWallpaper() {
  const path: string = getPreferenceValues().wallpaperPath;
  const awwwTransition: string = getPreferenceValues().transitionType || "fade";
  const awwwSteps: number = parseInt(getPreferenceValues().transitionSteps) || 90;
  const awwwDuration: number = parseInt(getPreferenceValues().transitionDuration) || 3;
  const awwwFPS: number = parseInt(getPreferenceValues().transitionFPS) || 60;
  const colorGen: string = getPreferenceValues().colorGenTool || "none";
  type Preferences = {
    toggleVicinaeSetting: boolean;
  };
  const preferences = getPreferenceValues<Preferences>();
  const leftMonitorName: string = getPreferenceValues().leftMonitor;
  const rightMonitorName: string = getPreferenceValues().rightMonitor;
  const postProduction = getPreferenceValues().postProduction;
  const postCommandString: string = getPreferenceValues().postCommand;

  let isWMSupported = false;

  try {
    await showToast({
      title: "Selecting random wallpaper...",
      style: Toast.Style.Animated,
    });

    let monitors: wm.Screen[] = [];

    wm.getScreens().then(
      (screens: wm.Screen[]) => {
        monitors = screens;
        isWMSupported = true;
      },
      (err: unknown) => {
        isWMSupported = true;

        showToast({
          title: "Could not get monitors, monitor specific features will be disabled",
          message: err,
          style: Toast.Style.Failure,
        });
      },
    );

    const monitorNames = isWMSupported ? monitors.map((m) => m.name) : [];
    const wallpapers: Image[] = await getImagesFromPath(path);

    if (wallpapers.length === 0) {
      await showToast({
        title: "No wallpapers found",
        message: `No images found in '${path}'`,
        style: Toast.Style.Failure,
      });
      return;
    }

    // Randomly select an image
    const randomIndex = Math.floor(Math.random() * wallpapers.length);
    const selectedWallpaper = wallpapers[randomIndex];
    const isWide = selectedWallpaper.width / selectedWallpaper.height;

    if (isWMSupported && isWide > 1.8 && monitorNames.includes(leftMonitorName) && monitorNames.includes(rightMonitorName)) {
      omniCommand(
        selectedWallpaper.fullpath,
        `${leftMonitorName}|${rightMonitorName}`,
        awwwTransition,
        awwwSteps,
        awwwDuration,
        preferences.toggleVicinaeSetting,
        colorGen,
        postProduction,
        postCommandString,
        awwwFPS,
      );
    } else {
      omniCommand(
        selectedWallpaper.fullpath,
        "ALL",
        awwwTransition,
        awwwSteps,
        awwwDuration,
        preferences.toggleVicinaeSetting,
        colorGen,
        postProduction,
        postCommandString,
        awwwFPS,
      );
    }

    await showToast({
      title: `Choose '${selectedWallpaper.name}' as wallpaper`,
      message: `Set '${selectedWallpaper.name}' as wallpaper`,
      style: Toast.Style.Success,
    });
  } catch (error) {
    await showToast({
      title: "Failed to set random wallpaper",
      message: error instanceof Error ? error.message : "Unknown error occurred",
      style: Toast.Style.Failure,
    });
  }
}
