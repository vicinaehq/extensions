import { Action, ActionPanel, Color, Icon, List } from "@vicinae/api";
import semver from "semver";
import { NpmErrorDetails } from "./components/NpmErrorDetails";
import { NpmTerminalUsageDetails } from "./components/NpmTerminalUsageDetails";
import { useGetVersionUpdate } from "./hooks/useGetVersionUpdate";
import { useUpdatePackages } from "./hooks/useUpdatePackages";
import type { Dependency } from "./types";

export default function NpmUpdate(props: {
  arguments?: {
    pwd: string;
  };
}) {
  const pwd = props?.arguments?.pwd;
  if (!pwd) return <NpmTerminalUsageDetails />;

  const {
    project,
    updatePackages,
    selectedDependencies,
    selectedDevDependencies,
    error,
    clearError,
    onSelectDependency,
    onSelectDevDependency,
    npmCommand,
  } = useUpdatePackages(pwd);

  if (error) {
    return <NpmErrorDetails error={error} clear={clearError} />;
  }
  return (
    <List>
      <List.Section title="Dependencies">
        {project.dependencies
          .filter((dep) => !dep.dev)
          .map((dep) => (
            <DependencyListItem
              key={dep.name}
              dep={dep}
              selected={selectedDependencies.includes(dep.name)}
              updatePackage={updatePackages}
              onSelect={(name) => onSelectDependency(name)}
              npmCommand={npmCommand}
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
              updatePackage={updatePackages}
              onSelect={(name) => onSelectDevDependency(name)}
              selected={selectedDevDependencies.includes(dep.name)}
              npmCommand={npmCommand}
            />
          ))}
      </List.Section>
    </List>
  );
}

const DependencyListItem = ({
  dep,
  updatePackage,
  selected,
  onSelect,
  npmCommand,
}: {
  dep: Dependency;
  updatePackage: () => void;
  selected: boolean;
  onSelect: (dependency: string) => void;
  npmCommand: string;
}) => {
  const { hasUpdate, versionData } = useGetVersionUpdate(dep);
  if (!hasUpdate) return;
  return (
    <List.Item
      key={dep.name}
      title={dep.name}
      icon={selected ? Icon.CheckCircle : Icon.Circle}
      accessories={[
        {
          text: {
            value: `${semver.coerce(dep.version)} → ${versionData?.newVersion}`,
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
              onSelect(dep.name);
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
