import {
  open,
  Cache,
  Clipboard,
  getPreferenceValues,
  List,
  Icon,
  ActionPanel,
  Action,
  showToast,
  Toast,
  getApplications,
  Application,
  Color,
  closeMainWindow,
  PopToRootType,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import { execa } from "execa";
import path from "path";
import { homedir } from "os";
import { existsSync, readFileSync, statSync } from "fs";

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
    const strData = cache.get("directories") ?? "[]";
    return JSON.parse(strData);
  });
  const [projects, setProjects] = useState<Record<string, string>>(() => {
    if (cache.isEmpty) return [];
    const strData = cache.get("gitProjects") ?? "[]";
    return JSON.parse(strData);
  });

  const src = gitProjects ? Object.keys(projects) : dirs;
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
      if (e.code === "ENOENT") {
        await showToast({
          style: Toast.Style.Failure,
          title: "zoxide not found",
          message: "Please install zoxide",
        });
      } else {
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to query zoxide",
          message: e.message,
        });
      }
      return [];
    }
  }

  function getCurrentBranch(directory: string): string {
    try {
      const head = readFileSync(
        path.join(directory, ".git", "HEAD"),
        "utf8",
      ).trim();
      // HEAD contains "ref: refs/heads/main" when on a branch
      return head.startsWith("ref: refs/heads/")
        ? head.replace("ref: refs/heads/", "")
        : head.slice(0, 7); // detached HEAD, show short commit hash
    } catch {
      return ""; // silent broken repos errors, this will show a tag with git but without the branch name
    }
  }

  async function getGitProjects(): Promise<Record<string, string>> {
    const repositories: Record<string, string> = {};
    const directories = await getDirectories();
    directories
      .filter(
        (directory) =>
          existsSync(path.join(directory, ".git")) &&
          statSync(directory).isDirectory(),
      )
      .forEach((directory) => {
        repositories[directory] = getCurrentBranch(directory);
      });
    cache.set("gitProjects", JSON.stringify(repositories));
    return repositories;
  }

  useEffect(() => {
    getGitProjects().then((projects) => {
      setProjects(projects);
      setIsLoading(false);
    });
    getDirectories().then((directories) => {
      setDirs(directories);
      setIsLoading(false);
    });
    getApplications(homedir()).then((apps) => {
      setApps(apps);
      cache.set("apps", JSON.stringify(apps));
    });
  }, [gitProjects]);

  async function openProject(projectPath: string, app: string) {
    try {
      await open(projectPath, app);
      await execa("zoxide", ["add", projectPath]); // increments zoxide score of selected entry
      closeMainWindow({
        clearRootSearch: true,
        popToRootType: PopToRootType.Immediate,
      });
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
      navigationTitle="zoxide entries"
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
      {src.map((dir) => (
        <List.Item
          key={dir}
          icon={Icon.Folder}
          title={dir.split("/").pop() || ""}
          subtitle={dir}
          accessories={
            dir in projects
              ? [
                  {
                    tag: { value: `${projects[dir]}`, color: Color.Green },
                    icon: Icon.Git,
                  },
                ]
              : []
          }
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
