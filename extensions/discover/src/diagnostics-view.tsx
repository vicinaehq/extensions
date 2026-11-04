import { useState } from "react";
import { Action, ActionPanel, Detail, Icon, List, environment } from "@vicinae/api";
import { binary, osRelease, run } from "./lib/system";
import { pacmanPlan, searchPacman } from "./lib/pacman";
import { useLoad, PlanAction } from "./ui";

const components = [
  {
    name: "pacman",
    title: "System Packages",
    description: "CachyOS / Arch repositories, installation, removal and full upgrades",
    pkg: "pacman",
  },
  {
    name: "pkexec",
    title: "Authorization",
    description: "Desktop Polkit authentication for system transactions",
    pkg: "polkit",
  },
  {
    name: "checkupdates",
    title: "Fresh Update Checks",
    description: "Check for updates without modifying the system database",
    pkg: "pacman-contrib",
  },
  {
    name: "flatpak",
    title: "Flatpak",
    description: "User and system installations, Flathub and custom remotes",
    pkg: "flatpak",
  },
  {
    name: "fwupdmgr",
    title: "Firmware",
    description: "LVFS / fwupd devices and firmware updates",
    pkg: "fwupd",
  },
  {
    name: "knewstuff-dialog6",
    title: "Plasma Stores",
    description: "KDE themes, widgets and add-on installer",
    pkg: "knewstuff",
  },
  {
    name: "kpackagetool6",
    title: "Plasma Packages",
    description: "Local Plasma packages and removal of user add-ons",
    pkg: "kpackage",
  },
  {
    name: "python3",
    title: "Transaction Runner",
    description: "Transactions continue after Vicinae closes",
    pkg: "python",
  },
];
export function DiagnosticsView() {
  const [revision, setRevision] = useState(0);
  const os = osRelease();
  const { value: version } = useLoad(() => run("vicinae", ["version"]), [revision], "");
  const helper = binary("paru") || binary("yay");
  const report = `# Discover · System and Support\n\nDistribution: ${os.PRETTY_NAME || "Unknown"}\n\n${version}\n\nSDK: @vicinae/api 0.29.2\n\n${components.map((c) => `- ${c.title}: ${binary(c.name) || "not installed"}`).join("\n")}\n- AUR: ${helper || "paru / yay required"}\n\n## Supported features\n\nThis version targets CachyOS and Arch system packages. APT, DNF, rpm-ostree, Snap and PackageKit backends for other distributions are not implemented.\n\nPlasma stores open in a KNewStuff window. AUR builds and system repository editing open in a terminal. Other package transactions start inside Vicinae and their logs are shown here.\n\nDiscover user reviews, rating submission and offline operating system upgrades are not implemented. Firmware updates never automatically reboot the system. Additional named system Flatpak installations are not enumerated.\n\nApplication descriptions and screenshots use system AppStream / PyGObject data when available. Sources are added only when you request them.\n\nData: ${environment.supportPath}`;
  return (
    <List navigationTitle="System and Support">
      <List.Item
        title={os.PRETTY_NAME || "Linux"}
        subtitle={version.split("\n")[0]}
        icon={Icon.Monitor}
        actions={
          <ActionPanel>
            <Action.Push title="Open Support Report" target={<Detail markdown={report} />} />
            <Action.CopyToClipboard title="Copy Report" content={report} />
          </ActionPanel>
        }
      />
      {components.map((c) => (
        <List.Item
          key={c.name}
          title={c.title}
          subtitle={c.description}
          icon={binary(c.name) ? Icon.CheckCircle : Icon.Exclamationmark}
          accessories={[{ tag: binary(c.name) ? "Ready" : "Not installed" }]}
          actions={
            <ActionPanel>
              {!binary(c.name) && binary("pacman") && (
                <PlanAction
                  title={`${c.pkg} Review Installation`}
                  make={async () => {
                    const item = (await searchPacman(c.pkg)).find((p) => p.name === c.pkg);
                    if (!item) throw new Error("Package not found in configured repositories.");
                    return pacmanPlan(item, "install");
                  }}
                />
              )}
              <Action.CopyToClipboard
                title="Copy Component Path"
                content={binary(c.name) || c.name}
              />
              <Action
                title="Refresh Status"
                icon={Icon.ArrowClockwise}
                onAction={() => setRevision((x) => x + 1)}
              />
            </ActionPanel>
          }
        />
      ))}
      <List.Item
        title="AUR"
        subtitle={helper || "paru or yay is not installed"}
        icon={helper ? Icon.CheckCircle : Icon.Exclamationmark}
        actions={
          <ActionPanel>
            <Action.OpenInBrowser
              title="About AUR"
              url="https://wiki.archlinux.org/title/Arch_User_Repository"
            />
          </ActionPanel>
        }
      />
      <List.Item
        title="Supported Features and Limitations"
        icon={Icon.Info01}
        actions={
          <ActionPanel>
            <Action.Push title="Open Report" target={<Detail markdown={report} />} />
          </ActionPanel>
        }
      />
    </List>
  );
}
