import { Action, ActionPanel, Color, Icon, List } from "@vicinae/api";
import { NpmErrorDetails } from "./components/NpmErrorDetails";
import { NpmTerminalUsageDetails } from "./components/NpmTerminalUsageDetails";
import { useUninstallPackages } from "./hooks/useUninstallPackages";
import type { Dependency } from "./types";

export default function NpmUninstall(props: {
  arguments?: {
    pwd: string;
  };
}) {
  const pwd = props?.arguments?.pwd;
  if (!pwd) return <NpmTerminalUsageDetails />;

  const {
    npmCommand,
    project,
    uninstallPackages,
    onSelectDependency,
    selectedDependencies,
    error,
    clearError,
  } = useUninstallPackages(pwd);

  if (error) {
    return <NpmErrorDetails error={error} clear={clearError} />;
  }
  return (
    <List searchBarPlaceholder="Filter npm packages...">
      <List.Section title="Dependencies">
        {project.dependencies
          .filter((dep) => !dep.dev)
          .map((dep) => (
            <DependencyListItem
              key={dep.name}
              dep={dep}
              npmCommand={npmCommand}
              onSelect={onSelectDependency}
              selected={selectedDependencies.includes(dep.name)}
              uninstallPackages={uninstallPackages}
            />
          ))}
      </List.Section>
      <List.Section title="Dev Dependencies">
        {project.dependencies
          .filter((dep) => dep.dev)
          .map((dep) => (
            <DependencyListItem
              key={dep.name}
              dep={dep}
              npmCommand={npmCommand}
              onSelect={onSelectDependency}
              selected={selectedDependencies.includes(dep.name)}
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
  dep: Dependency;
  selected: boolean;
  onSelect: (dependency: string) => void;
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
              onSelect(dep.name);
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
