import { Action, ActionPanel, Clipboard, showToast, Toast, getPreferenceValues, List, Icon, closeMainWindow } from "@vicinae/api";
import { getPreferencesFolder, parseRecentFiles, launchAseprite, exportPreview } from "./aseprite";
import { useState, useEffect, useRef } from "react";

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

  const [isLoading, setIsLoading] = useState(true);
  const [previews, setPreviews] = useState<Record<string, string | null>>({});
  const createdPreviewPaths = useRef<Set<string>>(new Set());
  const lastMtimes = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    refreshAll();
  }, []);

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const refreshPreview = async (path: string) => {
    setPreviews((p) => {
      const next = { ...p };
      delete next[path];
      return next;
    });
    const result = await exportPreview(path, preferences);
    if (result) {
      createdPreviewPaths.current.add(result);
      setPreviews((p) => ({ ...p, [path]: result }));
    }
  };

  const refreshAll = () => {
    setRefreshTrigger((t) => t + 1);
    loadRecentFiles();
  };

  // Poll for external file changes every 5s while extension is open
  useEffect(() => {
    if (!showPreviewEnabled) return;
    const fs = require("fs");

    const checkAndRegenerate = async () => {
      const aseFiles = allFiles.filter((f) => /\.ase(?:prite)?$/i.test(f.path)).slice(0, 20);
      if (aseFiles.length === 0) return;

      for (const f of aseFiles) {
        try {
          if (!fs.existsSync(f.path)) continue;
          const srcMtime = fs.statSync(f.path).mtimeMs;
          const lastMtime = lastMtimes.current.get(f.path);

          if (lastMtime !== undefined && srcMtime > lastMtime) {
            console.log(`[aseprite] File changed externally: ${f.path}`);
            const result = await exportPreview(f.path, preferences);
            if (result) setPreviews((p) => ({ ...p, [f.path]: result }));
          }
          lastMtimes.current.set(f.path, srcMtime);
        } catch {}
      }
    };

    // Initialize on first run
    if (lastMtimes.current.size === 0) {
      for (const f of allFiles.filter((f) => /\.ase(?:prite)?$/i.test(f.path)).slice(0, 20)) {
        try { lastMtimes.current.set(f.path, fs.statSync(f.path).mtimeMs); } catch {}
      }
    }

    const interval = setInterval(checkAndRegenerate, 5000);
    return () => clearInterval(interval);
  }, [showPreviewEnabled, refreshTrigger]);

  // Cleanup only this session's preview files on unmount
  useEffect(() => {
    return () => {
      const fs = require("fs");
      const path = require("path");
      for (const p of createdPreviewPaths.current) {
        try { fs.unlinkSync(p); } catch {}
      }
    };
  }, []);

  // Batch: generate previews for first 20 recent .ase files on load/refresh
  useEffect(() => {
    if (!showPreviewEnabled || allFiles.length === 0) return;
    const aseFiles = allFiles.filter((f) => /\.ase(?:prite)?$/i.test(f.path)).slice(0, 20);
    if (aseFiles.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const f of aseFiles) {
        if (cancelled) return;
        const result = await exportPreview(f.path, preferences);
        if (cancelled) return;
        if (result) {
          createdPreviewPaths.current.add(result);
          setPreviews((p) => ({ ...p, [f.path]: result }));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [allFiles, showPreviewEnabled, refreshTrigger]);

  const loadRecentFiles = async () => {
    setIsLoading(true);
    try {
      const fs = require("fs");
      const path = require("path");
      const prefsFolder = getPreferencesFolder();
      const iniPath = path.join(prefsFolder, "aseprite.ini");

      if (!fs.existsSync(iniPath)) {
        await showToast({
          style: Toast.Style.Animated,
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
          icon={Icon.CircleProgress}
          title="Loading..."
          description="Reading Aseprite recent files"
        />
      </List>
    );
  }

  if (allFiles.length === 0) {
    return (
      <List searchBarPlaceholder="Filter recent files...">
        <List.EmptyView
          icon={Icon.Folder}
          title="No recent files found"
          description="Open files in Aseprite to populate the recent list"
        />
      </List>
    );
  }

  return (
    <List
      isShowingDetail={showPreviewEnabled}
      searchBarPlaceholder="Filter recent files..."
    >
      {allFiles.map((file) => {
        const isImage = /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.path);
        const isAseprite = /\.ase(?:prite)?$/i.test(file.path);
        const preview = previews[file.path];
        // previews[file] is undefined = pending, null = failed, string = ready
        const previewPending = showPreviewEnabled && isAseprite && preview === undefined;
        const previewFailed = showPreviewEnabled && isAseprite && preview === null;
        const markdown = !showPreviewEnabled
          ? undefined
          : isImage
            ? `![preview](file://${file.path})`
            : isAseprite && preview
              ? `![preview](file://${preview})`
              : previewFailed
                ? "_Preview failed. Check Aseprite path in settings._"
                : previewPending
                  ? "_Generating preview…_"
                  : undefined;
        return (
          <List.Item
            key={file.path}
            title={file.name}
            keywords={[file.path]}
            subtitle={file.path}
            icon={showPreviewEnabled && preview ? { fileIcon: preview } : { fileIcon: file.path }}

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

                    {previewPending && (
                      <List.Item.Detail.Metadata.Label title="Preview" text="Generating PNG via aseprite --batch…" />
                    )}
                    {previewFailed && (
                      <List.Item.Detail.Metadata.Label title="Preview" text="Failed. Check Aseprite path" />
                    )}
                  </List.Item.Detail.Metadata>
                }
              />
            }
            actions={
              <ActionPanel>
                <Action
                  title="Open"
                  icon={Icon.Folder}
                  onAction={() => handleOpenFile(file.path)}
                />
                <Action
                  title="Copy Path"
                  icon={Icon.CopyClipboard}
                  onAction={() => handleCopyPath(file.path)}
                />
                <Action
                  title="Refresh Previews"
                  icon={Icon.ArrowClockwise}
                  shortcut={{ modifiers: ["cmd"], key: "r" }}
                  onAction={refreshAll}
                />
                {previewFailed && (
                  <Action
                    title="Retry Preview"
                    icon={Icon.ArrowClockwise}
                    onAction={() => refreshPreview(file.path)}
                  />
                )}
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
