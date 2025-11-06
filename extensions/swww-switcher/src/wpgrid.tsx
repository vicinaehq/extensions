import React, { useEffect, useState } from "react";
import {
  ActionPanel,
  Action,
  Grid,
  showToast,
  Toast,
  Icon,
  getPreferenceValues,
} from "@vicinae/api";
import { getImagesFromPath, Image } from "./utils/image";
import { Monitor, getMonitors } from "./utils/monitor";
import { omniCommand } from "./utils/hyprland";

// test

export default function DisplayGrid() {
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const path: string = getPreferenceValues().wallpaperPath;
  const swwwTransition: string = getPreferenceValues().transitionType || "fade";
  const swwwSteps: number =
    parseInt(getPreferenceValues().transitionSteps) || 90;
  const swwwDuration: number =
    parseInt(getPreferenceValues().transitionDuration) || 3;
  const colorGen: string = getPreferenceValues().colorGenTool || "none";
  const gridRows = parseInt(getPreferenceValues().gridRows) || 4;
  type Preferences = {
    toggleVicinaeSetting: boolean;
    showImageDetails: boolean;
  };
  const preferences = getPreferenceValues<Preferences>();
  const postProduction = getPreferenceValues().postProduction;
  const leftMonitorName: string = getPreferenceValues().leftMonitor;
  const rightMonitorName: string = getPreferenceValues().rightMonitor;
  const postCommandString: string = getPreferenceValues().postCommand;

  const [wallpapersPath, setWallpapersPath] = useState<string | null>(null);
  const [wallpapers, setWallpapers] = useState<Image[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const monitorNames = monitors.map((m) => m.name);

  useEffect(() => {
    getMonitors().then(setMonitors);
    getImagesFromPath(path)
      .then((ws) => {
        setIsLoading(false);
        setWallpapers(ws);
      })
      .catch((e) => {
        showToast({
          title: e.message,
          style: Toast.Style.Failure,
        });
        setIsLoading(false);
      });
  }, [wallpapersPath]);

  return (
    <Grid
      searchBarPlaceholder="Filter wallpapers..."
      columns={gridRows}
      aspectRatio="16/9"
      fit={Grid.Fit.Fill}
      isLoading={false}
    >
      <Grid.Section
        title={
          isLoading
            ? `Loading images in '${path}'...`
            : `Showing images from '${path}'`
        }
      >
        {isLoading
          ? Array.from({ length: gridRows * 3 }).map((_, i) => (
              <Grid.Item
                key={i}
                content={{ source: "loading.gif" }}
                title="Loading..."
                subtitle={
                  preferences.showImageDetails ? `480x270 • 79.5 KB` : undefined
                }
              />
            ))
          : wallpapers.map((w) => (
              <Grid.Item
                key={w.fullpath}
                content={{ source: w.fullpath }}
                title={w.name}
                {...(preferences.showImageDetails && {
                  subtitle: `${w.width}x${w.height} • ${w.size.toFixed(2)} MB`,
                  accessories: [
                    { text: `${w.width}x${w.height}` },
                    { text: `${w.size.toFixed(2)} MB` },
                  ],
                })}
                actions={
                  <ActionPanel>
                    <ActionPanel.Section title="Set on All Monitors">
                      <Action
                        title={`Set '${w.name}' on All`}
                        icon={Icon.Image}
                        onAction={() => {
                          omniCommand(
                            w.fullpath,
                            "ALL",
                            swwwTransition,
                            swwwSteps,
                            swwwDuration,
                            preferences.toggleVicinaeSetting,
                            colorGen,
                            postProduction,
                            postCommandString,
                          );
                        }}
                      />
                    </ActionPanel.Section>

                    <ActionPanel.Section title="Split on Monitors">
                      {monitorNames.includes(leftMonitorName) &&
                        monitorNames.includes(rightMonitorName) && (
                          <Action
                            title={`Split wallpaper ${leftMonitorName} | ${rightMonitorName}`}
                            icon={Icon.ArrowsExpand}
                            onAction={() => {
                              omniCommand(
                                w.fullpath,
                                `${leftMonitorName}|${rightMonitorName}`,
                                swwwTransition,
                                swwwSteps,
                                swwwDuration,
                                preferences.toggleVicinaeSetting,
                                colorGen,
                                postProduction,
                                postCommandString,
                              );
                            }}
                          />
                        )}
                    </ActionPanel.Section>

                    <ActionPanel.Section title="Set on Specific Monitor">
                      {monitors.map((monitor) => (
                        <Action
                          key={monitor.id}
                          title={`Set on ${monitor.name}`}
                          icon={Icon.Monitor}
                          onAction={() => {
                            omniCommand(
                              w.fullpath,
                              monitor.name,
                              swwwTransition,
                              swwwSteps,
                              swwwDuration,
                              preferences.toggleVicinaeSetting,
                              colorGen,
                              postProduction,
                              postCommandString,
                            );
                          }}
                        />
                      ))}
                    </ActionPanel.Section>
                  </ActionPanel>
                }
              />
            ))}
      </Grid.Section>
    </Grid>
  );
}
