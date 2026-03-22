import { showToast, Toast, getPreferenceValues } from "@vicinae/api";
import { getImagesFromPath, Image, processImage, wallpaperSourceChanged } from "./utils/image";
import { omniCommand } from "./utils/hyprland";
import { WindowManagement as wm } from "@vicinae/api";
import { LocalStorage as storage } from "@vicinae/api";
import untildify from "untildify";
import * as _path from "path";

export default async function RandomWallpaper() {
  const path: string = getPreferenceValues().wallpaperPath;
  const pathExpanded: string = untildify(path);
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
    const wallpapers: string[] = await getImagesFromPath(pathExpanded);

    if (wallpapers.length === 0) {
      await showToast({
        title: "No wallpapers found",
        message: `No images found in '${path}'`,
        style: Toast.Style.Failure,
      });
      return;
    }

    // Instead of picking randomly a wallpaper in the folder, this approach make sure all of them will be shown but in a random order.
    // It make sure all the wallpapers are shown at the same frequency and the same wallpapers now will never be selected twice.
    // Overall the randomness feels better for the user especially with large source folder ( it's also waypaper default behavior ).
    async function getRandomOrder(): Promise<string | undefined> {
      return storage.getItem("randomOrder");
    }

    function generateRandomOrderArray(): number[] {
      let randomOrderArray: number[] = [];
      for (let i = 0; i < wallpapers.length; i++) {
        randomOrderArray.push(i);
      }
      // shuflle
      for (let i = randomOrderArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [randomOrderArray[i], randomOrderArray[j]] = [randomOrderArray[j], randomOrderArray[i]];
      }
      return randomOrderArray;
    }

    async function getRandonmWallpaperIndex(): Promise<number> {
      // creates an array of values to generate random order and stores it as a string due to vicinae local storage type limitation
      let randomOrder = await getRandomOrder();
      if (randomOrder == undefined || await wallpaperSourceChanged(pathExpanded)) {
        // when the random order doesn't exist in storage 
        // or source directory has changed
        let randomOrderArray = generateRandomOrderArray();
        randomOrder = randomOrderArray.join(" ");
        storage.setItem("randomOrder", randomOrderArray.join(" "));
      }

      let index;
      let spaceIndex = randomOrder?.indexOf(" ");
      if (spaceIndex != -1) {
        index = parseInt(randomOrder!.slice(0, spaceIndex));
        storage.setItem("randomOrder", randomOrder!.slice((spaceIndex ?? -1) + 1));
      } else {
        // when there is only one index in the randomOrder.
        index = parseInt(randomOrder!);
        let randomOrderArray;
        // to make sure the last selectedWallpaper index won't be the first one in the new randomOrder to avoid having the same wallpaper twice.
        do { randomOrderArray = generateRandomOrderArray(); } while (index == randomOrderArray[0]);
        storage.setItem("randomOrder", randomOrderArray.join(" "));
      }
      return index;
    }

    const randomIndex = await getRandonmWallpaperIndex();
    const selectedWallpaper = wallpapers[randomIndex];
    const selectedWallpaperPath = _path.join(pathExpanded, selectedWallpaper);
    const wallpaperInfo = await processImage(_path.join(pathExpanded, selectedWallpaper));
    const isWide = wallpaperInfo.width / wallpaperInfo.height;

    if (isWMSupported && isWide > 1.8 && monitorNames.includes(leftMonitorName) && monitorNames.includes(rightMonitorName)) {
      omniCommand(
        _path.join(pathExpanded, selectedWallpaper),
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
        _path.join(pathExpanded, selectedWallpaper),
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
      title: `Choose '${wallpaperInfo.name}' as wallpaper`,
      message: `Set '${wallpaperInfo.name}' as wallpaper`,
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

