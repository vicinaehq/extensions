import { Action, ActionPanel, Clipboard, showToast, Toast, getPreferenceValues, List, Icon, closeMainWindow } from "@vicinae/api";
import { getPreferencesFolder, parseRecentFiles, launchAseprite } from "./aseprite";
import { useDebounce } from "./hooks/useDebounce";
import { useState, useEffect, useMemo } from "react";

export default function OpenRecent() {
  let preferences;
  try {
    preferences = getPreferenceValues<{
      asepritePath: string;
    }>();
  } catch (e) {
    console.error("Failed to get preferences:", e);
    preferences = { asepritePath: "" };
  }
  
  const [allFiles, setAllFiles] = useState<Array<{
    path: string;
    name: string;
    lastOpened: number;
  }>>([]);
  
  const [filterText, setFilterText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
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
      });
    }
  };

  const handleCopyPath = (filePath: string) => {
    Clipboard.copy(filePath);
    showToast({
      style: Toast.Style.Success,
      title: "Path copied to clipboard",
    });
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
      placeholder="Filter recent files..."
      onChange={setFilterText}
    >
      {recentFiles.map((file) => (
        <List.Item
          key={file.path}
          title={file.name}
          subtitle={file.path}
          accessories={[
            { text: new Date(file.lastOpened).toLocaleDateString() }
          ]}
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
      ))}
    </List>
  );
}