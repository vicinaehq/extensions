import { Action, ActionPanel, Color, Icon, List } from "@vicinae/api";
import { NpmErrorDetails } from "./components/NpmErrorDetails";
import { useUninstallPackages } from "./hooks/useUninstallPackages";
import { Package } from "./types";

export default function NpmUninstallGlobal() {
  const {
    npmCommand,
    packages,
    uninstallPackages,
    onSelectDependency,
    selectedPackages,
    error,
    clearError,
  } = useUninstallPackages();
  if (error) {
    return <NpmErrorDetails error={error} clear={clearError} />;
  }
  return (
    <List searchBarPlaceholder="Filter npm packages...">
      <List.Section title="Packages">
        {packages
          .filter((dep) => !dep.dev)
          .map((dep) => (
            <DependencyListItem
              key={dep.name}
              dep={dep}
              npmCommand={npmCommand}
              onSelect={onSelectDependency}
              selected={selectedPackages.some(
                (selected) => selected.name === dep.name,
              )}
              uninstallPackages={uninstallPackages}
            />
          ))}
      </List.Section>
      <List.Section title="Dev Dependencies">
        {packages
          .filter((dep) => dep.dev)
          .map((dep) => (
            <DependencyListItem
              key={dep.name}
              dep={dep}
              npmCommand={npmCommand}
              onSelect={onSelectDependency}
              selected={selectedPackages.some(
                (selected) => selected.name === dep.name,
              )}
              uninstallPackages={uninstallPackages}
            />
          ))}
      </List.Section>
    </List>
  );
}

const DependencyListItem = ({
  dep,
  selected,
  onSelect,
  uninstallPackages,
  npmCommand,
}: {
  dep: Package;
  selected: boolean;
  onSelect: (dependency: Package) => void;
  uninstallPackages: () => void;
  npmCommand: string;
}) => {
  return (
    <List.Item
      key={dep.name}
      title={dep.name}
      icon={selected ? Icon.CheckCircle : Icon.Circle}
      accessories={[
        {
          text: {
            color: Color.Blue,
            value: dep.version,
          },
        },
      ]}
      actions={
        <ActionPanel>
          <Action
            title={selected ? "Deselect" : "Select"}
            icon={selected ? Icon.Circle : Icon.CheckCircle}
            onAction={() => {
              onSelect(dep);
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
