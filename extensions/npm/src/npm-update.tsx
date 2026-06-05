import { Action, ActionPanel, Color, Icon, List } from "@vicinae/api";
import semver from "semver";
import { NpmErrorDetails } from "./components/NpmErrorDetails";
import { NpmTerminalUsageDetails } from "./components/NpmTerminalUsageDetails";
import { useGetVersionUpdate } from "./hooks/useGetVersionUpdate";
import { useUpdatePackages } from "./hooks/useUpdatePackages";
import type { Package } from "./types";

export default function NpmUpdate(props: {
  arguments?: {
    path: string;
  };
}) {
  const path = props?.arguments?.path;
  if (!path) return <NpmTerminalUsageDetails />;

  const {
    packages,
    updatePackages,
    selectedDependencies,
    selectedDevDependencies,
    error,
    clearError,
    onSelectDependency,
    onSelectDevDependency,
    npmCommand,
  } = useUpdatePackages(path);

  if (error) {
    return <NpmErrorDetails error={error} clear={clearError} />;
  }
  return (
    <List>
      <List.Section title="Dependencies">
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
      <List.Section title="Dev Dependencies">
        {packages
          .filter((pkg) => pkg.dev)
          .map((pkg) => (
            <DependencyListItem
              key={pkg.name}
              pkg={pkg}
              updatePackage={updatePackages}
              onSelect={(name) => onSelectDevDependency(name)}
              selected={selectedDevDependencies.includes(pkg.name)}
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
