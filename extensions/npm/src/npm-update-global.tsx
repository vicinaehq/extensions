import { Action, ActionPanel, Color, Icon, List } from "@vicinae/api";
import semver from "semver";
import { NpmErrorDetails } from "./components/NpmErrorDetails";
import { useGetVersionUpdate } from "./hooks/useGetVersionUpdate";
import { useUpdatePackages } from "./hooks/useUpdatePackages";
import type { Package } from "./types";

export default function NpmUpdateGlobal() {
  const {
    packages,
    updatePackages,
    selectedDependencies,
    error,
    clearError,
    onSelectDependency,
    npmCommand,
  } = useUpdatePackages();

  if (error) {
    return <NpmErrorDetails error={error} clear={clearError} />;
  }
  return (
    <List>
      <List.Section title="Packages">
        {packages
          .filter((pkg) => !pkg.dev)
          .map((pkg) => (
            <DependencyListItem
              key={pkg.name}
              pkg={pkg}
              selected={selectedDependencies.includes(pkg.name)}
              updatePackage={updatePackages}
              onSelect={(name) => onSelectDependency(name)}
              npmCommand={npmCommand}
            />
          ))}
      </List.Section>
    </List>
  );
}

const DependencyListItem = ({
  pkg,
  updatePackage,
  selected,
  onSelect,
  npmCommand,
}: {
  pkg: Package;
  updatePackage: () => void;
  selected: boolean;
  onSelect: (dependency: string) => void;
  npmCommand: string;
}) => {
  const { hasUpdate, versionData } = useGetVersionUpdate(pkg);
  if (!hasUpdate) return;
  return (
    <List.Item
      key={pkg.name}
      title={pkg.name}
      icon={selected ? Icon.CheckCircle : Icon.Circle}
      accessories={[
        {
          text: {
            value: `${semver.coerce(pkg.version)} → ${versionData?.newVersion}`,
            color: Color.Orange,
          },
        },
      ]}
      actions={
        <ActionPanel>
          <Action
            title={selected ? "Deselect" : "Select"}
            icon={selected ? Icon.Circle : Icon.CheckCircle}
            onAction={() => {
              onSelect(pkg.name);
            }}
          />
          <Action
            title="Update packages"
            icon={Icon.Download}
            onAction={() => {
              updatePackage();
            }}
          />
          <ActionPanel.Section>
            <Action.CopyToClipboard
              title="Copy npm update command"
              content={npmCommand}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
};
