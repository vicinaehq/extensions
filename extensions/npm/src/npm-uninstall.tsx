import { Action, ActionPanel, Color, Icon, List } from "@vicinae/api";
import { NpmErrorDetails } from "./components/NpmErrorDetails";
import { NpmTerminalUsageDetails } from "./components/NpmTerminalUsageDetails";
import { useUninstallPackages } from "./hooks/useUninstallPackages";
import type { Package } from "./types";

export default function NpmUninstall(props: {
  arguments?: {
    path: string;
  };
}) {
  console.log(props);
  const path = props?.arguments?.path;
  if (!path) return <NpmTerminalUsageDetails />;

  const {
    npmCommand,
    packages,
    uninstallPackages,
    onSelectDependency,
    selectedPackages,
    error,
    clearError,
  } = useUninstallPackages(path);

  if (error) {
    return <NpmErrorDetails error={error} clear={clearError} />;
  }
  return (
    <List searchBarPlaceholder="Filter npm packages...">
      <List.Section title="Packages">
        {packages
          .filter((pkg) => !pkg.dev)
          .map((pkg) => (
            <DependencyListItem
              key={pkg.name}
              pkg={pkg}
              npmCommand={npmCommand}
              onSelect={onSelectDependency}
              selected={selectedPackages.some(
                (selected) => selected.name === pkg.name,
              )}
              uninstallPackages={uninstallPackages}
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
              npmCommand={npmCommand}
              onSelect={onSelectDependency}
              selected={selectedPackages.some(
                (selected) => selected.name === pkg.name,
              )}
              uninstallPackages={uninstallPackages}
            />
          ))}
      </List.Section>
    </List>
  );
}

const DependencyListItem = ({
  pkg,
  selected,
  onSelect,
  uninstallPackages,
  npmCommand,
}: {
  pkg: Package;
  selected: boolean;
  onSelect: (pkg: Package) => void;
  uninstallPackages: () => void;
  npmCommand: string;
}) => {
  return (
    <List.Item
      key={pkg.name}
      title={pkg.name}
      icon={selected ? Icon.CheckCircle : Icon.Circle}
      accessories={[
        {
          text: {
            color: Color.Blue,
            value: pkg.version,
          },
        },
      ]}
      actions={
        <ActionPanel>
          <Action
            title={selected ? "Deselect" : "Select"}
            icon={selected ? Icon.Circle : Icon.CheckCircle}
            onAction={() => {
              onSelect(pkg);
            }}
          />
          <Action
            title="Uninstall package"
            icon={Icon.Trash}
            onAction={() => uninstallPackages()}
          />
          <ActionPanel.Section>
            <Action.CopyToClipboard
              title="Copy npm uninstall command"
              content={npmCommand}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
};
