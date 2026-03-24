import { useEffect, useState } from "react";
import { ActionPanel, Action, Grid, showToast, Toast, Icon, getPreferenceValues } from "@vicinae/api";
import { getImagesMetadata, getImagesFromPath, Image } from "./utils/image";
import { WindowManagement as wm } from "@vicinae/api";
import { omniCommand } from "./utils/hyprland";
import { createHash } from "node:crypto";
import { Metadata } from "@vicinae/api/dist/api/components/metadata";
import untildify from "untildify";
import * as _path from "path";
// test

export default function DisplayGrid() {
  const [monitors, setMonitors] = useState<wm.Screen[]>([]);
  const [isWMSupported, setIsWMSupported] = useState<boolean>(true);
  const path: string = getPreferenceValues().wallpaperPath;
  const pathExpanded: string = untildify(path);
  const awwwTransition: string = getPreferenceValues().transitionType || "fade";
  const awwwSteps: number = parseInt(getPreferenceValues().transitionSteps) || 90;
  const awwwDuration: number = parseInt(getPreferenceValues().transitionDuration) || 3;
  const awwwFPS: number = parseInt(getPreferenceValues().transitionFPS) || 60;
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

  const [wallpapers, setWallpapers] = useState<string[]>([]);
  const [wallpapersMetadata, setWallpapersMetadata] = useState<Record<string, Image>>({});
  const [isLoading, setIsLoading] = useState(true);

  const monitorNames = monitors.map((m) => m.name);

  // Adapted from https://stackoverflow.com/a/79452442 <3
  const hashMonitor = (monitor: wm.Screen): string => {
    return createHash("sha256").update(JSON.stringify(monitor), "utf8").digest("hex");
  };

  useEffect(() => {
    wm.getScreens().then(setMonitors, (err: unknown) => {
      setIsWMSupported(false);

      showToast({
        title: "Could not get monitors, monitor specific features will be disabled",
        message: err,
        style: Toast.Style.Failure,
      });
    });

    // getImagesFromPath(pathExpanded).then((images) => {
    //   setWallpapers(images);
    //   setIsLoading(false);
    // });
    //
    // getImagesMetadata(pathExpanded).then((metadata) => {
    //   setWallpapersMetadata(metadata);
    //   setIsLoading(false);
    // });

    Promise.all([
      getImagesFromPath(pathExpanded),
      getImagesMetadata(pathExpanded),
    ]).then(([images, metadata]) => {
      setWallpapers(images);
      setWallpapersMetadata(metadata);
      setIsLoading(false);
    }).catch((e) => {
      showToast({ title: e.message, style: Toast.Style.Failure });
      setIsLoading(false);
    });
  }, [path]);

  return (
    <Grid
      searchBarPlaceholder="Filter wallpapers..."
      columns={gridRows}
      aspectRatio="16/9"
      fit={Grid.Fit.Fill}
      isLoading={isLoading}
    >
      <Grid.Section title={isLoading ? `Loading images in '${path}'...` : `Showing images from '${path}'`}>
        {isLoading
          ? Array.from({ length: gridRows * 3 }).map((_, i) => (
            <Grid.Item
              key={i}
              content={{ source: "loading.gif" }}
              title="Loading..."
              subtitle={preferences.showImageDetails ? `480x270 • 79.5 KB` : undefined}
            />
          ))
          : wallpapers.map((w) => (
            <Grid.Item
              key={w}
              content={{ source: _path.join(pathExpanded, w) }}
              title={wallpapersMetadata[w]?.name}
              {...(preferences.showImageDetails && {
                subtitle: `${wallpapersMetadata[w]?.width}x${wallpapersMetadata[w]?.height} • ${wallpapersMetadata[w]?.size.toFixed(2)} MB`,
                accessories: [{ text: `${wallpapersMetadata[w]?.width}x${wallpapersMetadata[w]?.height}` }, { text: `${wallpapersMetadata[w]?.size.toFixed(2)} MB` }],
              })}
              actions={
                <ActionPanel>
                  <ActionPanel.Section title="Set on All Monitors">
                    <Action
                      title={`Set '${wallpapersMetadata[w]?.name}' on All`}
                      icon={Icon.Image}
                      onAction={() => {
                        console.log(_path.join(pathExpanded, w));
                        omniCommand(
                          _path.join(pathExpanded, w),
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
                      }}
                    />
                  </ActionPanel.Section>

                  {isWMSupported && (
                    <>
                      <ActionPanel.Section title="Split on Monitors">
                        {monitorNames.includes(leftMonitorName) && monitorNames.includes(rightMonitorName) && (
                          <Action
                            title={`Split wallpaper ${leftMonitorName} | ${rightMonitorName}`}
                            icon={Icon.ArrowsExpand}
                            onAction={() => {
                              omniCommand(
                                _path.join(pathExpanded, w),
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
                            }}
                          />
                        )}
                      </ActionPanel.Section>

                      <ActionPanel.Section title="Set on Specific Monitor">
                        {monitors.map((monitor) => (
                          <Action
                            key={hashMonitor(monitor)} // This should be more resistant than simply using monitor.model, in case someone has the same monitor twice
                            title={`Set on ${monitor.name}`}
                            icon={Icon.Monitor}
                            onAction={() => {
                              omniCommand(
                                _path.join(pathExpanded, w),
                                monitor.name,
                                awwwTransition,
                                awwwSteps,
                                awwwDuration,
                                preferences.toggleVicinaeSetting,
                                colorGen,
                                postProduction,
                                postCommandString,
                                awwwFPS,
                              );
                            }}
                          />
                        ))}
                      </ActionPanel.Section>
                    </>
                  )}
                </ActionPanel>
              }
            />
          ))}
      </Grid.Section>
    </Grid>
  );
}
