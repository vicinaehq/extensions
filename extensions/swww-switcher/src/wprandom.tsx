import { showToast, Toast, getPreferenceValues } from "@vicinae/api";
import { getImagesFromPath, Image } from "./utils/image";
import { omniCommand } from "./utils/hyprland";
import { Monitor, getMonitors } from "./utils/monitor";

export default async function RandomWallpaper() {
  const path: string = getPreferenceValues().wallpaperPath;
  const swwwTransition: string = getPreferenceValues().transitionType || "fade";
  const swwwSteps: number =
    parseInt(getPreferenceValues().transitionSteps) || 90;
  const swwwDuration: number =
    parseInt(getPreferenceValues().transitionDuration) || 3;
  const colorGen: string = getPreferenceValues().colorGenTool || "none";
  type Preferences = {
    toggleVicinaeSetting: boolean;
  };
  const preferences = getPreferenceValues<Preferences>();
  const leftMonitorName: string = getPreferenceValues().leftMonitor;
  const rightMonitorName: string = getPreferenceValues().rightMonitor;
  const postProduction = getPreferenceValues().postProduction;
  const postCommandString: string = getPreferenceValues().postCommand;

  try {
    await showToast({
      title: "Selecting random wallpaper...",
      style: Toast.Style.Animated,
    });

    const monitors = await getMonitors();
    const monitorNames = monitors.map((m) => m.name);
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

    if (
      isWide > 1.8 &&
      monitorNames.includes(leftMonitorName) &&
      monitorNames.includes(rightMonitorName)
    ) {
      omniCommand(
        selectedWallpaper.fullpath,
        `${leftMonitorName}|${rightMonitorName}`,
        swwwTransition,
        swwwSteps,
        swwwDuration,
        preferences.toggleVicinaeSetting,
        colorGen,
        postProduction,
        postCommandString,
      );
    } else {
      omniCommand(
        selectedWallpaper.fullpath,
        "ALL",
        swwwTransition,
        swwwSteps,
        swwwDuration,
        preferences.toggleVicinaeSetting,
        colorGen,
        postProduction,
        postCommandString,
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
      message:
        error instanceof Error ? error.message : "Unknown error occurred",
      style: Toast.Style.Failure,
    });
  }
}
