import { open, Cache, Clipboard, getPreferenceValues, List, Icon, ActionPanel, Action, showToast, Toast, getApplications, Application, } from "@vicinae/api";
import { useEffect, useState } from "react";
import { execa } from "execa";
import path from "path";
import { homedir } from "os";
import { existsSync } from "fs";

export default function Directories() {
  const cache = new Cache();
  const defaultFilter: string = getPreferenceValues().defaultFilter;
  const defaultApp = getPreferenceValues().application;
  const alternativeApp = getPreferenceValues().alternativeApplication;
  const [gitProjects, setGitProjects] = useState<boolean>(
    defaultFilter == "git",
  );
  const application = getPreferenceValues().application;
  const alternativeApplication = getPreferenceValues().alternativeApplication;

  const [isLoading, setIsLoading] = useState(true);
  const [dirs, setDirs] = useState<string[]>(() => {
    if (cache.isEmpty) return [];
    const strData =
      (gitProjects ? cache.get("gitProjects") : cache.get("directories")) ??
      "[]";
    return JSON.parse(strData);
  });

  const [apps, setApps] = useState<Application[]>(() => {
    if (cache.isEmpty) return [];
    const strData = cache.get("apps") ?? "[]";
    return JSON.parse(strData);
  });

  async function getDirectories(): Promise<string[]> {
    try {
      const { stdout } = await execa("zoxide", ["query", "-l"]);
      const directories = stdout.split("\n").filter(Boolean);
      cache.set("directories", JSON.stringify(directories));
      return directories;
    } catch (e) {
      console.log("ERROR : ", e);
      showToast({ title: e.message, style: Toast.Style.Failure });
      return [];
    }
  }

  async function getGitProjects(): Promise<string[]> {
    const directories = await getDirectories();
    const filtered = directories.filter((directory) =>
      existsSync(path.join(directory, ".git")),
    );
    cache.set("gitProjects", JSON.stringify(filtered));
    return filtered;
  }

  useEffect(() => {
    if (gitProjects) {
      getGitProjects().then((directories) => {
        setDirs(directories);
        setIsLoading(false);
      });
    } else {
      getDirectories().then((directories) => {
        setDirs(directories);
        setIsLoading(false);
      });
    }
    getApplications(homedir()).then((apps) => {
      setApps(apps);
      cache.set("apps", JSON.stringify(apps));
    });
  }, [gitProjects]);

  async function openProject(projectPath: string, app: string) {
    try {
      await open(projectPath, app);
      await execa("zoxide", ["add", projectPath]); // increments zoxide score of selected entry
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to open project",
        message: String(error),
      });
    }
  }

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search recent directories or projects"
      searchBarAccessory={
        <List.Dropdown
          tooltip="Sort By"
          value={gitProjects ? "git" : "all"}
          onChange={(val) => setGitProjects(val == "git")}
        >
          <List.Dropdown.Section title="Sort By">
            <List.Dropdown.Item title="All Directories" value="all" />
            <List.Dropdown.Item title="Git Repositories" value="git" />
          </List.Dropdown.Section>
        </List.Dropdown>
      }
    >
      {dirs.map((dir) => (
        <List.Item
          key={dir}
          icon={Icon.Folder}
          title={dir.split("/").pop() || ""}
          subtitle={dir}
          actions={
            <ActionPanel>
              <Action
                title={`Open with ${defaultApp}`}
                onAction={() => openProject(dir, application)}
              />
              {alternativeApplication && (
                <Action
                title={`Open with ${alternativeApp}`}
                  shortcut={{ modifiers: ["shift"], key: "enter" }}
                  onAction={() => openProject(dir, alternativeApplication)}
                />
              )}
              <Action
                title="Copy Path"
                icon={Icon.CopyClipboard}
                shortcut={{ modifiers: ["ctrl"], key: "enter" }}
                onAction={async () => {
                  await Clipboard.copy(dir);
                  showToast({
                    style: Toast.Style.Success,
                    title: "Copied Path",
                  });
                }}
              />
              {gitProjects && (
                <Action
                  title="Copy Repository Name"
                  icon={Icon.CopyClipboard}
                  shortcut={{ modifiers: ["ctrl", "shift"], key: "enter" }}
                  onAction={async () => {
                    const basename = dir.split("/").pop() || "";
                    await Clipboard.copy(basename);
                    showToast({
                      style: Toast.Style.Success,
                      title: "Copied Repository Name",
                    });
                  }}
                />
              )}
              {apps.map((app) => (
                <Action
                  key={app.id}
                  title={`Open with ${app.name}`}
                  icon={app.icon}
                  onAction={() => {
                    openProject(dir, app.id);
                  }}
                />
              ))}
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
