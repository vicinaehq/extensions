import { Action, ActionPanel, Clipboard, showToast, Toast, getPreferenceValues, List, Icon, closeMainWindow } from "@vicinae/api";
import { getPreferencesFolder, parseRecentFiles, launchAseprite, exportPreview, getPreviewPath } from "./aseprite";
import { useDebounce } from "./hooks/useDebounce";
import { useState, useEffect, useMemo } from "react";

export default function OpenRecent() {
  let preferences;
  try {
    preferences = getPreferenceValues<{
      asepritePath: string;
      showPreview: boolean;
    }>();
  } catch (e) {
    console.error("Failed to get preferences:", e);
    preferences = { asepritePath: "", showPreview: true };
  }
  const showPreviewEnabled = preferences.showPreview !== false;
  
  const [allFiles, setAllFiles] = useState<Array<{
    path: string;
    name: string;
    lastOpened: number;
  }>>([]);
  
  const [filterText, setFilterText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [previews, setPreviews] = useState<Record<string, string | null>>({});
  const debouncedFilter = useDebounce(filterText, 150);

  const recentFiles = useMemo(() => {
    if (!debouncedFilter) return allFiles;
    return allFiles.filter(
      (file) =>
        file.name.toLowerCase().includes(debouncedFilter.toLowerCase()) ||
        file.path.toLowerCase().includes(debouncedFilter.toLowerCase())
    );
  }, [allFiles, debouncedFilter]);

  useEffect(() => {
    loadRecentFiles();
  }, []);

  // Generate PNG previews for .ase/.aseprite files (skipped if showPreview disabled)
  useEffect(() => {
    if (!showPreviewEnabled) return;
    const aseFiles = recentFiles.filter((f) => /\.aseprite?$/i.test(f.path));
    if (aseFiles.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const f of aseFiles) {
        if (previews[f.path] !== undefined) continue;
        const fs = require("fs");
        const cached = getPreviewPath(f.path);
        if (fs.existsSync(cached)) {
          setPreviews((p) => ({ ...p, [f.path]: cached }));
          continue;
        }
        const result = await exportPreview(f.path, preferences);
        if (!cancelled) setPreviews((p) => ({ ...p, [f.path]: result }));
      }
    })();
    return () => { cancelled = true; };
  }, [recentFiles, showPreviewEnabled]);

  const loadRecentFiles = async () => {
    setIsLoading(true);
    try {
      const fs = require("fs");
      const path = require("path");
      const prefsFolder = getPreferencesFolder();
      const iniPath = path.join(prefsFolder, "aseprite.ini");
      
      if (!fs.existsSync(iniPath)) {
        await showToast({
          style: Toast.Style.Warning,
          title: "Aseprite config not found",
          message: "Open files in Aseprite first to populate recent files",
        });
        setAllFiles([]);
        setIsLoading(false);
        return;
      }
      
      const content = fs.readFileSync(iniPath, "utf-8");
      const files = parseRecentFiles(content);
      const validFiles = files.filter((f) => fs.existsSync(f.path));
      setAllFiles(validFiles);
    } catch (error) {
      console.error("Failed to load recent files:", error);
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to load recent files",
        message: String(error),
      });
      setAllFiles([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenFile = async (filePath: string) => {
    try {
      closeMainWindow();
      await launchAseprite([filePath], preferences);
      await showToast({
        style: Toast.Style.Success,
        title: `Opened ${filePath.split(/[/\\]/).pop()}`,
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to open file",
        message: String(error),
      });
    }
  };

  const handleCopyPath = async (filePath: string) => {
    try {
      await Clipboard.copy(filePath);
      await showToast({
        style: Toast.Style.Success,
        title: "Path copied to clipboard",
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to copy path",
        message: String(error),
      });
    }
  };

  if (isLoading) {
    return (
      <List isLoading={true} searchBarPlaceholder="Loading recent files...">
        <List.EmptyView
          icon={Icon.Spinner}
          title="Loading..."
          description="Reading Aseprite recent files"
        />
      </List>
    );
  }

  if (recentFiles.length === 0) {
    return (
      <List searchBarPlaceholder="Filter recent files...">
        <List.EmptyView
          icon={Icon.FolderOpen}
          title="No recent files found"
          description="Open files in Aseprite to populate the recent list"
        />
      </List>
    );
  }

  return (
    <List
      isShowingDetail={showPreviewEnabled}
      placeholder="Filter recent files..."
      onChange={setFilterText}
    >
      {recentFiles.map((file) => {
        const isImage = /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.path);
        const isAseprite = /\.aseprite?$/i.test(file.path);
        const preview = showPreviewEnabled ? previews[file.path] : null;
        const markdown = !showPreviewEnabled
          ? undefined
          : isImage
            ? `![preview](file://${file.path})`
            : isAseprite && preview
              ? `![preview](file://${preview})`
              : isAseprite
                ? "_Generating preview…_"
                : undefined;
        return (
          <List.Item
            key={file.path}
            title={file.name}
            subtitle={file.path}
            icon={showPreviewEnabled && preview ? { fileIcon: preview } : { fileIcon: file.path }}
            accessories={[{ text: new Date(file.lastOpened).toLocaleDateString() }]}
            detail={
              <List.Item.Detail
                markdown={markdown}
                metadata={
                  <List.Item.Detail.Metadata>
                    <List.Item.Detail.Metadata.Label title="Name" text={file.name} />
                    <List.Item.Detail.Metadata.Label title="Path" text={file.path} />
                    <List.Item.Detail.Metadata.Label
                      title="Type"
                      text={isAseprite ? "Aseprite Sprite" : isImage ? "Image" : "File"}
                    />
                    <List.Item.Detail.Metadata.Label
                      title="Last opened"
                      text={new Date(file.lastOpened).toLocaleString()}
                    />
                    {showPreviewEnabled && isAseprite && !preview && (
                      <List.Item.Detail.Metadata.Label title="Preview" text="Generating PNG via aseprite --batch…" />
                    )}
                  </List.Item.Detail.Metadata>
                }
              />
            }
            actions={
              <ActionPanel>
                <Action
                  title="Open"
                  icon={Icon.FolderOpen}
                  onAction={() => handleOpenFile(file.path)}
                />
                <Action
                  title="Copy Path"
                  icon={Icon.Clipboard}
                  onAction={() => handleCopyPath(file.path)}
                />
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}